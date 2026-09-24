import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub, getLineup, finishLiveRound, startNextSeason, advanceWeek } from "../src/core.js";
import { startMatch, resumeMatch, pauseMatch, advanceMatchMinute, takePenalty, ensureLiveRound, liveRoundMatches, moveMatchPlayer } from "../src/match.js";
import { averageRating, playerMatchStats, matchReport } from "../src/ratings.js";
import { renderRound } from "../src/round-view.js";

function setup() { const game = createGame(42); startMatch(game); return game; }
function tick(game) {
  if (game.activeMatch.phase === "penalty") takePenalty(game);
  else { if (game.activeMatch.phase !== "playing") resumeMatch(game); advanceMatchMinute(game); }
}
function finish(game) { for (let i = 0; i < 200 && game.activeMatch.phase !== "finished"; i++) tick(game); }

test("all fixtures advance together, pause together and keep scores through reload", () => {
  const game = setup();
  assert.equal(liveRoundMatches(game).length, 4);
  for (let i = 0; i < 30; i++) tick(game);
  assert.ok(liveRoundMatches(game).every(match => match.minute === game.activeMatch.minute));
  if (game.activeMatch.phase === "playing") pauseMatch(game);
  const before = JSON.stringify(game);
  assert.equal(advanceMatchMinute(game).ok, false);
  assert.equal(JSON.stringify(game), before);
  const saved = JSON.parse(before);
  ensureLiveRound(saved);
  finish(game); finish(saved);
  assert.deepEqual(saved, game);
  assert.ok(liveRoundMatches(game).every(match => match.phase === "finished"));
});

test("finalizing preserves displayed scores and records every club's ratings exactly once", () => {
  const game = setup(); finish(game);
  const reports = liveRoundMatches(game).map(match => matchReport(game, match));
  assert.ok(game.clubs.every(club => club.squad.every(player => !player.ratedMatches)));
  assert.equal(finishLiveRound(game).ok, true);
  for (const report of reports) {
    const result = game.lastRound.find(item => item.homeId === report.homeId);
    assert.equal(result.homeGoals, report.homeGoals);
    assert.equal(result.awayGoals, report.awayGoals);
    assert.deepEqual(result.playerReports, report.playerReports);
    for (const [clubId, stats] of Object.entries(result.playerReports)) for (const stat of stats) {
      const player = game.clubs.find(club => club.id === clubId).squad.find(item => item.id === stat.id);
      assert.equal(player.ratedMatches, stat.rating == null ? 0 : 1);
      assert.equal(averageRating(player), stat.rating);
    }
  }
  const before = JSON.stringify(game);
  assert.equal(finishLiveRound(game).ok, false);
  assert.equal(JSON.stringify(game), before);
});

test("ratings reflect contributions and stop changing after a player leaves", () => {
  const game = setup(); const match = game.activeMatch; const club = getUserClub(game); const team = match.teams[club.id];
  const player = club.squad.find(item => item.id === team.onField.find(id => club.squad.find(p => p.id === id).position === "MC"));
  match.minute = 20; team.minutes[player.id] = 20; match.phase = "paused";
  const base = playerMatchStats(match, club.id, player).rating;
  match.events.push({ type: "goal", clubId: club.id, scorerId: player.id, minute: 10 });
  assert.equal(playerMatchStats(match, club.id, player).rating, base + 1.2);
  match.events.push({ type: "yellow", clubId: club.id, playerId: player.id, minute: 12 });
  assert.ok(playerMatchStats(match, club.id, player).rating < base + 1.2);
  const incoming = club.squad.find(p => team.bench.includes(p.id) && p.position === "MC");
  assert.equal(moveMatchPlayer(game, incoming.id, team.slots.indexOf(player.id)).ok, true);
  const left = playerMatchStats(match, club.id, player);
  match.minute = 80;
  match.events.push({ type: "goal", clubId: match.awayId, scorerId: "opponent", minute: 60 });
  assert.equal(playerMatchStats(match, club.id, player).rating, left.rating);
  assert.equal(playerMatchStats(match, club.id, player).minutes, 20);
  const unused = club.squad.find(p => team.bench.includes(p.id));
  assert.equal(playerMatchStats(match, club.id, unused).rating, null);
});

test("legacy seasons do not count old appearances in their average and reset for a new season", () => {
  const game = createGame(72);
  const player = getLineup(getUserClub(game))[0];
  player.appearances = 10; delete player.ratingTotal; delete player.ratedMatches;
  assert.equal(averageRating(player), null);
  advanceWeek(game);
  assert.equal(player.ratedMatches, 1);
  assert.equal(averageRating(player), player.ratingTotal);
  while (!game.finished) advanceWeek(game);
  assert.equal(startNextSeason(game).ok, true);
  assert.ok(game.clubs.every(club => club.squad.every(p => p.ratedMatches === 0 && p.ratingTotal === 0)));
});

test("legacy active matches gain live fixtures and elapsed minutes without altering own events", () => {
  const game = setup(); for (let i = 0; i < 15; i++) tick(game);
  delete game.liveRound;
  for (const team of Object.values(game.activeMatch.teams)) delete team.minutes;
  const ownEvents = JSON.stringify(game.activeMatch.events);
  ensureLiveRound(game);
  assert.equal(JSON.stringify(game.activeMatch.events), ownEvents);
  assert.ok(game.liveRound.every(match => match.minute === game.activeMatch.minute));
  assert.ok(Object.values(game.activeMatch.teams[game.userClubId].minutes).every(minute => minute === game.activeMatch.minute));
});

test("featured match keeps every highlight and shows newest events first", () => {
  const game = setup();
  game.activeMatch.events = Array.from({ length: 5 }, (_, index) => ({
    type: "yellow",
    clubId: game.activeMatch.homeId,
    minute: (index + 1) * 10,
    message: `Evento ${index + 1}`
  }));
  const overview = renderRound(game, 1000, null, "stats", null);
  for (let index = 1; index <= 5; index++) assert.ok(overview.includes(`Evento ${index}`));
  assert.ok(overview.indexOf("Evento 5") < overview.indexOf("Evento 4"));
  assert.ok(overview.indexOf("Evento 4") < overview.indexOf("Evento 1"));
});

test("round overview hides the board and other fixtures only expose information", () => {
  const game = setup();
  const overview = renderRound(game, 1000, null, "stats", null);
  assert.equal((overview.match(/data-round-match=/g) || []).length, 3);
  assert.ok(!overview.includes(`data-round-match="${game.activeMatch.homeId}"`));
  assert.ok(overview.includes(`data-featured-match="${game.activeMatch.homeId}"`));
  assert.ok(!overview.includes("data-match-player="));
  const other = game.liveRound[0];
  const info = renderRound(game, 1000, other.homeId, "tactics", null);
  assert.ok(info.includes("Somente consulta"));
  assert.ok(info.includes("ratings-table"));
  assert.ok(!info.includes("data-formation="));
  const own = renderRound(game, 1000, game.activeMatch.homeId, "tactics", null);
  assert.ok(own.includes("data-formation="));
  assert.ok(own.includes("Nota —"));
  finish(game); finishLiveRound(game);
  const archived = renderRound(game, 1000, other.homeId, "stats", null, true);
  assert.ok(archived.includes("ratings-table"));
  assert.ok(!archived.includes("data-formation="));
  delete game.lastRound[0].playerReports;
  assert.doesNotThrow(() => renderRound(game, 1000, game.lastRound[0].homeId, "stats", null, true));
});
