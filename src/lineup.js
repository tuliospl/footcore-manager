import { FORMATIONS, formationPositions, arrangePlayers, positionalRating } from './tactics.js';
export const BENCH_LIMIT = 7;
export const BENCH_POSITIONS = ['GOL','ZAG','LAT','VOL','MC','ATA'];
const fail = message => ({ ok:false, message });
const unavailable = player => player.suspensionMatches>0 || player.injuryMatches>0;

export function automaticEleven(club) {
  const available = club.squad.filter(player=>!unavailable(player)).sort((a,b)=>b.overall-a.overall);
  const positions=formationPositions(club.formation);
  const slots=positions.map(position=>{
    const index=available.findIndex(p=>p.position===position);
    return index<0 ? null : available.splice(index,1)[0].id;
  });
  return slots.map((id,index)=>{
    if(id) return id;
    available.sort((a,b)=>positionalRating(b,positions[index]).overall-positionalRating(a,positions[index]).overall);
    return available.shift()?.id ?? null;
  });
}
export function automaticBench(club, slots) {
  const available=club.squad.filter(player=>!unavailable(player)&&!slots.includes(player.id));
  const selected=[];
  for(const position of BENCH_POSITIONS) {
    const candidates=available.filter(player=>player.position===position&&!selected.includes(player.id)).sort((a,b)=>b.overall-a.overall);
    if(candidates[0]) selected.push(candidates[0].id);
  }
  available.sort((a,b)=>b.overall-a.overall);
  for(const player of available) {
    if(selected.length>=BENCH_LIMIT) break;
    if(!selected.includes(player.id)) selected.push(player.id);
  }
  return selected;
}
export function ensureLineup(club) {
  if(!Object.hasOwn(FORMATIONS,club.formation)) club.formation='4-4-2';
  if(!club.lineup) {
    const slots=automaticEleven(club);
    club.lineup={slots,bench:automaticBench(club,slots)};
  }
  const ids=new Set(club.squad.filter(player=>!unavailable(player)).map(p=>p.id)), used=new Set();
  club.lineup.slots=Array.from({length:11},(_,i)=>{
    const id=club.lineup.slots?.[i];
    if(!ids.has(id)||used.has(id)) return null;
    used.add(id);return id;
  });
  // Transfers and expired loans repair only missing places, preserving deliberate choices.
  club.lineup.slots.forEach((id,i)=>{
    if(id) return;
    const position=formationPositions(club.formation)[i];
    const p=club.squad.filter(p=>!unavailable(p)&&!used.has(p.id)).sort((a,b)=>Number(b.position===position)-Number(a.position===position)||b.overall-a.overall)[0];
    if(p){club.lineup.slots[i]=p.id;used.add(p.id);}
  });
  club.lineup.bench=(club.lineup.bench||[]).filter(id=>{
    if(!ids.has(id)||used.has(id)) return false;
    used.add(id);return true;
  }).slice(0,BENCH_LIMIT);
  return club.lineup;
}
export function lineupError(club) {
  const plan=ensureLineup(club);
  if(plan.slots.filter(Boolean).length!==11) return 'Escolha 11 atletas disponíveis antes de ir a jogo; suspensos e lesionados não podem ser escalados.';
  if(club.squad.find(p=>p.id===plan.slots[0])?.position!=='GOL') return 'Escale um goleiro na posição GOL.';
  return '';
}
export function moveLineupPlayer(club, playerId, target, index) {
  const plan=ensureLineup(club), player=club.squad.find(p=>p.id===playerId);
  if(!player) return fail('Jogador não está mais no elenco.');
  if(player.suspensionMatches>0) return fail('Jogador suspenso não pode ser relacionado para esta partida.');
  if(player.injuryMatches>0) return fail('Jogador lesionado não pode ser relacionado até se recuperar.');
  if(!['slots','bench','outside'].includes(target)) return fail('Destino inválido.');
  const fromSlot=plan.slots.indexOf(playerId), fromBench=plan.bench.indexOf(playerId);
  if(target==='outside') {
    if(fromSlot>=0) return fail('Troque o titular por outro jogador para manter onze em campo.');
    if(fromBench>=0) plan.bench.splice(fromBench,1);
    return {ok:true,message:'Jogador não relacionado para a partida.'};
  }
  const limit=target==='slots'?11:BENCH_LIMIT;
  if(!Number.isInteger(index)||index<0||index>=limit) return fail('Posição inválida.');
  const targetId=plan[target][index] ?? null;
  if(targetId===playerId) return {ok:true};
  const incoming=club.squad.find(p=>p.id===targetId);
  if((target==='slots'&&index===0&&player.position!=='GOL') || (fromSlot===0&&incoming?.position!=='GOL')) return fail('Mantenha um goleiro na posição GOL.');
  if(target==='bench'&&fromSlot>=0&&!targetId) return fail('Escolha um reserva para trocar com o titular.');
  if(fromSlot>=0) plan.slots[fromSlot]=targetId;
  if(fromBench>=0) plan.bench[fromBench]=targetId;
  plan[target][index]=playerId;
  plan.bench=plan.bench.filter(Boolean);
  return {ok:true,message:'Escalação salva.'};
}
export function setLineupFormation(club, formation) {
  if(!Object.hasOwn(FORMATIONS,formation)) return fail('Esquema inválido.');
  const plan=ensureLineup(club);
  plan.slots=arrangePlayers(plan.slots.map(id=>club.squad.find(p=>p.id===id)).filter(Boolean),formation);
  club.formation=formation;
  return {ok:true,message:'Esquema alterado; os mesmos titulares foram reposicionados.'};
}
