import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub, getClub, getLineup, injuryFromRoll, finishLiveRound, advanceWeek, buyPlayer, sellPlayer, makeTransferOffer, acceptClubListing, startNextSeason, setMarkingIntensity } from "../src/core.js";
import { startMatch, resumeMatch, pauseMatch, advanceMatchMinute, moveMatchPlayer, substitutePlayer, setPenaltyTaker, takePenalty } from "../src/match.js";

function fixture(seed = 42) {
  const game = createGame(seed);
  assert.equal(startMatch(game).ok, true);
  return game;
}

function tick(game) {
  const phase = game.activeMatch.phase;
  if (phase === "penalty") return takePenalty(game);
  if (["ready", "paused", "halftime"].includes(phase)) {
    const team = game.activeMatch.teams[game.userClubId];
    if (!team.slots[0]) moveMatchPlayer(game, team.onField[0], 0);
    resumeMatch(game);
  }
  return advanceMatchMinute(game);
}

function finish(game) {
  for (let count = 0; count < 200 && game.activeMatch.phase !== "finished"; count++) tick(game);
  assert.equal(game.activeMatch.phase, "finished");
}

function finishQuietRound(game, yellowPlayerId) {
  for (const match of [game.activeMatch, ...game.liveRound]) {
    match.minute = match.endMinute;
    match.phase = "finished";
    for (const team of Object.values(match.teams)) for (const id of team.participants) team.minutes[id] = 0;
  }
  if (yellowPlayerId) game.activeMatch.events.push({ minute: 80, type: "yellow", clubId: game.userClubId, playerId: yellowPlayerId, message: "Cartão amarelo." });
  return finishLiveRound(game);
}

test("three accumulated yellows suspend one match and injury severity defines recovery time", () => {
  const game = fixture(19);
  const player = getLineup(getUserClub(game)).find(item => item.position !== "GOL");
  for (let cards = 1; cards <= 3; cards++) {
    assert.equal(finishQuietRound(game, player.id).ok, true);
    if (cards < 3) {
      assert.equal(player.yellowCardAccumulation, cards);
      assert.equal(player.suspensionMatches, 0);
      assert.equal(startMatch(game).ok, true);
    }
  }
  assert.equal(player.yellowCardAccumulation, 0);
  assert.equal(player.suspensionMatches, 1);
  assert.equal(player.suspensionReason, "yellow");
  assert.ok(!getLineup(getUserClub(game)).some(item => item.id === player.id));
  assert.deepEqual(injuryFromRoll(0.2, 0.9), { label: "Lesão leve", matches: 1 });
  assert.deepEqual(injuryFromRoll(0.7, 0.9), { label: "Lesão moderada", matches: 3 });
  assert.deepEqual(injuryFromRoll(0.95, 0.9), { label: "Lesão grave", matches: 6 });
});

test("live match pauses without advancing and blocks duplicate starts or early finalization", () => {
  const game = fixture();
  const before = JSON.stringify(game);
  assert.equal(startMatch(game).ok, false);
  assert.equal(advanceMatchMinute(game).ok, false);
  assert.equal(finishLiveRound(game).ok, false);
  assert.equal(advanceWeek(game).ok, false);
  assert.equal(JSON.stringify(game), before);
  resumeMatch(game);
  advanceMatchMinute(game);
  if (game.activeMatch.phase === "playing") pauseMatch(game);
  const stopped = JSON.stringify(game);
  assert.equal(advanceMatchMinute(game).ok, false);
  assert.equal(JSON.stringify(game), stopped);
  assert.equal(game.week, 0);
  assert.ok(game.table.every(row => row.played === 0));
});

test("substitutions use the bench once, preserve team size, reset taker and enforce five changes", () => {
  const game = fixture();
  const club = getUserClub(game);
  const team = game.activeMatch.teams[club.id];
  resumeMatch(game);
  assert.equal(substitutePlayer(game, team.onField[1], team.bench[0]).ok, false);
  pauseMatch(game);
  const bench = [...team.bench];
  let firstOut;
  for (const inId of bench) {
    const incoming = club.squad.find(player => player.id === inId);
    const outId = team.onField.find(id => club.squad.find(player => player.id === id).position === incoming.position);
    if (!firstOut) firstOut = outId;
    setPenaltyTaker(game, outId);
    assert.equal(substitutePlayer(game, outId, inId).ok, true);
    assert.ok(!team.onField.includes(outId));
    assert.ok(!team.bench.includes(outId));
    assert.ok(team.onField.includes(inId));
    assert.ok(team.onField.includes(team.takerId));
    assert.equal(team.energy[inId], 100);
  }
  assert.equal(team.substitutions, 5);
  assert.equal(new Set(team.onField).size, 11);
  assert.equal(substitutePlayer(game, team.onField[0], firstOut).ok, false);
  assert.equal(setPenaltyTaker(game, firstOut).ok, false);
});

test("goalkeeper cannot be replaced by an outfield player while no other keeper remains", () => {
  const game = fixture();
  const club = getUserClub(game);
  const team = game.activeMatch.teams[club.id];
  resumeMatch(game); pauseMatch(game);
  const keeper = team.onField.find(id => club.squad.find(player => player.id === id).position === "GOL");
  const outfield = team.bench.find(id => club.squad.find(player => player.id === id).position !== "GOL");
  assert.equal(substitutePlayer(game, keeper, outfield).ok, false);
});

test("selected penalty taker takes the kick, without an assist or duplicate resolution", () => {
  const game = fixture();
  const match = game.activeMatch;
  const team = match.teams[game.userClubId];
  const takerId = team.onField[9];
  match.minute = 45;
  match.phase = "penalty";
  match.pendingPenalty = { clubId: game.userClubId };
  assert.equal(setPenaltyTaker(game, takerId).ok, true);
  const waiting = JSON.stringify(game);
  assert.equal(advanceMatchMinute(game).ok, false);
  assert.equal(JSON.stringify(game), waiting);
  assert.equal(takePenalty(game).ok, true);
  const event = match.events.find(item => ["goal", "penalty-miss"].includes(item.type));
  assert.equal(event.scorerId || event.playerId, takerId);
  if (event.type === "goal") { assert.equal(event.assisterId, null); assert.equal(event.penalty, true); }
  assert.equal(match.phase, "halftime");
  assert.equal(match.pendingPenalty, null);
  const after = JSON.stringify(game);
  assert.equal(takePenalty(game).ok, false);
  assert.equal(JSON.stringify(game), after);
});

test("penalty on the final minute must resolve before full time", () => {
  const game = fixture();
  const match = game.activeMatch;
  match.minute = match.endMinute;
  match.phase = "penalty";
  match.pendingPenalty = { clubId: game.userClubId };
  assert.equal(finishLiveRound(game).ok, false);
  assert.equal(takePenalty(game).ok, true);
  assert.equal(match.phase, "finished");
  assert.equal(finishLiveRound(game).ok, true);
});

test("second yellow removes the player, forbids substitution and later participation", () => {
  const game = fixture();
  const match = game.activeMatch;
  for (const team of Object.values(match.teams)) for (const id of team.onField) team.yellows[id] = 1;
  finish(game);
  const red = match.events.find(event => event.type === "red" && event.secondYellow);
  assert.ok(red);
  const team = match.teams[red.clubId];
  assert.ok(team.sentOff.includes(red.playerId));
  assert.ok(!team.onField.includes(red.playerId));
  assert.ok(!team.bench.includes(red.playerId));
  const later = match.events.slice(match.events.indexOf(red) + 1);
  assert.ok(later.every(event => event.scorerId !== red.playerId && event.assisterId !== red.playerId && event.inId !== red.playerId));
  assert.equal(finishLiveRound(game).ok, true);
  const player = getClub(game, red.clubId).squad.find(item => item.id === red.playerId);
  assert.equal(player.suspensionMatches, 1);
  assert.equal(player.suspensionReason, "red");
  assert.ok(!getLineup(getClub(game, red.clubId)).some(item => item.id === player.id));
  assert.equal(advanceWeek(game).ok, true);
  assert.equal(player.suspensionMatches, 0);
});

test("seeded matches produce penalties, cards, misses and AI substitutions", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const game = fixture(seed);
    finish(game);
    for (const event of game.activeMatch.events) seen.add(event.type === "red" ? event.secondYellow ? "second-yellow" : "direct-red" : event.type);
  }
  for (const type of ["penalty", "yellow", "direct-red", "penalty-miss", "goal", "substitution"]) assert.ok(seen.has(type), type);
});

test("live match discipline stays controlled across a large sample", () => {
  let yellows = 0;
  let reds = 0;
  const matches = 120;
  for (let seed = 1000; seed < 1000 + matches; seed++) {
    const game = fixture(seed);
    finish(game);
    yellows += game.activeMatch.events.filter(event => event.type === "yellow").length;
    reds += game.activeMatch.events.filter(event => event.type === "red").length;
  }
  assert.ok(yellows / matches >= 1.2 && yellows / matches <= 2.6);
  assert.ok(reds / matches <= 0.12);
});

test("marking intensity trades discipline and energy for tackles and defensive protection", () => {
  const totals = {};
  for (const intensity of ["leve", "pesada"]) {
    totals[intensity] = { yellows: 0, tackles: 0, goals: 0, energy: 0 };
    for (let seed = 2000; seed < 2080; seed++) {
      const game = fixture(seed);
      for (const club of game.clubs) club.markingIntensity = intensity;
      finish(game);
      const events = game.activeMatch.events;
      totals[intensity].yellows += events.filter(event => event.type === "yellow").length;
      totals[intensity].tackles += events.filter(event => event.type === "tackle").length;
      totals[intensity].goals += game.activeMatch.homeGoals + game.activeMatch.awayGoals;
      totals[intensity].energy += Object.values(game.activeMatch.teams[game.userClubId].energy).reduce((sum, value) => sum + value, 0);
    }
  }
  assert.ok(totals.pesada.yellows > totals.leve.yellows * 2);
  assert.ok(totals.pesada.tackles > totals.leve.tackles * 1.5);
  assert.ok(totals.pesada.goals < totals.leve.goals);
  assert.ok(totals.pesada.energy < totals.leve.energy);
  const game = createGame(9);
  assert.equal(setMarkingIntensity(game, "pesada").ok, true);
  assert.equal(getUserClub(game).markingIntensity, "pesada");
  assert.equal(setMarkingIntensity(game, "inexistente").ok, false);
});

test("save and reload resumes the same match with identical outcomes", () => {
  const game = fixture(123);
  for (let index = 0; index < 25; index++) tick(game);
  const saved = JSON.parse(JSON.stringify(game));
  finish(game); finish(saved);
  assert.deepEqual(saved.activeMatch, game.activeMatch);
});

test("finishing commits player statistics, all fixtures and finances exactly once", () => {
  const game = fixture();
  const club = getUserClub(game);
  const match = game.activeMatch;
  const team = match.teams[club.id];
  const budget = club.budget;
  const payroll = club.squad.reduce((sum, player) => sum + player.salary, 0);
  finish(game);
  assert.ok(club.squad.every(player => player.appearances === 0 && player.goals === 0));
  assert.equal(finishLiveRound(game).ok, true);
  assert.equal(game.week, 1);
  assert.equal(game.activeMatch, undefined);
  assert.ok(game.table.every(row => row.played === 1));
  const ownResult = game.lastRound.find(result => result.homeId === club.id || result.awayId === club.id);
  assert.equal(club.budget, budget - payroll + (ownResult.homeId === club.id ? ownResult.income : 0));
  for (const player of club.squad) {
    assert.equal(player.appearances, team.participants.includes(player.id) ? 1 : 0);
    assert.equal(player.goals, match.events.filter(event => event.scorerId === player.id).length);
    assert.equal(player.assists, match.events.filter(event => event.assisterId === player.id).length);
    assert.equal(player.yellowCards, match.events.filter(event => event.type === "yellow" && event.playerId === player.id).length);
  }
  const final = JSON.stringify(game);
  assert.equal(finishLiveRound(game).ok, false);
  assert.equal(JSON.stringify(game), final);
});

test("market transactions are blocked during matches, including while paused", () => {
  const game = fixture();
  const club = getUserClub(game);
  const opponent = getClub(game, game.activeMatch.awayId);
  const before = JSON.stringify(game);
  assert.equal(buyPlayer(game, game.market[0].id).ok, false);
  assert.equal(sellPlayer(game, club.squad[0].id).ok, false);
  assert.equal(makeTransferOffer(game, opponent.id, opponent.squad[0].id, 1_000_000).ok, false);
  assert.equal(acceptClubListing(game, opponent.id, opponent.squad[0].id, "fixed", 1_000_000).ok, false);
  assert.equal(startNextSeason(game).ok, false);
  assert.equal(JSON.stringify(game), before);
});

test("complete live season reaches final table and next season without double counting", () => {
  const game = createGame(84);
  for (let round = 0; round < 14; round++) { startMatch(game); finish(game); assert.equal(finishLiveRound(game).ok, true); }
  assert.equal(game.finished, true);
  assert.ok(game.table.every(row => row.played === 14));
  assert.equal(startNextSeason(game).ok, true);
  assert.equal(game.season, 2);
  assert.ok(game.clubs.every(club => club.squad.every(player => player.goals === 0 && player.assists === 0 && player.yellowCards === 0 && player.redCards === 0)));
});
