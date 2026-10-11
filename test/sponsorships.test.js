import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub } from "../src/core.js";
import { seasonFinanceSummary } from "../src/season-tracking.js";
import {
  ensureSponsorships,
  finishSponsorshipSeason,
  processSponsorshipRound,
  signSponsor,
  SPONSOR_SLOTS,
  startSponsorshipSeason
} from "../src/sponsorships.js";

test("sponsor market offers three sustainable profiles for every shirt slot", () => {
  const game = createGame(1801);
  const state = ensureSponsorships(game);
  assert.equal(state.offers.length, SPONSOR_SLOTS.length * 3);
  for (const slot of SPONSOR_SLOTS) {
    const offers = state.offers.filter(offer => offer.slot === slot.id);
    assert.equal(offers.length, 3);
    const safe = offers.find(offer => offer.profile === "safe");
    const ambitious = offers.find(offer => offer.profile === "ambitious");
    assert.ok(safe.roundPayment > ambitious.roundPayment);
    assert.ok(ambitious.bonus > safe.bonus);
  }
});

test("signed sponsors pay once per played round and cannot be replaced", () => {
  const game = createGame(1802);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const offer = state.offers.find(item => item.slot === "master");
  const competingOffer = state.offers.find(item => item.slot === "master" && item.id !== offer.id);
  const budget = club.budget;
  assert.equal(signSponsor(game, offer.id).ok, true);
  assert.equal(signSponsor(game, competingOffer.id).ok, false);
  const result = { homeId: club.id, awayId: game.clubs[1].id };
  assert.equal(processSponsorshipRound(game, [result]), offer.roundPayment);
  assert.equal(processSponsorshipRound(game, [result]), 0);
  assert.equal(club.budget, budget + offer.roundPayment);
  assert.equal(seasonFinanceSummary(game, club.id).income.patrocinios, offer.roundPayment);
  assert.equal(club.sponsors.master.name, offer.name);
});

test("performance bonus follows final position and contracts renew next season", () => {
  const game = createGame(1803);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const ambitious = state.offers.find(item => item.slot === "master" && item.profile === "ambitious");
  const safe = state.offers.find(item => item.slot === "back" && item.profile === "safe");
  signSponsor(game, ambitious.id);
  signSponsor(game, safe.id);
  const ownRow = game.table.find(row => row.clubId === club.id);
  ownRow.points = 100;
  const budget = club.budget;
  const records = finishSponsorshipSeason(game);
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.achieved));
  assert.equal(club.budget, budget + ambitious.bonus + safe.bonus);
  assert.deepEqual(finishSponsorshipSeason(game), []);

  game.season += 1;
  startSponsorshipSeason(game);
  assert.equal(Object.keys(game.sponsorships.contracts).length, 0);
  assert.equal(game.sponsorships.offers.length, SPONSOR_SLOTS.length * 3);
  assert.deepEqual(club.sponsors, {});
});
