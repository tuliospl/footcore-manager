import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, getUserClub, ensureCareerManagement, buyPlayer, searchTransferMarket, advanceWeek, startNextSeason} from '../src/core.js';
import {ensureContracts, expireContracts, renewContract, freeAgentFee, recruitFreeAgents} from '../src/contracts.js';

function setup(){const game=createGame(42);ensureCareerManagement(game);for(const c of game.clubs)for(const p of c.squad)p.contractEndSeason=game.season+1;return game;}

test('world initialization starts with no fictional free agents and gives contracts to existing squads',()=>{
  const game=createGame(42);game.leagues=[];game.market=[];ensureCareerManagement(game);
  assert.equal(game.market.length,0);
  const snapshot=JSON.stringify(game);ensureCareerManagement(game);assert.equal(JSON.stringify(game),snapshot);
  assert.ok(game.clubs.every(c=>c.squad.every(p=>Number.isInteger(p.contractEndSeason))));
});

test('expired own contract enters the free market, can be signed for a fee, and cannot be signed twice',()=>{
  const game=setup(),club=getUserClub(game),p=club.squad.at(-1);p.contractEndSeason=game.season;p.goals=7;
  expireContracts(game);
  assert.ok(!club.squad.includes(p));assert.ok(game.market.includes(p));assert.equal(p.previousClub,club.name);assert.equal(p.freeAgentOrigin,'expired');
  assert.ok(searchTransferMarket(game,{dealType:'free'}).some(e=>e.player.id===p.id));
  club.budget=100_000_000;const fee=p.askingPrice, before=club.budget;
  assert.ok(buyPlayer(game,p.id).ok);assert.equal(club.budget,before-fee);assert.equal(p.contractEndSeason,game.season+2);assert.equal(p.goals,7);
  assert.equal(buyPlayer(game,p.id).ok,false);assert.equal(p.freeAgentOrigin,undefined);
});

test('renewals charge disclosed salary-based fee; loans, long contracts and insufficient funds cannot renew',()=>{
  const game=setup(),club=getUserClub(game),p=club.squad[0];p.contractEndSeason=game.season;
  const before=club.budget;assert.ok(renewContract(game,p.id).ok);assert.equal(club.budget,before-p.salary*4);
  assert.equal(renewContract(game,p.id).ok,false);expireContracts(game);assert.ok(club.squad.includes(p));
  p.contractEndSeason=game.season;p.loan={};assert.equal(renewContract(game,p.id).ok,false);
  delete p.loan;club.budget=0;assert.equal(renewContract(game,p.id).ok,false);
});

test('expiration protects a playable roster and the last goalkeeper',()=>{
  const game=setup(),club=getUserClub(game);club.squad=club.squad.filter((p,i)=>i!==11); // keep only the starting goalkeeper
  const keeper=club.squad[0];for(const p of club.squad)p.contractEndSeason=game.season;
  expireContracts(game);assert.ok(club.squad.length>=14);assert.ok(club.squad.includes(keeper));
  assert.ok(keeper.contractEndSeason>game.season);assert.ok(club.squad.filter(p=>p.position!=='GOL').length>=10);
});

test('season end expires contracts after loans return and next season keeps free agents with fresh statistics',()=>{
  const game=setup(),club=getUserClub(game),p=club.squad.at(-1);p.contractEndSeason=game.season;p.goals=4;
  while(!game.finished)advanceWeek(game);
  assert.ok(game.market.includes(p));const age=p.age;
  assert.ok(startNextSeason(game).ok);assert.ok(game.market.includes(p));assert.equal(p.goals,0);assert.equal(p.age,age);
});

test('a returning loan with an expired contract leaves its owner, not the borrower',()=>{
  const game=setup(),owner=game.clubs[1],borrower=getUserClub(game),p=owner.squad.at(-1);
  owner.squad.splice(owner.squad.indexOf(p),1);borrower.squad.push(p);
  p.overall=1;p.age=30;p.contractEndSeason=game.season;
  p.loan={ownerClubId:owner.id,borrowerClubId:borrower.id,endSeason:game.season};
  // Make renewal failure deterministic without changing the production probability.
  let expired=false;
  for(let seed=1;seed<=200&&!expired;seed++){
    const copy=structuredClone(game);copy.seed=seed;
    while(!copy.finished)advanceWeek(copy);
    const free=copy.market.find(a=>a.id===p.id);
    if(free){assert.equal(free.previousClub,owner.name);assert.equal(free.loan,undefined);expired=true;}
  }
  assert.ok(expired);

});

test('migration removes only unsigned generated agents and preserves expired agents and signed players',()=>{
  const game=setup();game.managementVersion=1;
  const generated={...game.market[0],id:'generated',freeAgentOrigin:'generated'};
  const real={...game.market[1],id:'expired',freeAgentOrigin:'expired'};
  game.market=[generated,real];
  const signed={...generated,id:'already-signed'};getUserClub(game).squad.push(signed);
  const money=getUserClub(game).budget;
  ensureCareerManagement(game);
  assert.deepEqual(game.market,[real]);assert.ok(getUserClub(game).squad.includes(signed));assert.equal(getUserClub(game).budget,money);
  const before=JSON.stringify(game);ensureCareerManagement(game);assert.equal(JSON.stringify(game),before);
});

test('important AI players normally renew but a small repeatable minority can become free',()=>{
  let released=0;
  for(let seed=1;seed<=1000;seed++) {
    const game=setup();game.seed=seed;
    const club=game.clubs[1],p=club.squad[9];p.overall=90;p.age=29;p.contractEndSeason=game.season;
    const copy=structuredClone(game);
    expireContracts(game);expireContracts(copy);
    assert.deepEqual(game.market.map(p=>p.id),copy.market.map(p=>p.id));
    if(game.market.some(a=>a.id===p.id))released++;
    else assert.equal(p.contractEndSeason,game.season+2);
  }
  assert.ok(released>0&&released<20,`unexpected number of strong exits: ${released}/1000`);
});

test('strong releases have a world limit and reserves are often renewed too',()=>{
  let reserveReleases=0;
  for(let seed=1;seed<=100;seed++) {
    const game=setup();game.seed=seed;game.contractReview={season:game.season,strongReleases:2};
    for(const club of game.clubs.slice(1)) {const p=club.squad[9];p.overall=90;p.contractEndSeason=game.season;}
    const reserve=game.clubs[1].squad[15];reserve.age=28;reserve.overall=30;reserve.contractEndSeason=game.season;
    expireContracts(game);
    assert.ok(game.clubs.slice(1).every(c=>c.squad.some(p=>p.overall===90)));
    if(game.market.includes(reserve))reserveReleases++;
  }
  assert.ok(reserveReleases>0&&reserveReleases<50);
});

test('AI recruitment competes for expired agents, pays the fee once and protects manager control and payroll',()=>{
  let found;
  for(let seed=1;seed<=100&&!found;seed++) {
    const game=setup();game.seed=seed;game.week=2;game.market=[];
    const p={...game.clubs[1].squad[9],id:'free-opportunity',overall:74,potential:80,age:25,askingPrice:500000,freeAgentOrigin:'expired',previousClubId:'former-club',previousClub:'Former Club',freeSinceSeason:game.season,freeSinceWeek:0};
    game.market=[p];const before=game.clubs.map(c=>c.budget);const userIds=getUserClub(game).squad.map(p=>p.id);
    recruitFreeAgents(game);
    if(!game.market.length) {
      found=game;const buyer=game.clubs.find(c=>c.squad.includes(p));
      assert.notEqual(buyer.id,game.userClubId);assert.equal(buyer.budget,before[game.clubs.indexOf(buyer)]-500000);
      assert.deepEqual(getUserClub(game).squad.map(p=>p.id),userIds);
      assert.equal(p.contractEndSeason,game.season+2);assert.equal(p.freeAgentOrigin,undefined);
      assert.equal(game.freeAgentDeals.length,1);
      const snapshot=JSON.stringify(game);recruitFreeAgents(game);assert.equal(JSON.stringify(game),snapshot);
    }
  }
  assert.ok(found,'at least one eligible club must recruit over the tested seeds');
  const poor=setup();poor.week=2;poor.market=[{...poor.market[0],freeAgentOrigin:'expired',askingPrice:1000000}];
  poor.clubs.forEach(c=>c.budget=0);recruitFreeAgents(poor);assert.equal(poor.market.length,1);
});

test('new free agents get a grace period and clubs cannot take back a player they just released',()=>{
  const game=setup();game.week=1;
  game.market=[{...game.market[0],id:'new-free',freeAgentOrigin:'expired',freeSinceSeason:game.season,freeSinceWeek:0}];
  recruitFreeAgents(game);assert.equal(game.market.length,1);
  game.week=2;game.market[0].previousClubId=game.clubs[1].id;
  game.clubs=game.clubs.slice(0,2);recruitFreeAgents(game);assert.equal(game.market.length,1);
});
