import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub, getClubListing, acceptClubListing, searchTransferMarket, sellPlayer, makeTransferOffer, advanceWeek, startNextSeason } from "../src/core.js";

function setup(type = "loan") {
  const game = createGame(42);
  const buyer = getUserClub(game);
  buyer.budget = 100_000_000;
  const seller = game.clubs[1];
  const player = seller.squad[15];
  Object.assign(player, { overall: 45, potential: 80, age: type === "loan" ? 20 : 30 });
  const listing = getClubListing(game, seller.id, player.id);
  return { game, buyer, seller, player, listing };
}

test("clubs list young reserves for loans and older reserves for fixed sales, protecting stars", () => {
  const { game, seller, player, listing } = setup();
  assert.equal(listing.type, "loan");
  assert.ok(searchTransferMarket(game, { dealType: "loan" }).some(entry => entry.player.id === player.id));
  assert.ok(searchTransferMarket(game, { dealType: "fixed" }).every(entry => !entry.club || entry.listing.type === "fixed"));
  player.age = 30;
  assert.equal(getClubListing(game, seller.id, player.id).type, "fixed");
  player.overall = 99;
  assert.equal(getClubListing(game, seller.id, player.id), null);
});

test("fixed purchases charge precisely the advertised price and transfer the player once", () => {
  const { game, buyer, seller, player, listing } = setup("fixed");
  const budgets = [buyer.budget, seller.budget];
  assert.equal(acceptClubListing(game, seller.id, player.id, "fixed", listing.price).ok, true);
  assert.equal(buyer.budget, budgets[0] - listing.price);
  assert.equal(seller.budget, budgets[1] + listing.price);
  assert.ok(buyer.squad.includes(player));
  assert.ok(!seller.squad.includes(player));
  assert.equal(player.loan, undefined);
  assert.equal(game.negotiations[0].status, "purchased");
  const after = JSON.stringify(game);
  assert.equal(acceptClubListing(game, seller.id, player.id, "fixed", listing.price).ok, false);
  assert.equal(JSON.stringify(game), after);
});

test("loan charges a fee, keeps ownership, prohibits resale and purchase via proposals", () => {
  const { game, buyer, seller, player, listing } = setup();
  assert.equal(makeTransferOffer(game, seller.id, player.id, 90_000_000).ok, false);
  const budget = buyer.budget;
  assert.equal(acceptClubListing(game, seller.id, player.id, "loan", listing.price).ok, true);
  assert.equal(buyer.budget, budget - listing.price);
  assert.equal(player.loan.ownerClubId, seller.id);
  assert.equal(player.loan.endSeason, game.season);
  const after = JSON.stringify(game);
  assert.equal(sellPlayer(game, player.id).ok, false);
  assert.equal(JSON.stringify(game), after);
  assert.ok(!searchTransferMarket(game).some(entry => entry.player.id === player.id));
});

test("borrower pays the salary, lender does not pay it during the loan", () => {
  const { game, buyer, seller, player, listing } = setup();
  acceptClubListing(game, seller.id, player.id, "loan", listing.price);
  const expected = [buyer, seller].map(club => ({ club, budget: club.budget, payroll: club.squad.reduce((sum, athlete) => sum + athlete.salary, 0) }));
  const { results } = advanceWeek(game);
  for (const { club, budget, payroll } of expected) {
    const income = results.find(match => match.homeId === club.id)?.income || 0;
    assert.equal(club.budget, budget + income - payroll);
  }
});

test("saved loan returns automatically once after the final round and preserves development", () => {
  let { game, buyer, seller, player, listing } = setup();
  acceptClubListing(game, seller.id, player.id, "loan", listing.price);
  const playerId = player.id;
  game = JSON.parse(JSON.stringify(game));
  buyer = getUserClub(game);
  seller = game.clubs[1];
  player = buyer.squad.find(item => item.id === playerId);
  while (game.week < 13) advanceWeek(game);
  assert.ok(buyer.squad.includes(player));
  const developed = player.overall;
  advanceWeek(game);
  assert.ok(!buyer.squad.includes(player));
  assert.ok(seller.squad.includes(player));
  assert.ok(player.overall >= developed);
  assert.equal(player.age, 21);
  assert.equal(player.loan, undefined);
  assert.ok(game.news.some(item => item.id === `loan-return-1-${playerId}`));
  startNextSeason(game);
  assert.equal(seller.squad.filter(item => item.id === playerId).length, 1);
});

test("stale prices, changed listings, insufficient funds, full squads and short sellers reject without mutation", () => {
  for (const scenario of ["price", "type", "cash", "full", "short"]) {
    const { game, buyer, seller, player, listing } = setup();
    if (scenario === "cash") buyer.budget = 0;
    if (scenario === "full") buyer.squad.push(...game.market.splice(0, 8));
    if (scenario === "short") seller.squad.splice(1, 2);
    const before = JSON.stringify(game);
    assert.equal(acceptClubListing(game, seller.id, player.id, scenario === "type" ? "fixed" : "loan", listing.price + (scenario === "price" ? 1 : 0)).ok, false);
    assert.equal(JSON.stringify(game), before);
  }
});

test("loans cannot hide a shortage of permanently owned players or goalkeepers", () => {
  const { game, buyer, seller, player, listing } = setup();
  acceptClubListing(game, seller.id, player.id, "loan", listing.price);
  buyer.squad.splice(2, 2);
  assert.equal(buyer.squad.filter(item => !item.loan).length, 14);
  assert.equal(sellPlayer(game, buyer.squad[2].id).ok, false);
  const keepers = buyer.squad.filter(item => item.position === "GOL");
  keepers[1].loan = { ownerClubId: seller.id, borrowerClubId: buyer.id, endSeason: 1 };
  buyer.squad.push(...game.market.splice(0, 2));
  assert.equal(sellPlayer(game, keepers[0].id).ok, false);
});

test("loan fees scale with remaining rounds and new loans close when season finishes", () => {
  const { game, seller, player, listing } = setup();
  game.week = 7;
  assert.ok(getClubListing(game, seller.id, player.id).price < listing.price);
  game.finished = true;
  assert.equal(getClubListing(game, seller.id, player.id), null);
});
