import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub } from "../src/core.js";
import { seasonFinanceSummary } from "../src/season-tracking.js";
import {
  ensureSponsorships,
  finishSponsorshipSeason,
  processSponsorshipRound,
  signSponsor,
  sponsorshipCommercialProfile,
  SPONSOR_BRANDS,
  SPONSOR_SLOTS,
  startSponsorshipSeason
} from "../src/sponsorships.js";

test("sponsor market offers seasonal, weekly and turn payments for every shirt slot", () => {
  const game = createGame(1801);
  const state = ensureSponsorships(game);
  const knownBrands = new Map(SPONSOR_BRANDS.map(brand => [brand.name, brand]));
  assert.equal(state.offers.length, SPONSOR_SLOTS.length * 3);
  assert.ok(state.offers.every(offer => knownBrands.get(offer.name)?.category === offer.brandCategory));
  for (const slot of SPONSOR_SLOTS) {
    const offers = state.offers.filter(offer => offer.slot === slot.id);
    assert.equal(offers.length, 3);
    assert.deepEqual(new Set(offers.map(offer => offer.paymentSchedule)), new Set(["season", "weekly", "turn"]));
    assert.ok(offers.every(offer => offer.goals.length === 2));
    assert.ok(offers.find(offer => offer.paymentSchedule === "turn").bonus > offers.find(offer => offer.paymentSchedule === "season").bonus);
  }
});

test("clubs with elite commercial reach attract globally prominent brands", () => {
  const game = createGame(1808);
  const club = getUserClub(game);
  club.squad.forEach(player => { player.overall = Math.max(player.overall, 92); });
  club.stadium.capacity = 90_000;
  club.reputation = 100;
  club.fanMorale = 100;
  delete game.sponsorships;
  const profile = sponsorshipCommercialProfile(game);
  const offers = ensureSponsorships(game).offers;
  const brands = new Map(SPONSOR_BRANDS.map(brand => [brand.name, brand]));
  assert.equal(profile.commercialScore, 95);
  assert.ok(offers.every(offer => brands.get(offer.name).minScore >= 60));
});

test("legacy fictional sponsors migrate to real brands without changing contract values", () => {
  const game = createGame(1809);
  const state = ensureSponsorships(game);
  const offer = state.offers.find(item => item.slot === "master" && item.paymentSchedule === "weekly");
  signSponsor(game, offer.id);
  const contract = game.sponsorships.contracts.master;
  const payment = contract.roundPayment;
  contract.name = "Vértice";
  delete contract.brandCategory;
  game.news.unshift({ title: "Vértice é o novo patrocinador", body: "Contrato assinado com Vértice." });
  game.sponsorships.version = 3;
  ensureSponsorships(game);
  assert.ok(SPONSOR_BRANDS.some(brand => brand.name === contract.name && brand.category === contract.brandCategory));
  assert.equal(contract.roundPayment, payment);
  assert.equal(game.news.some(item => item.title?.includes("Vértice") || item.body?.includes("Vértice")), false);
});

test("commercial value follows squad strength, title potential, stadium and supporters", () => {
  const game = createGame(1806);
  const club = getUserClub(game);
  const initial = sponsorshipCommercialProfile(game);
  club.squad.forEach(player => { player.overall += 10; });
  club.stadium.capacity += 30_000;
  club.reputation += 15;
  club.fanMorale = 100;
  const improved = sponsorshipCommercialProfile(game);
  assert.ok(improved.squadQuality > initial.squadQuality);
  assert.ok(improved.depthQuality > initial.depthQuality);
  assert.ok(improved.titlePotential > initial.titlePotential);
  assert.ok(improved.estimatedSupporters > initial.estimatedSupporters);
  assert.ok(improved.basePayment > initial.basePayment);
});

test("unsigned offers refresh every four rounds while signed contracts stay fixed", () => {
  const game = createGame(1807);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const signed = state.offers.find(item => item.slot === "master" && item.paymentSchedule === "weekly");
  const previousBackOffer = state.offers.find(item => item.slot === "back" && item.paymentSchedule === "weekly");
  signSponsor(game, signed.id);
  club.squad.forEach(player => { player.overall += 12; });
  club.stadium.capacity += 40_000;
  game.week = 4;
  const refreshed = ensureSponsorships(game);
  const nextBackOffer = refreshed.offers.find(item => item.slot === "back" && item.paymentSchedule === "weekly");
  assert.equal(refreshed.contracts.master.roundPayment, signed.roundPayment);
  assert.equal(refreshed.offers.some(item => item.slot === "master"), false);
  assert.ok(nextBackOffer.roundPayment > previousBackOffer.roundPayment);
});

test("signed sponsors pay once per played round and cannot be replaced", () => {
  const game = createGame(1802);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const offer = state.offers.find(item => item.slot === "master" && item.paymentSchedule === "weekly");
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

test("season payment is credited at signing and turn payment arrives in installments", () => {
  const game = createGame(1804);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const seasonal = state.offers.find(item => item.slot === "master" && item.paymentSchedule === "season");
  const byTurn = state.offers.find(item => item.slot === "back" && item.paymentSchedule === "turn");
  const startingBudget = club.budget;
  signSponsor(game, seasonal.id);
  signSponsor(game, byTurn.id);
  assert.equal(club.budget, startingBudget + seasonal.roundPayment * game.schedule.length);

  const contract = game.sponsorships.contracts.back;
  const firstPayment = contract.turnPayments[0];
  game.week = firstPayment.round - 1;
  const result = { homeId: club.id, awayId: game.clubs[1].id };
  assert.equal(processSponsorshipRound(game, [result]), firstPayment.amount);
  assert.equal(processSponsorshipRound(game, [result]), 0);
  assert.equal(contract.fixedPaid, firstPayment.amount);
});

test("performance bonus follows final position and contracts renew next season", () => {
  const game = createGame(1803);
  const club = getUserClub(game);
  const state = ensureSponsorships(game);
  const byTurn = state.offers.find(item => item.slot === "master" && item.paymentSchedule === "turn");
  const seasonal = state.offers.find(item => item.slot === "back" && item.paymentSchedule === "season");
  signSponsor(game, byTurn.id);
  signSponsor(game, seasonal.id);
  const ownRow = game.table.find(row => row.clubId === club.id);
  ownRow.points = 100;
  club.fanMorale = 100;
  const budget = club.budget;
  const records = finishSponsorshipSeason(game);
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.achieved));
  assert.equal(club.budget, budget + byTurn.bonus + seasonal.bonus);
  assert.ok(records.every(record => record.goalResults.length === 2));
  assert.deepEqual(finishSponsorshipSeason(game), []);

  game.season += 1;
  startSponsorshipSeason(game);
  assert.equal(Object.keys(game.sponsorships.contracts).length, 0);
  assert.equal(game.sponsorships.offers.length, SPONSOR_SLOTS.length * 3);
  assert.deepEqual(club.sponsors, {});
});

test("sponsor goals pay independently when only one target is reached", () => {
  const game = createGame(1805);
  const club = getUserClub(game);
  const offer = ensureSponsorships(game).offers.find(item => item.slot === "master" && item.paymentSchedule === "weekly");
  signSponsor(game, offer.id);
  const ownRow = game.table.find(row => row.clubId === club.id);
  ownRow.points = -10;
  club.fanMorale = 100;
  const budget = club.budget;
  const [record] = finishSponsorshipSeason(game);
  const achievedGoals = record.goalResults.filter(goal => goal.achieved);
  assert.equal(achievedGoals.length, 1);
  assert.equal(achievedGoals[0].type, "fanMorale");
  assert.equal(club.budget, budget + achievedGoals[0].bonus);
});
