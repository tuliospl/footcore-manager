import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub, getTransferTerms, searchTransferMarket, makeTransferOffer, advanceWeek } from "../src/core.js";

function fixture() {
  const game = createGame(42);
  const buyer = getUserClub(game);
  buyer.budget = 100_000_000;
  const seller = game.clubs[1];
  return { game, buyer, seller };
}

function advanceUntilAnswer(game, offer, limit = 3) {
  for (let index = 0; index < limit && offer.status === "pending"; index++) assert.equal(advanceWeek(game).ok, true);
  return offer.status;
}

test("search combines club, position and accent-insensitive names without including own squad", () => {
  const { game, seller } = fixture();
  seller.squad[0].name = "João Teste";
  const results = searchTransferMarket(game, { query: "joao", clubId: seller.id, position: "GOL" });
  assert.equal(results.length, 1);
  assert.equal(results[0].player.id, seller.squad[0].id);
  assert.equal(searchTransferMarket(game).length, 124);
  assert.equal(searchTransferMarket(game, { clubId: "market" }).length, 12);
  assert.equal(searchTransferMarket(game, { query: "atletico da serra" }).length, 16);
  assert.equal(searchTransferMarket(game, { query: "zzzz" }).length, 0);
  assert.ok(searchTransferMarket(game).every(entry => entry.club?.id !== game.userClubId));
});

test("key players command a larger premium and duplicate bids cannot reroll a pending analysis", () => {
  const { game, buyer, seller } = fixture();
  const star = seller.squad[9];
  const reserve = seller.squad[15];
  star.overall = 90;
  reserve.overall = 40;
  star.value = reserve.value = 1_000_000;
  star.age = reserve.age = 28;
  const starTerms = getTransferTerms(game, seller.id, star.id);
  const reserveTerms = getTransferTerms(game, seller.id, reserve.id);
  assert.equal(starTerms.role, "Peça-chave");
  assert.equal(reserveTerms.role, "Reserva");
  assert.ok(starTerms.askingPrice > reserveTerms.askingPrice);
  const first = makeTransferOffer(game, seller.id, star.id, star.value);
  assert.equal(first.status, "pending");
  assert.equal(makeTransferOffer(game, seller.id, star.id, star.value).status, "invalid");
  assert.equal(game.outgoingOffers.length, 1);
  assert.equal(advanceUntilAnswer(game, game.outgoingOffers[0]), "rejected");
  assert.ok(!seller.squad.includes(star) || !buyer.squad.includes(star));
  assert.equal(buyer.squad.length, 16);
});

test("clubs answer after one or two rounds and a negotiated counteroffer can be accepted", () => {
  const { game, buyer, seller } = fixture();
  const player = seller.squad[9];
  const terms = getTransferTerms(game, seller.id, player.id);
  const beforeBuyer = buyer.budget;
  const beforeSeller = seller.budget;
  const openingAmount = Math.ceil(terms.minimumPrice * 0.72 / 1000) * 1000;
  const submitted = makeTransferOffer(game, seller.id, player.id, openingAmount);
  assert.equal(submitted.status, "pending");
  assert.equal(buyer.budget, beforeBuyer);
  assert.equal(seller.budget, beforeSeller);
  const offer = game.outgoingOffers[0];
  assert.equal(advanceUntilAnswer(game, offer), "counter");
  assert.ok(offer.counterAmount < terms.askingPrice);
  const revised = makeTransferOffer(game, seller.id, player.id, offer.counterAmount, offer.requestedExchangePlayerId);
  assert.equal(revised.status, "pending");
  const acceptedAmount = offer.amount;
  assert.equal(advanceUntilAnswer(game, offer), "accepted");
  assert.ok(buyer.budget < beforeBuyer);
  assert.ok(seller.budget > beforeSeller);
  assert.equal(game.transferDeals.find(deal => deal.playerId === player.id).amount, acceptedAmount);
  assert.ok(buyer.squad.includes(player));
  assert.ok(!seller.squad.includes(player));
  assert.equal(game.clubs.flatMap(club => club.squad).filter(item => item.id === player.id).length, 1);
  const after = JSON.stringify(game);
  assert.equal(makeTransferOffer(game, seller.id, player.id, acceptedAmount).status, "invalid");
  assert.equal(JSON.stringify(game), after);
});

test("a purchase can combine cash and a player without duplicating either athlete", () => {
  const { game, buyer, seller } = fixture();
  const target = seller.squad[9];
  const exchange = buyer.squad.find(player => player.position !== "GOL");
  exchange.value = 2_000_000;
  const terms = getTransferTerms(game, seller.id, target.id);
  const credit = Math.floor(exchange.value * 0.75 / 1000) * 1000;
  const cash = Math.max(0, terms.askingPrice - credit);
  const buyerBudget = buyer.budget;
  const sellerBudget = seller.budget;
  const result = makeTransferOffer(game, seller.id, target.id, cash, exchange.id);
  assert.equal(result.status, "pending");
  const offer = game.outgoingOffers[0];
  const firstAnswer = advanceUntilAnswer(game, offer);
  if (firstAnswer === "counter") {
    const revisedTerms = getTransferTerms(game, seller.id, target.id);
    assert.equal(makeTransferOffer(game, seller.id, target.id, Math.max(0, Math.ceil(revisedTerms.askingPrice * 2 / 1000) * 1000 - credit), exchange.id).status, "pending");
    assert.equal(advanceUntilAnswer(game, offer), "accepted");
  } else assert.equal(firstAnswer, "accepted");
  assert.ok(buyer.budget < buyerBudget);
  assert.ok(seller.budget > sellerBudget);
  assert.ok(buyer.squad.includes(target));
  assert.ok(!buyer.squad.includes(exchange));
  assert.ok(seller.squad.includes(exchange));
  assert.equal(game.clubs.flatMap(club => club.squad).filter(player => player.id === target.id).length, 1);
  assert.equal(game.clubs.flatMap(club => club.squad).filter(player => player.id === exchange.id).length, 1);
});

test("an exchange can receive a later counteroffer and cannot leave the buyer without a goalkeeper", () => {
  const { game, buyer, seller } = fixture();
  const target = seller.squad[9];
  const exchange = buyer.squad.find(player => player.position !== "GOL");
  exchange.value = 1_000_000;
  const terms = getTransferTerms(game, seller.id, target.id);
  const cash = Math.max(0, Math.ceil(terms.minimumPrice * 0.72) - 750_000);
  const result = makeTransferOffer(game, seller.id, target.id, cash, exchange.id);
  assert.equal(result.status, "pending");
  const offer = game.outgoingOffers[0];
  assert.equal(advanceUntilAnswer(game, offer), "counter");
  assert.ok(offer.counterAmount >= 0);
  const keepers = buyer.squad.filter(player => player.position === "GOL");
  buyer.squad = buyer.squad.filter(player => player.position !== "GOL" || player.id === keepers[0].id);
  const before = JSON.stringify(game.clubs);
  assert.equal(makeTransferOffer(game, seller.id, target.id, terms.askingPrice, keepers[0].id).status, "invalid");
  assert.equal(JSON.stringify(game.clubs), before);
});

test("unavailable players remain protected even against extraordinary offers", () => {
  for (const reason of ["short-squad", "only-keeper"]) {
    const { game, seller } = fixture();
    const player = seller.squad[0];
    if (reason === "short-squad") seller.squad.splice(14);
    else seller.squad = seller.squad.filter(item => item.position !== "GOL" || item.id === player.id);
    assert.equal(getTransferTerms(game, seller.id, player.id).available, false);
    const clubs = JSON.stringify(game.clubs);
    assert.equal(makeTransferOffer(game, seller.id, player.id, 90_000_000).status, "rejected");
    assert.equal(JSON.stringify(game.clubs), clubs);
  }
});

test("invalid, unaffordable and full-squad offers do not mutate the game", () => {
  const { game, buyer, seller } = fixture();
  const player = seller.squad[9];
  for (const amount of [NaN, Infinity, -1, 0, 1.5, "1000000", 101_000_000]) {
    const before = JSON.stringify(game);
    assert.equal(makeTransferOffer(game, seller.id, player.id, amount).status, "invalid");
    assert.equal(JSON.stringify(game), before);
  }
  buyer.squad.push(...game.market.splice(0, 8));
  const full = JSON.stringify(game);
  assert.equal(makeTransferOffer(game, seller.id, player.id, 10_000_000).status, "invalid");
  assert.equal(JSON.stringify(game), full);
  assert.equal(makeTransferOffer(game, buyer.id, buyer.squad[0].id, 1_000_000).status, "invalid");
});

test("terms respond to replacement depth, potential, contract, form and title contention", () => {
  const { game, seller } = fixture();
  const player = seller.squad[9];
  player.overall = 90;
  player.age = 28;
  const initial = getTransferTerms(game, seller.id, player.id).askingPrice;
  player.age = 20;
  player.potential = 98;
  assert.ok(getTransferTerms(game, seller.id, player.id).askingPrice > initial);
  game.week = 4;
  const contender = getTransferTerms(game, seller.id, player.id).askingPrice;
  game.table[0].points = 20;
  assert.ok(getTransferTerms(game, seller.id, player.id).askingPrice < contender);
  player.contractEndSeason = game.season;
  player.form = 50;
  player.ratedMatches = 6;
  player.ratingTotal = 33;
  assert.ok(getTransferTerms(game, seller.id, player.id).askingPrice < contender);
});

test("old saves accept negotiations and history survives JSON round trips", () => {
  const { game, seller } = fixture();
  assert.equal(game.negotiations, undefined);
  const player = seller.squad[9];
  makeTransferOffer(game, seller.id, player.id, 1);
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(restored.negotiations[0].status, "pending");
  assert.equal(restored.outgoingOffers[0].status, "pending");
  assert.equal(searchTransferMarket(restored).length, 124);
  assert.equal(makeTransferOffer(restored, seller.id, player.id, 1).status, "invalid");
  assert.equal(advanceUntilAnswer(restored, restored.outgoingOffers[0]), "rejected");
});

test('numeric filters combine inclusive bounds with multiple positions, country, league and names', () => {
  const { game, seller } = fixture();
  seller.country='BRA';
  game.leagues=[{id:'test',clubIds:[seller.id]}];
  const p=seller.squad[0];
  Object.assign(p,{name:'João Filtro',age:20,overall:70,potential:85,value:5_000_000,salary:10000});
  const filters={query:'joao filtro',positions:['GOL','ZAG'],country:'BRA',leagueId:'test',minAge:20,maxAge:20,minOverall:70,maxOverall:70,minPotential:85,maxPotential:85,minValue:5_000_000,maxValue:5_000_000,maxSalary:10000,minGrowth:15};
  assert.deepEqual(searchTransferMarket(game,filters).map(e=>e.player.id),[p.id]);
  for (const changes of [{maxAge:19},{positions:['ATA']},{country:'ENG'},{leagueId:'missing'},{maxValue:4_000_000},{maxSalary:9999},{minGrowth:16}]) assert.equal(searchTransferMarket(game,{...filters,...changes}).length,0);
  assert.equal(searchTransferMarket(game,{...filters,minValue:'',maxValue:0}).length,0);
  assert.equal(searchTransferMarket(game,{minValue:'nonsense'}).length,0);
});

test('market value, deal price, salary and potential sorts are distinct and deterministic', () => {
  const { game } = fixture();
  Object.assign(game.market[0],{value:1000,askingPrice:90000,potential:80,overall:70,age:20,salary:100});
  Object.assign(game.market[1],{value:2000,askingPrice:50000,potential:90,overall:75,age:18,salary:200});
  for (const [sort,index] of [['value',0],['price',1],['salary',0],['potential',1],['age',1],['growth',1]]) {
    const entries=searchTransferMarket(game,{clubId:'market',maxValue:2000,sort});
    assert.equal(entries[0].player.id,game.market[index].id,sort);
  }
});

test('affordable filter checks the actual offer or loan fee, excludes protected players, and combines with modality', () => {
  const {game,buyer,seller}=fixture();
  const p=seller.squad[15]; Object.assign(p,{age:20,overall:40,potential:80,value:10_000_000});
  buyer.budget=900_000;
  const loans=searchTransferMarket(game,{clubId:seller.id,dealType:'loan',affordableOnly:true});
  assert.ok(loans.some(e=>e.player.id===p.id)); // 8% fee fits, although the market value doesn't.
  buyer.budget=0;
  assert.equal(searchTransferMarket(game,{affordableOnly:true}).length,0);
  seller.squad.splice(14);
  assert.equal(searchTransferMarket(game,{clubId:seller.id,availableOnly:true}).length,0);
});

test('column sorting reverses filtered results before pagination without changing filters or players', () => {
  const { game } = fixture();
  const filters = { maxAge: 23, minGrowth: 5, positions: ['MC', 'ATA'] };
  const original = JSON.stringify(game);
  for (const sort of ['name', 'position', 'age', 'overall', 'potential', 'salary', 'value']) {
    const asc = searchTransferMarket(game, { ...filters, sort, direction: 'asc' });
    const desc = searchTransferMarket(game, { ...filters, sort, direction: 'desc' });
    assert.ok(asc.length > 1);
    assert.deepEqual(asc.map(e => e.player.id).sort(), desc.map(e => e.player.id).sort());
    const positions = ['GOL', 'ZAG', 'LAT', 'VOL', 'MC', 'ATA'];
    const compare = (a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : sort === 'position' ? positions.indexOf(a.position) - positions.indexOf(b.position) : a[sort] - b[sort];
    for (let i=1; i<asc.length; i++) assert.ok(compare(asc[i-1].player, asc[i].player) <= 0, sort);
    for (let i=1; i<desc.length; i++) assert.ok(compare(desc[i-1].player, desc[i].player) >= 0, sort);
  }
  assert.equal(JSON.stringify(game), original);
  assert.deepEqual(filters, { maxAge:23, minGrowth:5, positions:['MC','ATA'] });
});
