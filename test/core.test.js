import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceWeek,
  buyPlayer,
  createGame,
  getLineup,
  getSortedTable,
  getUserClub,
  normalizeMidfieldPositions,
  seasonTeam,
  sellPlayer,
  startNextSeason,
  stadiumUpgradeCost,
  upgradeStadium
} from "../src/core.js";

test("MC is the only attacking midfield position and legacy MEI players migrate", () => {
  const game = createGame(12);
  assert.equal(game.clubs.flatMap(club => club.squad).some(player => player.position === "MEI"), false);
  game.clubs[0].squad[0].position = "MEI";
  game.market[0].position = "MEI";
  assert.equal(normalizeMidfieldPositions(game), true);
  assert.equal(game.clubs[0].squad[0].position, "MC");
  assert.equal(game.market[0].position, "MC");
  assert.equal(normalizeMidfieldPositions(game), false);
});

test("creates a complete league and schedule", () => {
  const game = createGame(42);
  assert.equal(game.clubs.length, 8);
  assert.equal(game.schedule.length, 14);
  assert.equal(game.schedule[0].length, 4);
  assert.equal(getUserClub(game).squad.length, 16);
});

test("team of the season requires participation in at least 40 percent of league rounds", () => {
  const game = createGame(43);
  for (const player of game.clubs.flatMap(club => club.squad)) {
    player.appearances = 10;
    player.ratedMatches = 10;
    player.ratingTotal = 65;
  }
  const cameo = game.clubs[0].squad.find(player => player.position === "GOL");
  cameo.appearances = 5;
  cameo.ratedMatches = 5;
  cameo.ratingTotal = 50;
  const selected = seasonTeam(game);
  assert.equal(selected.length, 11);
  assert.ok(selected.every(player => player.appearances >= 6));
  assert.ok(!selected.some(player => player.playerId === cameo.id));
});

test("all clubs start with a balanced eleven and only starters play or score", () => {
  const game = createGame(71);
  const selected = new Map(game.clubs.map(club => [club.id, new Set(getLineup(club).map(player => player.id))]));
  for (const club of game.clubs) {
    const starters = getLineup(club);
    assert.equal(starters.length, 11);
    assert.equal(starters.filter(player => player.position === "GOL").length, 1);
    assert.equal(starters.filter(player => player.position === "ZAG").length, 2);
    assert.equal(starters.filter(player => player.position === "LAT").length, 2);
  }
  advanceWeek(game);
  for (const club of game.clubs) {
    for (const player of club.squad) {
      assert.equal(player.appearances, selected.get(club.id).has(player.id) ? 1 : 0);
      if (!selected.get(club.id).has(player.id)) assert.equal(player.goals, 0);
    }
    const result = game.lastRound.find(match => match.homeId === club.id || match.awayId === club.id);
    assert.equal(club.squad.reduce((sum, player) => sum + player.goals, 0), result.homeId === club.id ? result.homeGoals : result.awayGoals);
  }
});

test("season rollover preserves standings history and resets player statistics", () => {
  const game = createGame(52);
  const club = getUserClub(game);
  const player = club.squad[0];
  player.age = 23;
  player.overall = player.potential;
  player.value = 1;
  while (!game.finished) advanceWeek(game);
  assert.equal(player.age, 24);
  assert.ok(player.value > 1);
  assert.equal(club.history.length, 1);
  assert.equal(club.history[0].position, getSortedTable(game).findIndex(row => row.clubId === club.id) + 1);
  assert.equal(club.history[0].played, 14);
  assert.ok(club.squad.some(player => player.appearances > 0));
  assert.equal(player.seasonHistory.length, 1);
  assert.equal(player.seasonHistory[0].season, game.season);
  assert.equal(player.seasonHistory[0].clubName, club.name);
  assert.equal(player.seasonHistory[0].appearances, player.appearances);
  assert.equal(player.seasonHistory[0].goals, player.goals);
  assert.equal(player.seasonHistory[0].assists, player.assists);
  assert.equal(player.seasonHistory[0].yellowCards, player.yellowCards);
  assert.equal(player.seasonHistory[0].redCards, player.redCards);
  assert.equal(player.seasonHistory[0].ratingTotal, player.ratingTotal);
  assert.equal(player.seasonHistory[0].ratedMatches, player.ratedMatches);
  const finalState = JSON.stringify(game);
  assert.equal(advanceWeek(game).ok, false);
  assert.equal(JSON.stringify(game), finalState);
  startNextSeason(game);
  assert.ok(game.clubs.every(club => club.squad.every(player => player.goals === 0 && player.appearances === 0)));
  assert.equal(player.seasonHistory.length, 1);
  assert.equal(club.history[0].played, 14);
  assert.equal(game.table[0].played, 0);
});

test("transfers reject insufficient funds and protect the last goalkeeper without changing state", () => {
  const game = createGame(42);
  const club = getUserClub(game);
  club.budget = 0;
  const before = JSON.stringify(game);
  assert.equal(buyPlayer(game, game.market[0].id).ok, false);
  assert.equal(JSON.stringify(game), before);
  const keepers = club.squad.filter(player => player.position === "GOL");
  assert.equal(sellPlayer(game, keepers[0].id).ok, true);
  const afterSale = JSON.stringify(game);
  assert.equal(sellPlayer(game, keepers[1].id).ok, false);
  assert.equal(JSON.stringify(game), afterSale);
});

test("stadium upgrades stop at level five without charging again", () => {
  const game = createGame(42);
  const club = getUserClub(game);
  club.budget = 100_000_000;
  while (club.stadium.level < 5) assert.equal(upgradeStadium(game).ok, true);
  const before = JSON.stringify(game);
  assert.equal(upgradeStadium(game).ok, false);
  assert.equal(JSON.stringify(game), before);
});

test("development preserves rating bounds and depends on match evidence", () => {
  const game = createGame(42);
  const player = getUserClub(game).squad[0];
  player.age = 18;
  player.morale = 100;
  player.overall = 60;
  player.potential = 62;
  while (!game.finished) advanceWeek(game);
  assert.ok(player.overall <= player.potential);
  assert.ok(player.overall >= 1 && player.potential <= 99);
  assert.ok(player.progression.matches > 0);
  assert.ok(player.progression.overallGained <= 4);
});

test("advancing a round updates standings and finances", () => {
  const game = createGame(42);
  const club = getUserClub(game);
  const initialBudget = club.budget;
  const result = advanceWeek(game);
  assert.equal(result.ok, true);
  assert.equal(game.week, 1);
  assert.equal(game.table.reduce((sum, row) => sum + row.played, 0), 8);
  assert.notEqual(club.budget, initialBudget);
});

test("completes and renews a season", () => {
  const game = createGame(24);
  while (!game.finished) advanceWeek(game);
  assert.equal(game.week, 14);
  assert.equal(getSortedTable(game)[0].played, 14);
  assert.equal(game.lastSeasonPlayerAwards.leagues[0].leagueId, "national");
  assert.equal(game.lastSeasonPlayerAwards.leagues[0].awards.length, 3);
  assert.equal(startNextSeason(game).ok, true);
  assert.equal(game.season, 2);
  assert.equal(game.week, 0);
  assert.equal(game.finished, false);
});

test("buys and sells players while updating budget", () => {
  const game = createGame(84);
  const club = getUserClub(game);
  club.budget = 100_000_000;
  const target = game.market[0];
  const askingPrice = target.askingPrice;
  const beforeBuy = club.budget;
  assert.equal(buyPlayer(game, target.id).ok, true);
  assert.equal(club.squad.some(player => player.id === target.id), true);
  assert.equal(club.budget, beforeBuy - askingPrice);
  const beforeSell = club.budget;
  assert.equal(sellPlayer(game, target.id).ok, true);
  assert.ok(club.budget > beforeSell);
});

test("upgrades stadium capacity and fan morale", () => {
  const game = createGame(99);
  const club = getUserClub(game);
  club.budget = 100_000_000;
  const capacity = club.stadium.capacity;
  const cost = stadiumUpgradeCost(club);
  assert.equal(upgradeStadium(game).ok, true);
  assert.equal(club.stadium.capacity, capacity + 5000);
  assert.equal(club.budget, 100_000_000 - cost);
});
