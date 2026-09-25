import { escapeHtml as html } from './html.js';
import { FORMATIONS, formationPositions, positionalRating } from './tactics.js';
import { ensureLineup, moveLineupPlayer, setLineupFormation, BENCH_LIMIT } from './lineup.js';
import { teamShirtMarkup } from './team-shirt.js';

export class LineupEditor {
  constructor(content, { getGame, onChange, onStart, onMessage }) {
    Object.assign(this,{content,getGame,onChange,onStart,onMessage}); this.selected=null; this.drag=null; this.suppressUntil=0;
    content.addEventListener('change',event=>{
      if(this.locked())return;
      if(event.target.id==='lineup-formation')this.apply(setLineupFormation(this.club(),event.target.value));
      if(event.target.id==='marking-intensity'){
        this.club().markingIntensity=event.target.value;
        this.apply({ok:true,message:`Marcação ${event.target.options[event.target.selectedIndex].text.toLocaleLowerCase('pt-BR')} selecionada.`});
      }
    });
    content.addEventListener('click',event=>{
      if(!content.querySelector('#lineup-editor')||this.locked()||Date.now()<this.suppressUntil)return;
      if(event.target.closest('#lineup-start')) { onStart(); return; }
      if(event.target.closest('#lineup-auto')) { delete this.club().lineup;this.apply({ok:true,message:'Escalação automática aplicada.'});return; }
      const remove=event.target.closest('[data-plan-remove]');
      if(remove){this.apply(moveLineupPlayer(this.club(),remove.dataset.planRemove,'outside'));return;}
      const add=event.target.closest('[data-plan-add]');
      if(add){const plan=ensureLineup(this.club());this.apply(plan.bench.length>=BENCH_LIMIT?{ok:false,message:'Banco cheio. Retire um reserva antes de relacionar outro.'}:moveLineupPlayer(this.club(),add.dataset.planAdd,'bench',plan.bench.length));return;}
      const target=event.target.closest('[data-plan-target]'), player=event.target.closest('[data-plan-player]');
      if(this.selected&&target&&this.selected!==player?.dataset.planPlayer){this.move(this.selected,target);return;}
      if(player){this.selected=this.selected===player.dataset.planPlayer?null:player.dataset.planPlayer;this.render();}
    });
    content.addEventListener('dragstart',e=>{if(e.target.closest('[data-plan-player]'))e.preventDefault();});
    content.addEventListener('pointerdown',e=>{
      const player=e.target.closest('[data-plan-player]');
      if(!player||this.locked()||e.button!==0)return;
      this.drag={id:player.dataset.planPlayer,x:e.clientX,y:e.clientY,pointerId:e.pointerId,moving:false,source:player};
    });
    content.addEventListener('pointermove',e=>{
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
      if(!d.moving&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
      e.preventDefault();
      if(!d.moving){d.moving=true;content.setPointerCapture(e.pointerId);d.source.classList.add('drag-origin');const ghost=document.createElement('div');ghost.className='plan-drag-preview match-drag-preview';ghost.textContent=d.source.querySelector('strong').textContent;document.body.append(ghost);}
      const ghost=document.querySelector('.plan-drag-preview');ghost.style.left=`${e.clientX+12}px`;ghost.style.top=`${e.clientY+12}px`;
      content.querySelectorAll('[data-plan-target]').forEach(el=>el.classList.remove('drop-target'));
      document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-plan-target]')?.classList.add('drop-target');
    });
    content.addEventListener('pointerup',e=>{
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-plan-target]');
      this.clearDrag();if(content.hasPointerCapture(e.pointerId))content.releasePointerCapture(e.pointerId);
      if(d.moving){this.suppressUntil=Date.now()+300;if(target&&!this.locked())this.move(d.id,target);}
    });
    content.addEventListener('pointercancel',()=>this.clearDrag());
    content.addEventListener('lostpointercapture',()=>this.clearDrag());
  }
  club(){const game=this.getGame();return game.clubs.find(c=>c.id===game.userClubId);}
  locked(){return !!this.getGame()?.activeMatch;}
  clearDrag(){document.querySelector('.plan-drag-preview')?.remove();this.content.querySelectorAll('[data-plan-target], [data-plan-player]').forEach(el=>el.classList.remove('drop-target','drag-origin'));this.drag=null;}
  move(id,target){this.apply(moveLineupPlayer(this.club(),id,target.dataset.planTarget,Number(target.dataset.planIndex)));}
  apply(result){if(result.ok){this.selected=null;ensureLineup(this.club());this.onChange();}if(result.message)this.onMessage(result.message,!result.ok);this.render();}
  render(){
    if(this.locked()){this.content.innerHTML='<section class="card card-body"><h2>Partida em andamento</h2><p>A escalação desta partida é ajustada na prancheta tática.</p><button class="primary-button" data-go="match">Voltar à partida</button></section>';return;}
    const club=this.club(), plan=ensureLineup(club), positions=formationPositions(club.formation);
    const unavailable=p=>p.suspensionMatches>0||p.injuryMatches>0;
    const discipline=p=>p.yellowCardAccumulation?`<span class="discipline-status">🟨 ${p.yellowCardAccumulation}/3${p.yellowCardAccumulation===2?' · pendurado':''}</span>`:'';
    const absence=p=>p.injuryMatches>0?`🏥 ${p.injuryLabel||'Lesionado'} · ${p.injuryMatches} ${p.injuryMatches===1?'partida':'partidas'}`:`${p.suspensionReason==='yellow'?'🟨':'🟥'} Suspenso por 1 partida`;
    if(!club.squad.some(p=>p.id===this.selected&&!unavailable(p)))this.selected=null;
    const chip=(id,target,index)=>{
      const p=club.squad.find(p=>p.id===id);
      const attrs=`data-plan-target="${target}" data-plan-index="${index}"`;
      if(!p)return `<button class="${target==='slots'?'pitch-player':'bench-player'} empty-slot" ${attrs}>${target==='slots'?teamShirtMarkup(club,positions[index]):'Vaga no banco'}<small>Selecione ou arraste um jogador</small></button>`;
      const r=target==='slots'?positionalRating(p,positions[index]):{overall:p.overall,outOfPosition:false};
      return `<button class="${target==='slots'?'pitch-player':'bench-player'} ${r.outOfPosition?'out-of-position':''} ${this.selected===id?'player-selected':''}" data-plan-player="${id}" ${attrs} draggable="true" aria-pressed="${this.selected===id}" aria-label="${html(p.name)}, ${target==='slots'?'titular '+positions[index]:'reserva'}, geral ${r.overall}">${teamShirtMarkup(club,target==='slots'?positions[index]:p.position)}<strong>${html(p.name)}</strong><small>${r.outOfPosition?`${p.position} → ${positions[index]} · Fora de posição`:p.position}</small><span class="effective-rating">${r.outOfPosition?`<s>${p.overall}</s> → `:''}GER ${r.overall}</span>${discipline(p)}</button>`;
    };
    let slot=0;const rows=FORMATIONS[club.formation].map(row=>`<div class="pitch-row" style="--players:${row.length}">${row.map(()=>chip(plan.slots[slot],'slots',slot++)).join('')}</div>`).reverse().join('');
    const outside=club.squad.filter(p=>!plan.slots.includes(p.id)&&!plan.bench.includes(p.id));
    this.content.innerHTML=`<section id="lineup-editor"><div class="page-heading"><div><p class="eyebrow">Preparação para a partida</p><h2>Escalação</h2></div><button id="lineup-start" class="primary-button" ${this.getGame().finished?'disabled':''}>Ir a jogo →</button></div>
      <div class="card lineup-toolbar"><label>Esquema tático<select id="lineup-formation">${Object.keys(FORMATIONS).map(f=>`<option ${f===club.formation?'selected':''}>${f}</option>`).join('')}</select></label><label>Postura tática<select id="tactic">${[['defensivo','Defensiva'],['equilibrado','Equilibrada'],['ofensivo','Ofensiva']].map(([v,l])=>`<option value="${v}" ${club.tactic===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Marcação<select id="marking-intensity">${[['leve','Leve'],['moderada','Moderada'],['pesada','Pesada']].map(([v,l])=>`<option value="${v}" ${club.markingIntensity===v?'selected':''}>${l}</option>`).join('')}</select></label><button id="lineup-auto" class="secondary-button">Escalar automaticamente</button><p class="view-note">Marcação leve economiza energia e reduz cartões, mas cede mais espaço. A pesada aumenta desarmes e dificulta chances rivais, com mais desgaste, faltas e expulsões.</p></div>
      <div class="tactics-layout lineup-preparation"><div class="stack"><section class="card"><div class="card-header"><h3>Titulares</h3><span>11 jogadores · ${club.formation}</span></div><div class="lineup-pitch"><div class="field-markings" aria-hidden="true"><span class="field-center-circle"></span><span class="field-center-spot"></span><span class="field-box field-box-top"><i></i><b></b></span><span class="field-box field-box-bottom"><i></i><b></b></span></div>${rows}</div></section><section class="card match-bench"><div class="card-header"><h3>Reservas</h3><span>${plan.bench.length}/${BENCH_LIMIT}</span></div><div class="bench-grid">${Array.from({length:BENCH_LIMIT},(_,i)=>`<div>${chip(plan.bench[i],'bench',i)}${plan.bench[i]?`<button class="text-button" data-plan-remove="${plan.bench[i]}">Não relacionar</button>`:''}</div>`).join('')}</div></section></div></div>
      <section class="card lineup-outside"><div class="card-header"><h3>Não relacionados</h3><span>${outside.length} jogadores</span></div><div class="bench-grid">${outside.map(p=>`<div><button class="bench-player ${this.selected===p.id?'player-selected':''}" ${unavailable(p)?'disabled':`data-plan-player="${p.id}" draggable="true" aria-pressed="${this.selected===p.id}"`}>${teamShirtMarkup(club,p.position)}<strong>${html(p.name)}</strong><small>${unavailable(p)?absence(p):`GER ${p.overall} · ${p.age} anos`}</small>${discipline(p)}</button>${unavailable(p)?'':`<button class="text-button" data-plan-add="${p.id}">Relacionar no banco</button>`}</div>`).join('')||'<p class="view-note">Todos os jogadores estão relacionados.</p>'}</div></section></section>`;
  }
}
