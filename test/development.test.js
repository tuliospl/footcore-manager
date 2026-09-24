import test from 'node:test';
import assert from 'node:assert/strict';
import { developPlayer, agePlayer, developmentLabel, performanceSignal } from '../src/development.js';
import { playerMatchStats } from '../src/ratings.js';
import { createGame, advanceWeek, getUserClub, finishLiveRound } from '../src/core.js';
import { startMatch, resumeMatch, advanceMatchMinute, takePenalty, liveRoundMatches } from '../src/match.js';

const player = (fields = {}) => ({ id: 'athlete', name: 'Atleta', position: 'ATA', age: 21, overall: 75, potential: 83, form: 65, value: 1, ...fields });
const stats = (fields = {}) => ({ minutes: 90, rating: 6, goals: 0, assists: 0, yellows: 0, red: false, conceded: 1, cleanSheet: false, saves: 0, penaltySaves: 0, ...fields });
function run(p, report, count = 38, season = 1) { for (let i = 0; i < count; i++) developPlayer(p, report, season, `${season}:${i}`); }

function reportFixture(p, events, minutes = 90) {
  return { minute: 90, events, teams: { home: { participants: [p.id], onField: [p.id], replaced: [], sentOff: events.some(e => e.type === 'red' && e.playerId === p.id) ? [p.id] : [], minutes: { [p.id]: minutes }, energy: { [p.id]: 64 } } } };
}

test('sustained good and poor performances change both attributes and valuation gradually', () => {
  const good = player(), poor = player();
  developPlayer(good, stats({ rating: 9, goals: 2 }), 1, 'first');
  assert.equal(good.overall, 75); assert.equal(good.potential, 83);
  run(good, stats({ rating: 8, goals: 1, assists: 1 }));
  run(poor, stats({ rating: 4.5, conceded: 4, red: true }));
  assert.ok(good.overall > 75 && good.potential > 83);
  assert.ok(poor.overall < 75 && poor.potential < 83);
  assert.ok(good.value > poor.value);
  assert.ok(good.overall <= 79 && good.potential <= 86);
  assert.ok(poor.overall >= 71 && poor.potential >= 79);
});

test('potential needs sufficient playing time and unused or brief substitutes do not progress like starters', () => {
  const unused = player(), cameo = player(), regular = player();
  const before = structuredClone(unused);
  run(unused, stats({ minutes: 0, rating: null }));
  assert.deepEqual(unused, before);
  run(cameo, stats({ minutes: 1, rating: 10 }));
  assert.equal(cameo.potential, 83); assert.equal(cameo.overall, 75);
  run(regular, stats({ rating: 10 }), 4);
  assert.equal(regular.potential, 83);
  developPlayer(regular, stats({ rating: 10 }), 1, 'fifth');
  assert.ok(regular.potential > 83);
});

test('young regulars and prime-age standouts show visible progress within a season', () => {
  const young = player({ age: 20 });
  const prime = player({ age: 27 });
  run(young, stats({ rating: 6.5 }), 18);
  run(prime, stats({ rating: 7.4 }), 18);
  assert.ok(young.overall >= 77);
  assert.ok(prime.overall >= 78);
  assert.ok(prime.potential >= 85);
});

test('goals, assists and cards flow from the match report into progression', () => {
  const base = player();
  const scoring = [
    { type: 'goal', clubId: 'home', scorerId: base.id, minute: 12 },
    { type: 'goal', clubId: 'home', assisterId: base.id, minute: 60 }
  ];
  const cards = [{ type: 'yellow', playerId: base.id, minute: 30 }, { type: 'red', playerId: base.id, minute: 90 }];
  const positive = playerMatchStats(reportFixture(base, scoring), 'home', base);
  const negative = playerMatchStats(reportFixture(base, cards), 'home', base);
  assert.equal(positive.goals, 1); assert.equal(positive.assists, 1);
  assert.equal(negative.yellows, 1); assert.equal(negative.red, true);
  const good = player(), poor = player(); run(good, positive); run(poor, negative);
  assert.ok(good.overall > poor.overall); assert.ok(good.potential > poor.potential);
});

test('rare contributions are worth more by position and tactical actions stay capped', () => {
  const striker = player({ position: 'ATA' });
  const defender = player({ position: 'ZAG' });
  const goal = athlete => playerMatchStats(reportFixture(athlete, [{ type: 'goal', clubId: 'home', scorerId: athlete.id, minute: 30 }]), 'home', athlete);
  assert.ok(goal(defender).rating > goal(striker).rating);

  const midfielder = player({ position: 'MC' });
  const actions = [
    ...Array.from({ length: 30 }, (_, index) => ({ type: 'tackle', clubId: 'home', playerId: midfielder.id, minute: index + 1, hidden: true })),
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'key-pass', clubId: 'home', playerId: midfielder.id, minute: index + 31, hidden: true })),
    { type: 'goal', clubId: 'home', scorerId: 'other', assisterId: 'assistant', preAssisterId: midfielder.id, minute: 70 }
  ];
  const result = playerMatchStats(reportFixture(midfielder, actions), 'home', midfielder);
  assert.equal(result.tackles, 30); assert.equal(result.keyPasses, 20); assert.equal(result.preAssists, 1);
  assert.ok(result.rating > 7); assert.ok(result.rating <= 7.5);
  developPlayer(midfielder, result, 1, 'actions');
  assert.equal(midfielder.progression.tackles, 30); assert.equal(midfielder.progression.keyPasses, 20); assert.equal(midfielder.progression.preAssists, 1);
});

test('elite players are judged against a higher performance expectation', () => {
  const regular = player({ overall: 72 });
  const elite = player({ overall: 92, potential: 94 });
  assert.ok(performanceSignal(elite, stats({ rating: 6.5 })) < performanceSignal(regular, stats({ rating: 6.5 })));
});

test('keepers receive credit for actual saves, not penalties kicked wide', () => {
  const keeper = player({ position: 'GOL' });
  const saved = { type: 'penalty-miss', clubId: 'away', playerId: 'shooter', keeperId: keeper.id, saved: true, minute: 40 };
  const savedStats = playerMatchStats(reportFixture(keeper, [saved]), 'home', keeper);
  const wideStats = playerMatchStats(reportFixture(keeper, [{ ...saved, saved: false, keeperId: null }]), 'home', keeper);
  assert.equal(savedStats.penaltySaves, 1); assert.equal(savedStats.saves, 1);
  assert.equal(wideStats.penaltySaves, 0); assert.ok(savedStats.rating > wideStats.rating);
  run(keeper, savedStats, 12);
  assert.ok(keeper.potential > 83);
  assert.equal(keeper.progression.penaltySaves, 12);
});

test('clean sheets help goalkeepers, centre backs and fullbacks while repeated concessions hurt', () => {
  for (const position of ['GOL', 'ZAG', 'LAT']) {
    const good = player({ position }), poor = player({ position });
    const goals = Array.from({ length: 4 }, (_, i) => ({ type: 'goal', clubId: 'away', scorerId: 'opponent', minute: 10 + i * 10 }));
    run(good, playerMatchStats(reportFixture(good, []), 'home', good));
    run(poor, playerMatchStats(reportFixture(poor, goals), 'home', poor));
    assert.ok(good.potential > 83, position); assert.ok(poor.potential < 83, position);
    assert.ok(good.overall > poor.overall, position);
    assert.equal(good.progression.cleanSheets, 38);
    assert.equal(poor.progression.conceded, 152);
  }
});

test('goals and saves after substitution do not affect the departing player', () => {
  const keeper = player({ position: 'GOL' });
  const events = [
    { type: 'substitution', outId: keeper.id, inId: 'replacement', minute: 60 },
    { type: 'goal', clubId: 'away', minute: 70 },
    { type: 'penalty-miss', clubId: 'away', keeperId: 'replacement', saved: true, minute: 80 }
  ];
  const result = playerMatchStats(reportFixture(keeper, events, 60), 'home', keeper);
  assert.equal(result.conceded, 0); assert.equal(result.penaltySaves, 0); assert.equal(result.cleanSheet, true);
});

test('age decline applies once to all players, later for goalkeepers, and can offset good form', () => {
  const veteran = player({ age: 35, potential: 75 }), keeper = player({ age: 35, position: 'GOL', potential: 75 });
  agePlayer(veteran, 1); agePlayer(keeper, 1);
  assert.equal(veteran.age, 36); assert.ok(veteran.overall < keeper.overall);
  assert.ok(veteran.potential < 75);
  const once = structuredClone(veteran); agePlayer(veteran, 1); assert.deepEqual(veteran, once);
  const young = player({ age: 21 }); agePlayer(young, 1); assert.equal(young.overall, 75);
});

test('progress survives save/reload, cannot be recorded twice, and resets seasonal caps without resetting attributes', () => {
  const p = player(); run(p, stats({ rating: 8 }), 10);
  const saved = JSON.parse(JSON.stringify(p));
  developPlayer(p, stats({ rating: 8 }), 1, 'next'); developPlayer(saved, stats({ rating: 8 }), 1, 'next');
  assert.deepEqual(saved, p);
  const once = structuredClone(p); developPlayer(p, stats({ rating: 8 }), 1, 'next'); assert.deepEqual(p, once);
  const overall = p.overall, potential = p.potential;
  developPlayer(p, stats(), 2, 'new-season');
  assert.equal(p.progression.startOverall, overall); assert.equal(p.progression.startPotential, potential);
  assert.equal(p.progression.matches, 1);
  assert.match(developmentLabel(p, 2), /Temporada: geral/);
});

test('elite ratings and potential stay bounded through extreme performances and old saves need no migration', () => {
  for (const rating of [1, 10]) {
    const p = player({ overall: rating === 1 ? 2 : 98, potential: rating === 1 ? 2 : 99, development: 0.9 });
    run(p, stats({ rating }), 100);
    assert.ok(p.overall >= 1 && p.overall <= p.potential && p.potential <= 99);
    assert.ok(Number.isFinite(p.value));
  }
});

test('quick simulations develop every participating club and keep unused reserves unchanged', () => {
  const game = createGame(41);
  advanceWeek(game);
  for (const club of game.clubs) {
    for (const p of club.squad) {
      if (p.appearances) assert.equal(p.progression.matches, 1);
      else assert.equal(p.progression, undefined);
    }
  }
  assert.ok(game.lastRound.some(r => r.events.some(e => e.saved)));
});

test('live matches record development only at finalization, exactly once', () => {
  const game = createGame(42); startMatch(game);
  for (let i = 0; i < 240 && game.activeMatch.phase !== 'finished'; i++) {
    if (game.activeMatch.phase === 'penalty') takePenalty(game);
    else { if (game.activeMatch.phase !== 'playing') resumeMatch(game); advanceMatchMinute(game); }
  }
  assert.equal(game.activeMatch.phase, 'finished');
  assert.ok(liveRoundMatches(game).every(m => m.phase === 'finished'));
  assert.ok(getUserClub(game).squad.every(p => !p.progression));
  assert.equal(finishLiveRound(game).ok, true);
  assert.ok(getUserClub(game).squad.filter(p => p.appearances).every(p => p.progression.matches === 1));
  const snapshot = JSON.stringify(game); assert.equal(finishLiveRound(game).ok, false); assert.equal(JSON.stringify(game), snapshot);
});
