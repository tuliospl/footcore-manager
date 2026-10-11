import test from "node:test";
import assert from "node:assert/strict";
import { buyPlayer, createGame, getUserClub, upgradeStadium } from "../src/core.js";
import { ensureFanbases, processFanRound, settleFanSeason, startFanSeason } from "../src/fans.js";
import { sponsorshipCommercialProfile } from "../src/sponsorships.js";
import { processStadiumRound } from "../src/stadium.js";

test("fanbase persists and reacts gradually to match results", () => {
  const game = createGame(2101);
  const club = getUserClub(game);
  const opponent = game.clubs[1];
  ensureFanbases(game);
  const initial = club.fanbase.supporters;
  processFanRound(game, [{ homeId: club.id, awayId: opponent.id, homeGoals: 2, awayGoals: 0 }]);
  assert.ok(club.fanbase.supporters > initial);
  assert.equal(club.fanbase.seasonChange, club.fanbase.supporters - initial);
  assert.equal(club.fanbase.events[0].reason, "vitória");
});

test("a league title creates a meaningful fanbase jump and season history", () => {
  const game = createGame(2102);
  const club = getUserClub(game);
  const initial = club.fanbase.supporters;
  game.table.forEach((row, index) => {
    row.played = game.schedule.length;
    row.points = row.clubId === club.id ? 100 : 50 - index;
  });
  settleFanSeason(game);
  assert.ok(club.fanbase.supporters >= Math.round(initial * 1.069));
  assert.equal(club.fanbase.history[0].position, 1);
  assert.equal(club.fanbase.history[0].change, club.fanbase.lastSeasonChange);
});

test("stadium growth and a stronger signing expand supporters and commercial value", () => {
  const game = createGame(2103);
  const club = getUserClub(game);
  club.budget = 500_000_000;
  const initialFans = club.fanbase.supporters;
  const initialCommercial = sponsorshipCommercialProfile(game).basePayment;
  assert.equal(upgradeStadium(game).ok, true);
  while (club.stadium.construction) processStadiumRound(game);
  assert.ok(club.fanbase.supporters > initialFans);

  const target = game.market[0];
  target.overall = 95;
  target.potential = 97;
  target.askingPrice = 1_000_000;
  assert.equal(buyPlayer(game, target.id).ok, true);
  assert.ok(club.fanbase.supporters > initialFans);
  assert.ok(sponsorshipCommercialProfile(game).basePayment > initialCommercial);
});

test("starting a new season preserves supporters and resets annual growth", () => {
  const game = createGame(2104);
  const club = getUserClub(game);
  processFanRound(game, [{ homeId: club.id, awayId: game.clubs[1].id, homeGoals: 1, awayGoals: 0 }]);
  const supporters = club.fanbase.supporters;
  game.season += 1;
  startFanSeason(game);
  assert.equal(club.fanbase.supporters, supporters);
  assert.equal(club.fanbase.seasonStart, supporters);
  assert.equal(club.fanbase.seasonChange, 0);
});
