import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimatePlayer, playerValue, migratePlayerBalance, BALANCE_VERSION } from '../src/player-balance.js';
import { createGameFromDatabase, createGame, getUserClub } from '../src/core.js';
const database = JSON.parse(readFileSync(new URL('../data/world/database.json', import.meta.url)));
const club = name => database.clubs.find(c => c.name === name);
const player = (team, name) => club(team).squad.find(p => p.name === name);

test('global scale differentiates Bayern squad, Brazilian references and world elite without saturating at 99', () => {
  const kane = player('Bayern','Harry Kane'), gnabry = player('Bayern','Serge Gnabry'), davies = player('Bayern','Alphonso Davies'), jorginho = player('Flamengo','Jorginho');
  assert.ok(kane.overall > gnabry.overall);
  assert.ok(davies.overall > jorginho.overall);
  assert.ok(player('Real Madrid','Kylian Mbappé').overall > kane.overall);
  assert.ok(new Set(club('Bayern').squad.map(p=>p.overall)).size >= 10);
  const all = database.clubs.flatMap(c => c.squad);
  assert.ok(all.every(p => p.overall < 95 && p.potential >= p.overall && p.potential <= 95));
  assert.ok(all.filter(p => p.overall >= 90).length < 30);
  assert.ok(playerValue(kane) > 100_000_000);
  assert.ok(playerValue(davies) > playerValue(jorginho) * 3);
});

test('elite veterans remain above strong Brazilian players and Flamengo and Palmeiras stay competitive', () => {
  const messi = player('Inter Miami', 'Lionel Messi');
  const cristiano = player('Al-Nassr', 'Cristiano Ronaldo');
  const paqueta = player('Flamengo', 'Lucas Paquetá');
  const lino = player('Flamengo', 'Samuel Lino');
  assert.ok(messi.overall > paqueta.overall && messi.overall > lino.overall);
  assert.ok(cristiano.overall > paqueta.overall && cristiano.overall > lino.overall);

  const bestEleven = team => [...club(team).squad].sort((a, b) => b.overall - a.overall).slice(0, 11).reduce((total, athlete) => total + athlete.overall, 0) / 11;
  assert.ok(Math.abs(bestEleven('Flamengo') - bestEleven('Palmeiras')) <= 1);
  assert.ok(player('Palmeiras', 'Jhon Arias').overall >= player('Flamengo', 'Pedro').overall);
});

test('estimation uses club context, role and maturity, with stable results independent of parsing order', () => {
  const base = { name:'Test Player', clubName:'Test FC', country:'ENG', strength:90, age:26, position:'ATA', star:false, starter:true };
  const normal = estimatePlayer(base);
  assert.deepEqual(estimatePlayer(base), normal);
  assert.ok(estimatePlayer({...base,country:'BRA'}).overall < normal.overall);
  assert.ok(estimatePlayer({...base,star:true}).overall > normal.overall);
  assert.ok(estimatePlayer({...base,starter:false,age:18}).overall < estimatePlayer({...base,starter:false}).overall);
  assert.equal(estimatePlayer({...base,age:34}).potential, estimatePlayer({...base,age:34}).overall);
});

test('star status establishes a global floor independent of league strength', () => {
  const star = { name:'Global Star', clubName:'Small Club', country:'USA', strength:55, age:34, position:'ATA', star:true, starter:true, extra:7 };
  const regular = { ...star, name:'Regular Player', country:'ENG', strength:95, star:false };
  assert.ok(estimatePlayer(star).overall >= 84);
  assert.ok(estimatePlayer(star).overall > estimatePlayer(regular).overall);
  assert.equal(estimatePlayer({ ...star, country:'SAU', strength:45 }).overall, estimatePlayer(star).overall);
});

test('valuation grows sharply at elite levels, rewards youth and potential, and discounts aging', () => {
  const value = (overall, age=25, potential=overall) => playerValue({overall,age,potential});
  assert.ok(value(99) > 500_000_000);
  assert.ok(value(90) > value(80) * 4);
  assert.ok(value(84,25) > value(84,34));
  assert.ok(value(75,20,90) > value(75,20,75));
  assert.equal(value(75,34,90),value(75,34,75));
  for (const age of [16,25,35,50]) for (const overall of [1,50,80,99]) assert.ok(Number.isSafeInteger(value(overall,age)) && value(overall,age) > 0);
});

test('market value reflects proven form without overpowering player quality', () => {
  const base = { overall: 82, potential: 85, age: 25 };
  const excellent = playerValue({ ...base, form: 88, ratedMatches: 18, ratingTotal: 18 * 7.8 });
  const poor = playerValue({ ...base, form: 48, ratedMatches: 18, ratingTotal: 18 * 5.8 });
  const unproven = playerValue(base);
  assert.ok(excellent > unproven);
  assert.ok(poor < unproven);
  assert.ok(excellent < unproven * 1.5);
  assert.ok(poor > unproven * 0.7);
});

test('world career migration preserves earned levels, transfers, loans, cash, age and stats and runs once', () => {
  const game = createGameFromDatabase(database, club('Flamengo').id, 42, database);
  delete game.balanceVersion;
  for (const c of game.clubs) for (const p of c.squad) {
    p.overall=p.calibration.legacyOverall; p.potential=p.calibration.legacyPotential; delete p.calibration;
  }
  const bayern=game.clubs.find(c=>c.name==='Bayern');
  const davies=bayern.squad.splice(bayern.squad.findIndex(p=>p.name==='Alphonso Davies'),1)[0];
  davies.overall+=1; davies.age+=1; davies.goals=4; davies.assists=8; davies.ratingTotal=55; davies.ratedMatches=7;
  davies.loan={ ownerClubId:bayern.id, borrowerClubId:game.userClubId, endSeason:1 };
  getUserClub(game).squad.push(davies);
  const cash=game.clubs.map(c=>c.budget), fixtures=JSON.stringify(game.schedule), loan=structuredClone(davies.loan);
  assert.equal(migratePlayerBalance(game,database),true);
  assert.equal(davies.overall,85); assert.equal(davies.age,26);
  assert.equal(davies.goals,4); assert.equal(davies.assists,8); assert.equal(davies.ratingTotal,55); assert.equal(davies.ratedMatches,7);
  assert.deepEqual(davies.loan,loan); assert.ok(getUserClub(game).squad.includes(davies));
  assert.deepEqual(game.clubs.map(c=>c.budget),cash); assert.equal(JSON.stringify(game.schedule),fixtures);
  assert.equal(game.balanceVersion,BALANCE_VERSION);
  const snapshot=JSON.stringify(game);
  assert.equal(migratePlayerBalance(game,database),false); assert.equal(JSON.stringify(game),snapshot);
});

test('repeated balance migrations preserve real development without stacking old calibration gains', () => {
  const game = createGameFromDatabase(database, club('Flamengo').id, 42, database);
  const athlete = game.clubs.find(team => team.name === 'Manthiqueira').squad[0];
  const base = player('Manthiqueira', athlete.name);
  game.balanceVersion = BALANCE_VERSION - 1;
  delete athlete.calibration.baseOverall; delete athlete.calibration.basePotential;
  athlete.overall = 99; athlete.potential = 99;
  athlete.progression = { season: game.season, overallGained: 1, overallLost: 0, potentialGained: 2, potentialLost: 0 };
  assert.equal(migratePlayerBalance(game, database), true);
  assert.equal(athlete.overall, base.overall + 1);
  assert.equal(athlete.potential, Math.max(athlete.overall, base.potential + 2));
  assert.equal(athlete.progression.startOverall, athlete.overall - 1);
  assert.equal(athlete.progression.startPotential, athlete.potential - 2);

  athlete.overall += 2; athlete.potential = Math.max(athlete.potential, athlete.overall + 1);
  const developed = { overall: athlete.overall, potential: athlete.potential };
  game.balanceVersion = BALANCE_VERSION - 1;
  assert.equal(migratePlayerBalance(game, database), true);
  assert.deepEqual({ overall: athlete.overall, potential: athlete.potential }, developed);
});

test('migration waits for the current match and does not overwrite custom imported databases', () => {
  const game=createGame(42); delete game.balanceVersion; game.activeMatch={phase:'paused'};
  const before=JSON.stringify(game);
  assert.equal(migratePlayerBalance(game),false); assert.equal(JSON.stringify(game),before);
  delete game.activeMatch; assert.equal(migratePlayerBalance(game),true);
  const custom=createGame(43); delete custom.balanceVersion; custom.databaseName='My CSV';
  const original=JSON.stringify(custom); assert.equal(migratePlayerBalance(custom),false); assert.equal(JSON.stringify(custom),original);
});
