import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptIncomingOffer,
  counterIncomingOffer,
  advanceWeek,
  createGame,
  getUserClub,
  incomingExchangeCandidates,
  processTransferActivity,
  registerIncomingOffer,
  rejectIncomingOffer
} from "../src/core.js";

function offerSetup(seed = 1401) {
  const game = createGame(seed);
  const seller = getUserClub(game);
  const buyer = game.clubs[game.clubs.length - 1];
  const player = seller.squad.find(item => item.position !== "GOL");
  buyer.budget = 100_000_000;
  return { game, seller, buyer, player };
}

test("the manager can accept or reject incoming transfer offers", () => {
  const accepted = offerSetup();
  accepted.player.releaseClause = null;
  const amount = 2_500_000;
  const sellerBudget = accepted.seller.budget;
  const buyerBudget = accepted.buyer.budget;
  const proposal = registerIncomingOffer(accepted.game, accepted.buyer.id, accepted.player.id, amount);
  assert.equal(proposal.status, "pending");
  assert.equal(accepted.game.incomingOffers.length, 1);
  assert.equal(acceptIncomingOffer(accepted.game, proposal.offer.id).ok, true);
  assert.equal(accepted.seller.budget, sellerBudget + amount);
  assert.equal(accepted.buyer.budget, buyerBudget - amount);
  assert.ok(accepted.buyer.squad.includes(accepted.player));

  const rejected = offerSetup(1402);
  rejected.player.releaseClause = null;
  const second = registerIncomingOffer(rejected.game, rejected.buyer.id, rejected.player.id, amount);
  assert.equal(rejectIncomingOffer(rejected.game, second.offer.id).ok, true);
  assert.ok(rejected.seller.squad.includes(rejected.player));
  assert.equal(rejected.game.receivedOfferHistory[0].status, "rejected");
});

test("a club paying the release clause completes the transfer automatically", () => {
  const { game, seller, buyer, player } = offerSetup(1403);
  player.releaseClause = 4_000_000;
  const sellerBudget = seller.budget;
  const result = registerIncomingOffer(game, buyer.id, player.id, 6_000_000);
  assert.equal(result.status, "clause");
  assert.equal(game.incomingOffers.length, 0);
  assert.equal(seller.budget, sellerBudget + 4_000_000);
  assert.ok(buyer.squad.includes(player));
  assert.equal(game.transferDeals[0].status, "clause");
});

test("the manager can counter an incoming offer with more cash and an exchange player", () => {
  const { game, seller, buyer, player } = offerSetup(1405);
  player.releaseClause = null;
  const exchange = buyer.squad.find(item => item.position !== "GOL");
  exchange.value = 500_000;
  exchange.overall = player.overall;
  const proposal = registerIncomingOffer(game, buyer.id, player.id, 3_000_000);
  const sellerBudget = seller.budget;
  const buyerBudget = buyer.budget;
  const result = counterIncomingOffer(game, proposal.offer.id, 3_200_000, exchange.id);
  assert.equal(result.ok, true);
  assert.equal(seller.budget, sellerBudget + 3_200_000);
  assert.equal(buyer.budget, buyerBudget - 3_200_000);
  assert.ok(buyer.squad.includes(player));
  assert.ok(seller.squad.includes(exchange));
  assert.equal(game.incomingOffers.length, 0);
  assert.equal(game.receivedOfferHistory[0].status, "counter-accepted");
});

test("an excessive incoming counteroffer is limited without removing the original proposal", () => {
  const { game, buyer, player } = offerSetup(1406);
  player.releaseClause = null;
  const proposal = registerIncomingOffer(game, buyer.id, player.id, 2_000_000);
  const clubs = JSON.stringify(game.clubs);
  const result = counterIncomingOffer(game, proposal.offer.id, 20_000_000);
  assert.equal(result.status, "counter");
  assert.ok(result.counterOffer < 20_000_000);
  assert.equal(game.incomingOffers.length, 1);
  assert.equal(JSON.stringify(game.clubs), clubs);
});

test("incoming negotiations protect superior players from abusive exchange packages", () => {
  const { game, buyer, player } = offerSetup(1408);
  player.releaseClause = null;
  player.overall = 72;
  player.value = 2_000_000;
  const star = buyer.squad.find(item => item.position !== "GOL");
  star.overall = 94;
  star.potential = 96;
  star.value = 30_000_000;
  const proposal = registerIncomingOffer(game, buyer.id, player.id, 2_500_000);
  const clubs = JSON.stringify(game.clubs);

  assert.ok(!incomingExchangeCandidates(game, proposal.offer.id).some(item => item.id === star.id));
  const result = counterIncomingOffer(game, proposal.offer.id, 2_500_000, star.id);

  assert.equal(result.status, "counter");
  assert.equal(result.clearExchange, true);
  assert.equal(result.exchangeCredit, 0);
  assert.equal(game.incomingOffers.length, 1);
  assert.equal(JSON.stringify(game.clubs), clubs);

  const accepted = counterIncomingOffer(game, proposal.offer.id, result.counterOffer, null);
  assert.equal(accepted.ok, true);
  assert.ok(buyer.squad.includes(player));
  assert.ok(buyer.squad.includes(star));
  assert.equal(game.incomingOffers.length, 0);
});

test("AI clubs buy and sell players independently as rounds advance", () => {
  const game = createGame(1404);
  while (!game.finished) advanceWeek(game);
  const deals = game.transferDeals.filter(deal => deal.status === "ai");
  assert.ok(deals.length > 0);
  assert.ok(deals.every(deal => deal.sellerId !== game.userClubId && deal.buyerId !== game.userClubId));
  assert.ok(deals.every(deal => deal.amount > 0 && deal.sellerName && deal.buyerName));
});

test("a dominant user club still attracts bids for elite players", () => {
  const game = createGame(1407);
  const seller = getUserClub(game);
  const target = seller.squad.find(player => player.position === "ATA");
  for (const player of seller.squad) {
    player.overall = Math.max(player.overall, 88);
    player.potential = Math.max(player.potential, player.overall);
  }
  target.overall = 94;
  target.potential = 96;
  target.value = 20_000_000;
  target.releaseClause = null;
  const buyer = game.clubs.at(-1);
  buyer.budget = 100_000_000;
  for (const player of buyer.squad) {
    player.overall = Math.max(player.overall, 84);
    player.potential = Math.max(player.potential, player.overall);
  }
  for (const club of game.clubs.filter(club => club.id !== seller.id && club.id !== buyer.id)) club.budget = 0;

  for (let week = 0; week < 60 && !game.incomingOffers.length; week += 1) {
    game.week = week;
    processTransferActivity(game);
  }

  assert.equal(game.incomingOffers.length, 1);
  assert.equal(game.incomingOffers[0].buyerId, buyer.id);
  assert.ok(seller.squad.find(player => player.id === game.incomingOffers[0].playerId)?.overall >= 88);
});
