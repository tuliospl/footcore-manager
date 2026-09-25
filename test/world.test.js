import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameFromDatabase, createSchedule, advanceWeek, startNextSeason, bindUserLeague, getTransferTerms, getSortedTable, leagueMovementPlaces, leaguePrizeMoney, leagueSeasonRules, leagueAwardWinners, leagueIndividualAwardMoney } from '../src/core.js';
import { startMatch } from '../src/match.js';
import { filterCareerClubs } from '../src/career-setup.js';
const database = JSON.parse(readFileSync(new URL('../data/world/database.json', import.meta.url)));
const club = name => database.clubs.find(c=>c.name===name);
const career = (name='Flamengo') => createGameFromDatabase(database, club(name).id, 42, database);

test('bundled world assigns every imported club once and matches the chosen seasons', () => {
  assert.equal(database.clubs.length,559);
  assert.equal(database.clubs.reduce((n,c)=>n+c.squad.length,0),15400);
  const ids = database.leagues.flatMap(l=>l.clubIds);
  assert.equal(new Set(ids).size,559);
  assert.equal(ids.length,559);
  for(const [name,id] of [['Flamengo','bra-1'],['Fortaleza','bra-2'],['Paysandu','bra-3'],['ABC','bra-4'],['Coventry City','eng-1'],['Wolverhampton','eng-2'],['Málaga','esp-1'],['Girona','esp-2'],['Elversberg','deu-1'],['Wolfsburg','deu-2'],['Arezzo','ita-2'],['Manthiqueira','bra-5']]) assert.ok(database.leagues.find(l=>l.id===id).clubIds.includes(club(name).id),name);
  assert.equal(database.leagues.find(l=>l.id==='bra-1').season,'2026');
  assert.equal(database.leagues.find(l=>l.id==='eng-1').season,'2026/27');
  for(const league of database.leagues) assert.equal(league.partial,league.clubIds.length!==league.expectedClubs);
});

test('world career keeps all clubs in the market, but its fixtures and standings in the chosen league',()=>{
  const game=career();
  assert.equal(game.clubs.length,559);
  assert.equal(game.table.length,20);
  assert.equal(game.schedule.length,38);
  assert.equal(game.market.length,0);
  const permitted=new Set(game.table.map(r=>r.clubId));
  assert.ok(game.schedule.flat().every(f=>permitted.has(f.homeId)&&permitted.has(f.awayId)));
  assert.equal(game.clubs.find(c=>c.id===game.userClubId).name,'Flamengo');
  assert.throws(()=>career('Manthiqueira'),/liga/);
});

test('odd calendars have no self matches and give every pair one home and one away match',()=>{
  const ids=['a','b','c','d','e']; const rounds=createSchedule(ids);
  assert.equal(rounds.length,10);
  const seen=new Set();
  for(const round of rounds){
    assert.equal(new Set(round.flatMap(f=>[f.homeId,f.awayId])).size,4);
    for(const f of round){ assert.notEqual(f.homeId,f.awayId);const key=`${f.homeId}:${f.awayId}`;assert.ok(!seen.has(key));seen.add(key); }
  }
  assert.equal(seen.size,20); assert.deepEqual(createSchedule(['a']),[]);
});

test('a world season advances all leagues separately, survives reload and resets without merging divisions',()=>{
  let game=career();
  const before=game.clubs.find(c=>c.name==='Arsenal').budget;
  for(let i=0;i<5;i++) assert.ok(advanceWeek(game).ok);
  assert.equal(game.week,5);
  assert.equal(game.leagues.find(l=>l.id==='eng-1').week,5);
  assert.notEqual(game.clubs.find(c=>c.name==='Arsenal').budget,before);
  const seller=game.clubs.find(c=>c.name==='Real Madrid');
  assert.ok(getTransferTerms(game,seller.id,seller.squad[0].id));
  game=bindUserLeague(JSON.parse(JSON.stringify(game)));
  assert.equal(game.table,game.leagues.find(l=>l.id===game.leagueId).table);
  while(!game.finished) assert.ok(advanceWeek(game).ok);
  for(const league of game.leagues){
    assert.equal(league.week,league.schedule.length);
    for(const row of league.table) assert.equal(row.played,2*(league.clubIds.length-1));
    assert.equal(league.table.reduce((n,r)=>n+r.gf,0),league.table.reduce((n,r)=>n+r.ga,0));
  }
  assert.ok(game.clubs.filter(c=>c.name!=="Manthiqueira").every(c=>c.history[0].position>0));
  assert.equal(game.clubs.find(c=>c.name==="Manthiqueira").history.length,0);
  assert.ok(startNextSeason(game).ok);
  assert.equal(game.worldSeason,2027); assert.equal(game.table.length,20);assert.equal(game.schedule.length,38);
  assert.ok(game.leagues.every(l=>l.week===0&&l.table.every(r=>r.played===0)));
  assert.equal(getSortedTable(game,'eng-2').length,24);
});

test('adjacent divisions exchange clubs and award placement prizes at season end',()=>{
  const clubs=database.clubs.slice(0,8);
  const subset={...database,clubs,freeAgents:[]};
  const world={leagues:[
    {id:'x-1',country:'X',tier:1,name:'Divisão 1',season:'2026',expectedClubs:4,playable:true,partial:false,note:'',clubIds:clubs.slice(0,4).map(item=>item.id)},
    {id:'x-2',country:'X',tier:2,name:'Divisão 2',season:'2026',expectedClubs:4,playable:true,partial:false,note:'',clubIds:clubs.slice(4).map(item=>item.id)}
  ]};
  const game=createGameFromDatabase(subset,clubs[4].id,77,world);
  const upper=game.leagues.find(league=>league.id==='x-1');
  const lower=game.leagues.find(league=>league.id==='x-2');
  assert.equal(leagueMovementPlaces(upper,lower),1);
  assert.equal(leagueSeasonRules(game,'x-2').promotionPlaces,1);
  assert.ok(leaguePrizeMoney(lower,1)>leaguePrizeMoney(lower,4));
  while(!game.finished) assert.ok(advanceWeek(game).ok);
  const promoted=getSortedTable(game,'x-2')[0].clubId;
  const relegated=getSortedTable(game,'x-1').at(-1).clubId;
  assert.ok(upper.clubIds.includes(promoted));
  assert.ok(!lower.clubIds.includes(promoted));
  assert.ok(lower.clubIds.includes(relegated));
  assert.ok(!upper.clubIds.includes(relegated));
  assert.equal(new Set(game.leagues.flatMap(league=>league.clubIds)).size,8);
  assert.equal(game.lastSeasonMovements.movements.length,1);
  assert.equal(Object.keys(game.lastSeasonAwards.clubs).length,8);
  assert.equal(game.lastSeasonPlayerAwards.leagues.length,2);
  assert.equal(game.seasonReport.season,game.season);
  assert.equal(game.seasonReport.leagueId,'x-2');
  assert.equal(game.seasonReport.standings.length,4);
  assert.equal(game.seasonReport.teamOfSeason.length,11);
  assert.equal(game.seasonReport.awards.length,3);
  assert.equal(game.seasonReport.club.finance.net,game.seasonReport.club.finance.endingBudget-game.seasonReport.club.finance.startingBudget);
  assert.ok(game.seasonReport.club.playerChanges.length>0);
  assert.ok(game.seasonReports.some(report=>report.season===game.season));
  assert.ok(game.lastSeasonPlayerAwards.leagues.every(item=>item.awards.length===3));
  for(const award of game.lastSeasonPlayerAwards.leagues.flatMap(item=>item.awards)){
    const player=game.clubs.flatMap(club=>club.squad).find(item=>item.id===award.playerId);
    assert.ok(player.awards.some(item=>item.season===game.season&&item.type===award.type));
    assert.ok(award.money>0);
    assert.ok(award.overallGain>=0&&award.overallGain<=1);
    assert.ok(award.potentialGain>=0&&award.potentialGain<=1);
  }
  for(const club of game.clubs){assert.ok(club.history[0].prizeMoney>0);assert.equal(club.history[0].prizeMoney,game.lastSeasonAwards.clubs[club.id].prize);}
  assert.equal(game.seasonReport.club.finance.income.premiacaoLiga,undefined);
  assert.equal(game.seasonReport.club.finance.income.premiosIndividuais,undefined);
  const userPrizePayments=game.pendingPrizePayments.filter(payment=>payment.clubId===game.userClubId);
  const pendingPrizeTotal=userPrizePayments.reduce((total,payment)=>total+payment.amount,0);
  const budgetBeforePrizePayment=game.clubs.find(club=>club.id===game.userClubId).budget;
  assert.ok(pendingPrizeTotal>0);
  const previousLeagueId=game.leagueId;
  const completedReport=game.seasonReport;
  assert.ok(startNextSeason(game).ok);
  assert.equal(game.clubs.find(club=>club.id===game.userClubId).budget,budgetBeforePrizePayment+pendingPrizeTotal);
  assert.equal(game.pendingPrizePayments.length,0);
  assert.equal(Object.values(game.seasonTracking.clubs[game.userClubId].income).reduce((total,value)=>total+value,0),pendingPrizeTotal);
  assert.equal(game.seasonReport,completedReport);
  assert.equal(game.seasonTracking.season,game.season);
  assert.equal(game.leagueId,game.leagues.find(league=>league.clubIds.includes(game.userClubId)).id);
  assert.ok(game.leagues.every(league=>league.schedule.length===6&&league.table.length===4));
  assert.ok(previousLeagueId==='x-2');
});

test('Brazilian national divisions promote and relegate four clubs',()=>{
  const first=database.leagues.find(league=>league.id==='bra-1');
  const second=database.leagues.find(league=>league.id==='bra-2');
  const third=database.leagues.find(league=>league.id==='bra-3');
  const fourth=database.leagues.find(league=>league.id==='bra-4');
  assert.equal(leagueMovementPlaces(first,second),4);
  assert.equal(leagueMovementPlaces(second,third),4);
  assert.equal(leagueMovementPlaces(third,fourth),4);
});

test('one player can win scorer, assister and best-player awards together',()=>{
  const game=career();
  const league=game.leagues.find(item=>item.id==='bra-1');
  const players=league.clubIds.flatMap(id=>game.clubs.find(club=>club.id===id).squad);
  for(const player of players){player.goals=0;player.assists=0;player.ratedMatches=20;player.ratingTotal=120;}
  const star=players[0];
  star.goals=30;star.assists=18;star.ratingTotal=160;
  const winners=leagueAwardWinners(game,league.id);
  assert.equal(winners.length,3);
  assert.ok(winners.every(winner=>winner.player.id===star.id));
  assert.ok(leagueIndividualAwardMoney(league,'bestPlayer')>leagueIndividualAwardMoney(league,'topAssister'));
});

test('club filters search without accents and keep divisions independent',()=>{
  assert.equal(filterCareerClubs(database,{country:'BRA',leagueId:'bra-1'}).length,20);
  assert.equal(filterCareerClubs(database,{country:'all',query:'nautico'})[0].name,'Náutico');
  assert.equal(filterCareerClubs(database,{country:'ENG',query:'flamengo'}).length,0);
});

test('bye round advances safely without creating a match or losing the next fixture',()=>{
  const subset={...database,clubs:database.clubs.slice(0,3)};
  const world={leagues:[{id:'test',clubIds:subset.clubs.map(c=>c.id)}]};
  const game=createGameFromDatabase(subset,subset.clubs[0].id,23,world);
  assert.ok(!game.schedule[0].some(f=>f.homeId===game.userClubId||f.awayId===game.userClubId));
  assert.deepEqual(startMatch(game).bye,true);assert.equal(game.week,1);assert.equal(game.activeMatch,undefined);
  assert.ok(startMatch(game).ok);assert.ok(game.activeMatch);
});
