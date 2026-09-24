import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getUserClub, getLineup, clubStrength } from '../src/core.js';
import { startMatch, moveMatchPlayer, setMatchFormation } from '../src/match.js';
import { BENCH_POSITIONS, ensureLineup, lineupError, moveLineupPlayer, setLineupFormation } from '../src/lineup.js';

function setup(){const game=createGame(42),club=getUserClub(game);for(let i=0;i<10;i++)club.squad.push({...club.squad[10+i%5],id:`extra-${i}`,name:`Reserva ${i}`});return {game,club,plan:ensureLineup(club)};}

test('automatic lineup covers every available position on the bench without imposing a manual rule',()=>{
  const positions=['GOL','ZAG','ZAG','LAT','LAT','VOL','MC','MC','MC','ATA','ATA',...BENCH_POSITIONS,'MC'];
  const club={formation:'4-4-2',squad:positions.map((position,index)=>({id:`balanced-${index}`,name:`Jogador ${index}`,position,overall:90-index}))};
  const plan=ensureLineup(club);
  assert.deepEqual(new Set(plan.bench.map(id=>club.squad.find(player=>player.id===id).position)),new Set(BENCH_POSITIONS));
  assert.ok(moveLineupPlayer(club,plan.bench[1],'outside').ok);
  assert.equal(plan.bench.length,6);
  assert.equal(lineupError(club),'');
});

test('manual starters, positions and only selected reserves survive JSON reload and enter the match',()=>{
  let {game,club,plan}=setup();
  const incoming=plan.bench.find(id=>club.squad.find(p=>p.id===id).position!=='GOL');
  const outgoing=plan.slots[10];
  assert.ok(moveLineupPlayer(club,incoming,'slots',10).ok);
  assert.equal(plan.slots[10],incoming);assert.ok(plan.bench.includes(outgoing));
  const bench=[...plan.bench];const slots=[...plan.slots];
  game=JSON.parse(JSON.stringify(game));club=getUserClub(game);
  assert.deepEqual(getLineup(club).map(p=>p.id),slots);
  assert.ok(startMatch(game).ok);
  assert.deepEqual(game.activeMatch.teams[club.id].slots,slots);
  assert.deepEqual(game.activeMatch.teams[club.id].bench,bench);
  const excluded=club.squad.find(p=>!slots.includes(p.id)&&!bench.includes(p.id));
  assert.equal(moveMatchPlayer(game,excluded.id,10).ok,false);
});

test('bench can be selected separately; duplicates, full bench and invalid goalkeeper swaps are prevented',()=>{
  const {club,plan}=setup();
  assert.equal(plan.bench.length,7);
  const excluded=club.squad.find(p=>!plan.slots.includes(p.id)&&!plan.bench.includes(p.id));
  assert.equal(moveLineupPlayer(club,excluded.id,'bench',7).ok,false);
  const removed=plan.bench[0];assert.ok(moveLineupPlayer(club,removed,'outside').ok);assert.equal(plan.bench.length,6);
  assert.ok(moveLineupPlayer(club,excluded.id,'bench',6).ok);assert.equal(plan.bench.length,7);
  assert.equal(new Set([...plan.slots,...plan.bench]).size,18);
  const before=JSON.stringify(plan);
  assert.equal(moveLineupPlayer(club,plan.slots[10],'slots',0).ok,false);
  assert.equal(moveLineupPlayer(club,plan.slots[0],'outside').ok,false);
  assert.equal(JSON.stringify(plan),before);
});

test('custom position penalty affects strength and formation changes retain the selected eleven',()=>{
  const {game,club,plan}=setup();
  const first=[...plan.slots];
  // Same eleven, deliberately exchange a forward and a defender.
  const natural=clubStrength(club);
  assert.ok(moveLineupPlayer(club,plan.slots[10],'slots',2).ok);
  assert.ok(clubStrength(club)<natural);
  assert.ok(setLineupFormation(club,'4-3-3').ok);
  assert.deepEqual([...plan.slots].sort(),first.sort());
  startMatch(game);setMatchFormation(game,'3-5-2');
  assert.equal(club.formation,'3-5-2');assert.equal(plan.slots.length,11);
});

test('a player leaving the squad repairs only that slot without resetting the rest of the plan',()=>{
  const {club,plan}=setup();const previous=[...plan.slots];
  club.squad=club.squad.filter(p=>p.id!==previous[2]);
  ensureLineup(club);assert.notEqual(plan.slots[2],previous[2]);
  previous.forEach((id,i)=>{if(i!==2)assert.equal(plan.slots[i],id);});
  assert.equal(new Set([...plan.slots,...plan.bench]).size,plan.slots.length+plan.bench.length);
});

test('injured players leave the match plan and cannot be manually selected',()=>{
  const {club,plan}=setup();
  const player=club.squad.find(item=>item.id===plan.slots[5]);
  player.injuryMatches=2;player.injuryLabel='Lesão moderada';
  ensureLineup(club);
  assert.ok(!plan.slots.includes(player.id));
  assert.ok(!plan.bench.includes(player.id));
  assert.equal(moveLineupPlayer(club,player.id,'bench',plan.bench.length).ok,false);
});
