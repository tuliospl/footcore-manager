import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advanceWeek, createGameFromDatabase, finishLiveRound } from "../src/core.js";
import { startMatch } from "../src/match.js";
import { completeCompetitionRound, competitionGroups, competitionTable, ensureParallelCompetitions, pendingCompetitionFixture } from "../src/competitions.js";
import { CLUB_WORLD_CUP_SLOTS, rankingPointsForResult, selectClubWorldCupParticipants, stageRankingBonus } from "../src/world-club-competitions.js";

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
  assert.deepEqual(competitions.map(item => item.id), ["copa-brasil", "carabao-cup", "copa-rei", "libertadores", "sul-americana", "champions", "europa-league", "intercontinental"]);
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

test("the annual Intercontinental Cup uses six champions, five matches and sends UEFA directly to the final", () => {
  const game = career();
  const competition = ensureParallelCompetitions(game).items.find(item => item.id === "intercontinental");
  assert.equal(competition.participants.length, 6);
  assert.equal(new Set(Object.keys(competition.confederationEntrants)).size, 6);
  assert.equal(competition.currentFixtures.length, 2);
  assert.ok(competition.currentFixtures.every(fixture => ![fixture.homeId, fixture.awayId].includes(competition.confederationEntrants.UEFA)));
  let matches = 0;
  while (!competition.finished) {
    matches += competition.currentFixtures.length;
    completeCompetitionRound(game, competition.id, competition.currentFixtures.map(fixture => resultFor(fixture)));
    if (competition.phase === "intercontinental-final" && !competition.finished) assert.ok(competition.currentFixtures[0].awayId === competition.confederationEntrants.UEFA || competition.currentFixtures[0].homeId === competition.confederationEntrants.UEFA);
  }
  assert.equal(matches, 5);
});

test("the expanded Club World Cup appears every four years with the official 32-slot distribution", () => {
  const game = career();
  assert.equal(ensureParallelCompetitions(game).items.some(item => item.id === "club-world-cup"), false);
  game.worldSeason = 2029;
  game.season = 4;
  delete game.competitions;
  const competition = ensureParallelCompetitions(game).items.find(item => item.id === "club-world-cup");
  assert.ok(competition);
  assert.equal(competition.participants.length, 32);
  assert.deepEqual(Object.fromEntries(competition.qualification.map(item => [item.confederation === "País-sede" ? "HOST" : item.confederation, item.slots])), CLUB_WORLD_CUP_SLOTS);
  assert.equal(competition.groups.length, 8);
  assert.ok(competition.groups.every(group => group.clubIds.length === 4));
  assert.equal(competition.phaseRounds.length, 3);
  const appearances = new Map();
  for (const round of competition.phaseRounds) for (const fixture of round) {
    appearances.set(fixture.homeId, (appearances.get(fixture.homeId) || 0) + 1);
    appearances.set(fixture.awayId, (appearances.get(fixture.awayId) || 0) + 1);
  }
  assert.ok([...appearances.values()].every(total => total === 3));
  for (let round = 0; round < 3; round += 1) completeCompetitionRound(game, competition.id, competition.currentFixtures.map(fixture => resultFor(fixture)));
  assert.equal(competition.phase, "knockout");
  assert.equal(competition.knockoutIds.length, 16);
});

test("Club World Cup ranking applies the country cap and FIFA cycle scoring", () => {
  const game = career();
  const selection = selectClubWorldCupParticipants(game, 2029);
  assert.equal(selection.participants.length, 32);
  assert.equal(new Set(selection.participants.map(item => item.clubId)).size, 32);
  for (const confederation of ["UEFA", "CONMEBOL", "AFC", "CAF", "CONCACAF", "OFC"]) {
    const entries = selection.participants.filter(item => item.confederation === confederation);
    assert.equal(entries.length, CLUB_WORLD_CUP_SLOTS[confederation]);
    const countries = new Map();
    for (const entry of entries) {
      const country = (game.clubs.find(club => club.id === entry.clubId) || game.externalClubs.find(club => club.id === entry.clubId)).country;
      countries.set(country, (countries.get(country) || 0) + 1);
    }
    for (const [country, total] of countries) {
      if (total <= 2) continue;
      assert.ok(entries.filter(entry => (game.clubs.find(club => club.id === entry.clubId) || game.externalClubs.find(club => club.id === entry.clubId)).country === country).every(entry => entry.route === "Campeão continental"));
    }
  }
  assert.equal(rankingPointsForResult("UEFA", 2, 1), 2);
  assert.equal(rankingPointsForResult("CONMEBOL", 2, 1), 3);
  assert.equal(rankingPointsForResult("AFC", 1, 1), 1);
  assert.equal(stageRankingBonus("UEFA", "league-entry"), 4);
  assert.equal(stageRankingBonus("UEFA", "round-of-16"), 5);
  assert.equal(stageRankingBonus("CONMEBOL", "round-of-16"), 3);
});

test("the expanded tournament is absent outside its four-year cycle", () => {
  const game = career();
  for (const year of [2026, 2027, 2028, 2030, 2031, 2032]) {
    game.worldSeason = year;
    game.season = year - 2025;
    delete game.competitions;
    assert.equal(ensureParallelCompetitions(game).items.some(item => item.id === "club-world-cup"), false);
  }
  game.worldSeason = 2033;
  game.season = 8;
  delete game.competitions;
  assert.equal(ensureParallelCompetitions(game).items.some(item => item.id === "club-world-cup"), true);
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

test("parallel competitions award scorer, assister and best player from their own matches", () => {
  const game = career();
  const competition = ensureParallelCompetitions(game).items.find(item => item.id === "copa-brasil");
  const club = game.clubs.find(item => item.id === game.userClubId);
  const player = club.squad[0];
  const initialBudget = club.budget;
  const initialOverall = player.overall;
  while (!competition.finished) {
    const results = competition.currentFixtures.map(fixture => {
      const userHome = fixture.homeId === club.id;
      const userAway = fixture.awayId === club.id;
      return {
        ...fixture,
        homeGoals: userAway ? 0 : userHome ? 3 : 1,
        awayGoals: userAway ? 3 : 0,
        playerReports: userHome || userAway ? { [club.id]: [{ id: player.id, minutes: 90, goals: 2, assists: 1, yellows: 0, red: false, rating: 8.5 }] } : {}
      };
    });
    completeCompetitionRound(game, competition.id, results);
  }
  assert.equal(competition.awards.length, 3);
  assert.ok(competition.awards.every(award => award.playerId === player.id));
  assert.ok(competition.awards.every(award => award.competitionId === competition.id));
  assert.ok(player.awards.filter(award => award.competitionId === competition.id).length === 3);
  assert.ok(club.budget > initialBudget + competition.championPrize);
  assert.ok(player.overall >= initialOverall);
  assert.equal(game.competitions.history[0].awards.length, 3);
});
