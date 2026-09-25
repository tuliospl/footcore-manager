// Stable decisions per season/player: reloading does not reroll a negotiation.
function chance(key) {
  let h=2166136261;
  for(const ch of key) h=Math.imul(h^ch.charCodeAt(0),16777619);
  h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)/4294967296;
}

export function ensureContracts(game) {
  for(const club of game.clubs) for(const player of club.squad) {
    if(player.contractEndSeason===undefined) {
      let hash=0; for(const ch of player.id) hash=(hash*31+ch.charCodeAt(0))>>>0;
      player.contractEndSeason=game.season+(hash%3);
    }
  }
}
export function freeAgentFee(player) { return Math.max(10000, Math.round(player.value * 0.08 / 1000) * 1000); }
export function renewContract(game, playerId) {
  if(game.activeMatch) return {ok:false,message:'Conclua a partida antes de renovar contratos.'};
  const club=game.clubs.find(c=>c.id===game.userClubId), player=club.squad.find(p=>p.id===playerId);
  if(!player||player.loan) return {ok:false,message:'Você só pode renovar com atletas próprios do clube.'};
  if(player.contractEndSeason>=game.season+2) return {ok:false,message:'O contrato já cobre esta temporada e as duas seguintes.'};
  const fee=player.salary*4;
  if(club.budget<fee) return {ok:false,message:'Caixa insuficiente para as luvas da renovação.'};
  club.budget-=fee; recordSeasonFinance(game,club.id,'contratos',fee,'expense'); player.contractEndSeason=game.season+2;
  return {ok:true,message:'Contrato renovado por esta temporada e mais duas.'};
}
export function expireContracts(game) {
  ensureContracts(game);
  if(game.contractReview?.season!==game.season) game.contractReview={season:game.season,strongReleases:0};
  for(const club of game.clubs) {
    const core=new Set([...club.squad].sort((a,b)=>b.overall-a.overall).slice(0,14).map(p=>p.id));
    let released=0;
    for(const player of [...club.squad]) {
      if(player.loan||player.contractEndSeason>game.season) continue;
      const remaining=club.squad.filter(p=>p.id!==player.id);
      const safe=remaining.length>=14&&remaining.some(p=>p.position==='GOL')&&remaining.filter(p=>p.position!=='GOL').length>=10;
      const important=core.has(player.id)||player.overall>=80;
      const probability=important ? (player.age<=23 ? 0.002 : 0.005) : player.age<=23 ? 0.04 : player.age>=32 ? 0.4 : 0.18;
      const failedRenewal=chance(`${game.seed}:${game.season}:${club.id}:${player.id}:renewal`) < probability;
      const strongLimit=player.overall>=80 && game.contractReview.strongReleases>=2;
      const renew = !safe || (club.id!==game.userClubId && (released>=2 || strongLimit || !failedRenewal));
      if(renew) {
        player.contractEndSeason=game.season+2;
        if(club.id===game.userClubId) game.news.unshift({id:`renew-safety-${player.id}-${game.season}`,type:'info',title:`${player.name}: renovação de segurança`,body:'Renovação automática sem luvas para manter pelo menos 14 atletas, um goleiro e dez jogadores de linha.'});
        continue;
      }
      club.squad.splice(club.squad.indexOf(player),1);
      player.previousClub=club.name; player.previousClubId=club.id; player.freeAgentOrigin='expired';
      player.freeSinceSeason=game.season; player.freeSinceWeek=game.week;
      if(club.id!==game.userClubId&&player.overall>=80)game.contractReview.strongReleases++;
      delete player.contractEndSeason;
      player.askingPrice=freeAgentFee(player);
      game.market.push(player); released++;
      if(club.id===game.userClubId) game.news.unshift({id:`expired-${player.id}-${game.season}`,type:'info',title:`${player.name} ficou livre`,body:'O contrato terminou sem renovação. O jogador deixou o clube sem taxa de transferência.'});
    }
  }
}


export function recruitFreeAgents(game) {
  if(game.activeMatch||game.finished||!game.market.length) return;
  const reviewKey=`${game.season}:${game.week}`;
  if(game.freeAgentReview===reviewKey) return;
  game.freeAgentReview=reviewKey;
  // A changing deterministic order avoids favoring the first club in the database.
  const clubs=game.clubs.filter(c=>c.id!==game.userClubId).sort((a,b)=>chance(`${game.seed}:${reviewKey}:${a.id}:order`)-chance(`${game.seed}:${reviewKey}:${b.id}:order`));
  let signed=0;
  for(const club of clubs) {
    if(signed>=4) break;
    const ownedLoans=game.clubs.reduce((n,c)=>n+c.squad.filter(p=>p.loan?.ownerClubId===club.id&&p.loan.borrowerClubId!==club.id).length,0);
    if(club.squad.length+ownedLoans>=(game.leagues?40:24) || chance(`${game.seed}:${reviewKey}:${club.id}:search`)>0.15) continue;
    const average=club.squad.reduce((n,p)=>n+p.overall,0)/club.squad.length;
    const payroll=club.squad.reduce((n,p)=>n+p.salary,0);
    const candidates=game.market.filter(p=>{
      if(p.freeAgentOrigin!=='expired'||p.previousClubId===club.id||p.loan) return false;
      // Let the manager inspect new opportunities before other clubs sign them.
      if(p.freeSinceSeason===game.season && game.week <= (p.freeSinceWeek??0)+1) return false;
      const peers=club.squad.filter(other=>other.position===p.position);
      const improves=peers.length<2||p.overall>Math.min(...peers.map(other=>other.overall))+2;
      // Strong players prefer a club close to their level; prospective pay must fit.
      return improves && p.overall<=average+12 && club.budget>=p.askingPrice+(payroll+p.salary)*4;
    }).sort((a,b)=>b.overall-a.overall||a.askingPrice-b.askingPrice||a.id.localeCompare(b.id));
    const player=candidates[0];if(!player)continue;
    const fee=player.askingPrice;
    club.budget-=fee;recordSeasonFinance(game,club.id,'transferencias',fee,'expense');game.market.splice(game.market.indexOf(player),1);club.squad.push(player);
    player.contractEndSeason=game.season+2;
    delete player.askingPrice;delete player.freeAgentOrigin;delete player.previousClub;delete player.previousClubId;delete player.freeSinceSeason;delete player.freeSinceWeek;
    game.freeAgentDeals=[{season:game.season,week:game.week,clubId:club.id,clubName:club.name,playerId:player.id,playerName:player.name,fee},...(game.freeAgentDeals||[])].slice(0,30);
    game.news.unshift({id:`free-signing-${game.season}-${game.week}-${player.id}`,type:'info',title:`${player.name} acertou com ${club.name}`,body:'O atleta deixou o mercado de jogadores livres e assinou um novo contrato.'});
    game.news=game.news.slice(0,200);signed++;
  }
}
import { recordSeasonFinance } from "./season-tracking.js";
