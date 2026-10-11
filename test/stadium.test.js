import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub } from "../src/core.js";
import {
  ensureStadiumOperations,
  medicalInjuryRisk,
  medicalRecoveryReduction,
  processStadiumRound,
  setStadiumTicketPrice,
  stadiumExpansionQuote,
  stadiumFacilityQuote,
  stadiumRevenueProjection,
  startStadiumProject
} from "../src/stadium.js";

test("legacy stadiums migrate into three sectors without changing total capacity", () => {
  const game = createGame(2201);
  const club = getUserClub(game);
  const capacity = club.stadium.capacity;
  delete club.stadium.sectors;
  delete club.stadium.facilities;
  ensureStadiumOperations(game);
  assert.equal(Object.values(club.stadium.sectors).reduce((total, sector) => total + sector.capacity, 0), capacity);
  assert.equal(club.stadium.facilities.medical.level, 1);
  assert.equal(club.stadium.facilities.restaurants.level, 0);
  assert.equal(club.stadium.facilities.store.level, 0);
});

test("ticket prices trade occupancy for revenue by sector", () => {
  const game = createGame(2202);
  const club = getUserClub(game);
  setStadiumTicketPrice(game, "stands", 20);
  const cheap = stadiumRevenueProjection(game, club).sectors.find(sector => sector.id === "stands");
  setStadiumTicketPrice(game, "stands", 150);
  const expensive = stadiumRevenueProjection(game, club).sectors.find(sector => sector.id === "stands");
  assert.ok(cheap.occupancy > expensive.occupancy);
  assert.ok(expensive.ticketPrice > cheap.ticketPrice);
});

test("expansion is paid upfront, blocks concurrent work and completes after several rounds", () => {
  const game = createGame(2203);
  const club = getUserClub(game);
  club.budget = 500_000_000;
  const capacity = club.stadium.capacity;
  const quote = stadiumExpansionQuote(club, "stands");
  const initialBudget = club.budget;
  assert.ok(quote.rounds >= 4);
  assert.equal(startStadiumProject(game, quote.id).ok, true);
  assert.equal(club.budget, initialBudget - quote.cost);
  assert.equal(startStadiumProject(game, "facility:store").ok, false);
  for (let round = 0; round < quote.rounds; round += 1) processStadiumRound(game);
  assert.equal(club.stadium.capacity, capacity + quote.addedCapacity);
  assert.equal(club.stadium.construction, null);
  assert.ok(stadiumExpansionQuote(club, "stands").cost > quote.cost);
});

test("restaurants and club store create additional stadium income", () => {
  const game = createGame(2204);
  const club = getUserClub(game);
  club.budget = 500_000_000;
  const withoutFacilities = stadiumRevenueProjection(game, club);
  for (const facilityId of ["restaurants", "store"]) {
    const quote = stadiumFacilityQuote(club, facilityId);
    assert.equal(startStadiumProject(game, quote.id).ok, true);
    for (let round = 0; round < quote.rounds; round += 1) processStadiumRound(game);
  }
  const improved = stadiumRevenueProjection(game, club);
  assert.ok(improved.restaurants > 0);
  assert.ok(improved.store > 0);
  assert.ok(improved.total > withoutFacilities.total);
});

test("medical department lowers injury risk and high levels shorten recovery", () => {
  const game = createGame(2205);
  const club = getUserClub(game);
  ensureStadiumOperations(game);
  const initialRisk = medicalInjuryRisk(club);
  club.stadium.facilities.medical.level = 5;
  assert.ok(medicalInjuryRisk(club) < initialRisk);
  assert.equal(medicalRecoveryReduction(club), 2);
});
