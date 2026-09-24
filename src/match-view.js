import { escapeHtml } from "./html.js";
import { getClub } from "./core.js";
import { FORMATIONS, formationPositions } from "./tactics.js";
import { formatRating, playerMatchStats } from "./ratings.js";
import { matchPlayerRating } from "./match.js";

export function renderMatchEvents(game, events) {
  return `<ol class="match-events">${events.filter(event => !event.hidden).reverse().map(event => `<li class="event-${event.type || "goal"}"><time>${event.minute}′</time><div><strong>${escapeHtml(event.clubId ? getClub(game, event.clubId).shortName : "Arbitragem")}</strong><p>${escapeHtml(event.message || `Gol de ${event.scorer}${event.assister ? `, passe de ${event.assister}` : ""}.`)}</p></div></li>`).join("")}</ol>`;
}

export function renderTacticsBoard(game, selectedPlayer = null) {
  const match = game.activeMatch;
  if (!match) return "";
  const home = getClub(game, match.homeId);
  const away = getClub(game, match.awayId);
  const club = getClub(game, game.userClubId);
  const team = match.teams[club.id];
  const players = team.onField.map(id => club.squad.find(player => player.id === id));
  const bench = team.bench.map(id => club.squad.find(player => player.id === id));
  const editable = ["ready", "paused", "halftime"].includes(match.phase);
  const canSelect = editable || match.phase === "penalty";
  const positions = formationPositions(team.formation);
  const selected = club.squad.find(player => player.id === selectedPlayer);
  const taker = players.find(player => player.id === team.takerId);
  const goalVacant = !team.slots[0] || !team.onField.includes(team.slots[0]);
  const playerChip = (id, index) => {
    const player = players.find(item => item.id === id);
    if (!player) return `<button class="pitch-player empty-slot" data-match-slot="${index}" ${editable ? "" : "disabled"} aria-label="Posição ${positions[index]} vazia"><span class="pitch-shirt">${positions[index]}</span><strong>Vaga</strong><small>Equipe com ${team.onField.length}</small></button>`;
    const rating = matchPlayerRating(game, club.id, player);
    const isTaker = team.takerId === id;
    return `<button class="pitch-player ${rating.outOfPosition ? "out-of-position" : ""} ${selectedPlayer === id ? "player-selected" : ""}" data-match-player="${id}" data-match-slot="${index}" draggable="${editable}" ${canSelect ? "" : "disabled"} aria-pressed="${selectedPlayer === id}" aria-label="${escapeHtml(player.name)}, ${player.position} em ${positions[index]}, geral ${rating.overall}${rating.outOfPosition ? ", fora de posição" : ""}">
      <span class="pitch-shirt">${positions[index]}</span><strong>${escapeHtml(player.name)}</strong>
      <small>${rating.outOfPosition ? `${player.position} → ${positions[index]} · Fora de posição` : player.position}</small>
      <span class="effective-rating">${rating.outOfPosition ? `<s>${player.overall}</s> → ` : ""}GER ${rating.overall}${rating.loss ? ` (−${rating.loss})` : ""}</span>
      <span class="match-rating">Nota ${formatRating(playerMatchStats(match, club.id, player).rating)}</span><small>${Math.round(team.energy[id])}% energia${team.yellows[id] ? " · 🟨" : ""}${isTaker ? " · ⚽ Pênaltis" : ""}</small></button>`;
  };
  let slot = 0;
  const pitchRows = FORMATIONS[team.formation].map(row => {
    const indices = row.map(() => slot++);
    return `<div class="pitch-row" style="--players:${row.length}">${indices.map(index => playerChip(team.slots[index], index)).join("")}</div>`;
  }).reverse().join("");
  const benchChip = id => {
    const player = club.squad.find(item => item.id === id);
    const available = editable && (match.phase === "ready" || team.substitutions < 5);
    return `<button class="bench-player ${selectedPlayer === id ? "player-selected" : ""}" data-match-player="${id}" draggable="${available}" ${available ? "" : "disabled"} aria-pressed="${selectedPlayer === id}" aria-label="Reserva ${escapeHtml(player.name)}, ${player.position}, geral ${player.overall}"><span class="position-pill">${player.position}</span><strong>${escapeHtml(player.name)}</strong><small>GER ${player.overall} · ${Math.round(team.energy[id])}% energia</small></button>`;
  };
  return `<div class="live-grid tactics-layout"><div class="stack">
      <section class="card"><div class="card-header"><h3>Prancheta tática</h3><span>${team.formation} · ${team.onField.length} atletas</span></div>
        <div class="tactics-toolbar"><div><span class="control-caption">Esquema tático</span><div class="formation-options" role="group" aria-label="Esquema tático">${Object.keys(FORMATIONS).map(formation => `<button class="tactic-choice" data-formation="${formation}" aria-pressed="${team.formation === formation}" ${editable ? "" : "disabled"}>${formation}</button>`).join("")}</div></div>
        <div><span class="control-caption">Postura</span><div class="formation-options" role="group" aria-label="Postura tática">${[["defensivo", "Defensiva"], ["equilibrado", "Equilibrada"], ["ofensivo", "Ofensiva"]].map(([value, label]) => `<button class="tactic-choice" data-match-tactic="${value}" aria-pressed="${club.tactic === value}" ${editable ? "" : "disabled"}>${label}</button>`).join("")}</div></div>
        <div><span class="control-caption">Marcação</span><div class="formation-options" role="group" aria-label="Intensidade de marcação">${[["leve", "Leve"], ["moderada", "Moderada"], ["pesada", "Pesada"]].map(([value, label]) => `<button class="tactic-choice" data-match-marking="${value}" aria-pressed="${club.markingIntensity === value}" ${editable ? "" : "disabled"}>${label}</button>`).join("")}</div></div>
        <p class="view-note">Leve: menos desgaste e cartões. Pesada: mais desarmes e proteção defensiva, porém mais fadiga e risco disciplinar.</p>
        <p class="view-note">${goalVacant ? "A posição GOL está vazia. Mova um atleta em campo para o gol ou substitua alguém por um goleiro reserva antes de continuar." : match.phase === "playing" ? "Pause para arrastar jogadores, substituir ou ajustar o esquema." : match.phase === "finished" ? "Partida encerrada." : match.phase === "penalty" ? "Clique no jogador em campo e defina o cobrador." : "Arraste um reserva sobre um titular para trocar. Arraste titulares entre posições, ou clique no jogador e depois no destino."}</p></div>
        <div class="lineup-pitch">${pitchRows}</div>
        <div class="player-inspector" aria-live="polite"><p><strong>Cobrador de pênaltis:</strong> ${escapeHtml(taker?.name || "Escolha um atleta")}</p>${selected && canSelect ? `<p><strong>${escapeHtml(selected.name)}</strong> · Origem: ${selected.position} · Geral natural ${selected.overall}</p>${team.onField.includes(selected.id) ? `<button class="secondary-button" data-set-taker="${selected.id}">Definir como cobrador</button>` : `<p>Selecione no campo quem será substituído.</p>`}<button class="action-button" data-clear-player>Cancelar seleção</button>` : `<p class="view-note">Selecione um atleta em campo para defini-lo como cobrador.</p>`}
        <p class="position-legend">Vermelho = fora de posição. Geral −10% em outra posição do mesmo setor; −20% em outro setor; −50% ao improvisar no gol. A redução vale na partida.</p></div>
      </section>
      <section class="card match-bench"><div class="card-header"><h3>Banco de reservas</h3><span>${team.substitutions}/5 substituições</span></div><div class="bench-grid">${team.bench.map(benchChip).join("") || `<p class="view-note">Nenhum reserva disponível.</p>`}</div><div class="bench-notes"><p class="view-note">${match.phase === "ready" ? "Trocas antes do início são livres e não contam como substituição." : "Quem sai não volta. Arraste o reserva sobre um jogador em campo; vagas por expulsão não podem ser preenchidas."}</p>${team.replaced.length ? `<p><strong>Já saíram:</strong> ${team.replaced.map(id => escapeHtml(club.squad.find(player => player.id === id).name)).join(", ")}</p>` : ""}${team.sentOff.length ? `<p class="dismissed-note"><strong>Expulsos:</strong> ${team.sentOff.map(id => escapeHtml(club.squad.find(player => player.id === id).name)).join(", ")}</p>` : ""}</div></section>
    </div></div>`;
}
