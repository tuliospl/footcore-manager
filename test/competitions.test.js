import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advanceWeek, createGameFromDatabase, finishLiveRound } from "../src/core.js";
import { startMatch } from "../src/match.js";
import { completeCompetitionRound, competitionGroups, competitionTable, ensureParallelCompetitions, pendingCompetitionFixture } from "../src/competitions.js";

const database = JSON.parse(readFileSync(new URL("../data/world/database.json", import.meta.url)));

function career(clubName = "Flamengo") {
  const club = database.clubs.find(item => item.name === clubName);
  return createGameFromDatabase(database, club.id, 42, database);
}

function resultFor(fixture, homeGoals = 1, awayGoals = 0) {
  return { ...fixture, homeGoals, awayGoals, playerReports: {} };
}

function finishQuietly(game) {
  for (const match of [game.activeMatch, ...(game.liveRound || [])]) {
    match.minute = match.endMinute;
    match.phase = "finished";
    for (const team of Object.values(match.teams)) for (const playerId of team.participants) team.minutes[playerId] = 0;
  }
  return finishLiveRound(game);
}

test("world careers create national cups and continental competitions in parallel", () => {
  const game = career();
  const competitions = ensureParallelCompetitions(game).items;
  assert.deepEqual(competitions.map(item => item.id), ["copa-brasil", "carabao-cup", "copa-rei", "libertadores", "sul-americana", "champions", "europa-league"]);
  assert.equal(competitions.find(item => item.id === "copa-brasil").participants.length, 64);
  assert.equal(competitions.find(item => item.id === "libertadores").participants.length, 32);
  assert.equal(competitions.find(item => item.id === "sul-americana").participants.length, 32);
  assert.equal(competitions.find(item => item.id === "champions").participants.length, 36);
  assert.equal(competitions.find(item => item.id === "europa-league").participants.length, 36);
  assert.equal(new Set(competitions.find(item => item.id === "libertadores").participants.map(id => game.clubs.find(club => club.id === id).country)).size, 5);
  assert.equal(new Set(competitions.find(item => item.id === "champions").participants.map(id => game.clubs.find(club => club.id === id).country)).size, 9);
  assert.ok(competitions.find(item => item.id === "copa-brasil").participants.includes(game.userClubId));
  assert.ok(competitions.find(item => item.id === "libertadores").participants.includes(game.userClubId));
});

test("continental places use the previous top-flight table and secondary tournaments take the following positions", () => {
  const game = career();
  const league = game.leagues.find(item => item.id === "bra-1");
  const ordered = [...league.clubIds].reverse();
  ordered.forEach((clubId, index) => {
    game.clubs.find(club => club.id === clubId).history = [{ season: 1, leagueId: league.id, position: index + 1 }];
  });
  game.season = 2;
  delete game.competitions;
  const competitions = ensureParallelCompetitions(game).items;
  const brazilianParticipants = id => competitions.find(item => item.id === id).participants.filter(clubId => game.clubs.find(club => club.id === clubId).country === "BRA");
  assert.deepEqual(brazilianParticipants("libertadores"), ordered.slice(0, 8));
  assert.deepEqual(brazilianParticipants("sul-americana"), ordered.slice(8, 18));
  assert.equal(new Set([...brazilianParticipants("libertadores"), ...brazilianParticipants("sul-americana")]).size, 18);
});

test("Libertadores has eight groups, six matches per club and sends the top two to the round of 16", () => {
  const game = career();
  const competition = ensureParallelCompetitions(game).items.find(item => item.id === "libertadores");
  assert.equal(competitionGroups(competition).length, 8);
  assert.ok(competition.groups.every(group => group.clubIds.length === 4));
  assert.equal(competition.phaseRounds.length, 6);
  const appearances = new Map();
  for (const round of competition.phaseRounds) for (const fixture of round) {
    appearances.set(fixture.homeId, (appearances.get(fixture.homeId) || 0) + 1);
    appearances.set(fixture.awayId, (appearances.get(fixture.awayId) || 0) + 1);
  }
  assert.ok([...appearances.values()].every(total => total === 6));
  for (let round = 0; round < 6; round += 1) completeCompetitionRound(game, competition.id, competition.currentFixtures.map(fixture => resultFor(fixture)));
  assert.equal(competition.phase, "knockout");
  assert.equal(competition.knockoutIds.length, 16);
  assert.equal(competition.currentFixtures.length, 8);
});

test("Champions and Europa use an eight-match league phase with top-eight and playoff qualification", () => {
  const game = career("Liverpool");
  for (const id of ["champions", "europa-league"]) {
    const competition = ensureParallelCompetitions(game).items.find(item => item.id === id);
    assert.equal(competition.phaseRounds.length, 8);
    assert.equal(competitionTable(competition).length, 36);
    const appearances = new Map();
    for (const round of competition.phaseRounds) for (const fixture of round) {
      appearances.set(fixture.homeId, (appearances.get(fixture.homeId) || 0) + 1);
      appearances.set(fixture.awayId, (appearances.get(fixture.awayId) || 0) + 1);
    }
    assert.ok([...appearances.values()].every(total => total === 8));
    for (let round = 0; round < 8; round += 1) completeCompetitionRound(game, id, competition.currentFixtures.map(fixture => resultFor(fixture)));
    assert.equal(competition.phase, "playoff");
    assert.equal(competition.directIds.length, 8);
    assert.equal(competition.knockoutIds.length, 16);
    assert.equal(competition.currentFixtures.length, 8);
  }
});

test("a scheduled cup match is played without advancing the main league round", () => {
  const game = career();
  assert.equal(advanceWeek(game).ok, true);
  const leagueWeek = game.week;
  const fixture = pendingCompetitionFixture(game);
  assert.equal(fixture.competitionId, "copa-brasil");
  assert.equal(startMatch(game).ok, true);
  assert.equal(game.activeMatch.competitionId, "copa-brasil");
  assert.equal(finishQuietly(game).ok, true);
  assert.equal(game.week, leagueWeek);
  assert.equal(ensureParallelCompetitions(game).items.find(item => item.id === "copa-brasil").history.length, 1);
  assert.equal(pendingCompetitionFixture(game).competitionId, "libertadores");
});
