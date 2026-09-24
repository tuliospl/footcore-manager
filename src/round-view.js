import { badgeContent } from "./club-badge.js";
import { escapeHtml } from "./html.js";
import { getClub, seasonLabel } from "./core.js";
import { liveRoundMatches } from "./match.js";
import { matchReport, formatRating } from "./ratings.js";
import { renderMatchEvents, renderTacticsBoard } from "./match-view.js";

const minuteLabel = minute => minute > 90 ? `90+${minute - 90}′` : `${minute}′`;
const noteClass = rating => rating == null ? "unrated" : rating >= 7 ? "good" : rating < 6 ? "poor" : "average";

function fixtureRows(game, matches, selected) {
  return matches.filter(match => ![match.homeId, match.awayId].includes(game.userClubId)).map(match => {
    const home = getClub(game, match.homeId);
    const away = getClub(game, match.awayId);
    return `<button class="round-fixture ${selected === home.id ? "fixture-selected" : ""}" data-round-match="${home.id}" aria-pressed="${selected === home.id}" aria-label="${escapeHtml(home.name)} ${match.homeGoals} a ${match.awayGoals} ${escapeHtml(away.name)}, ver informações">
      <span class="fixture-time">${match.phase === "finished" || match.minute == null ? "Fim" : minuteLabel(match.minute)}</span>
      <span class="fixture-club home-club"><i style="background:${home.colors[0]}">${badgeContent(home)}</i><strong>${escapeHtml(home.name)}</strong></span>
      <span class="fixture-score">${match.homeGoals} <span>×</span> ${match.awayGoals}</span>
      <span class="fixture-club"><i style="background:${away.colors[0]}">${badgeContent(away)}</i><strong>${escapeHtml(away.name)}</strong></span>
      <span class="fixture-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join("");
}

function featuredMatch(game, match) {
  if (!match) return "";
  const home = getClub(game, match.homeId);
  const away = getClub(game, match.awayId);
  const highlights = clubId => {
    const events = match.events.filter(event => event.clubId === clubId && (["goal", "red", "yellow", "penalty-miss"].includes(event.type) || event.scorerId)).reverse();
    return events.length ? events.map(event => `<li><span aria-hidden="true">${event.type === "yellow" ? "🟨" : event.type === "red" ? "🟥" : event.type === "penalty-miss" ? "✕" : "⚽"}</span> ${event.minute}′ · ${escapeHtml(event.message || `Gol de ${event.scorer}`)}</li>`).join("") : `<li class="quiet-event">Sem lances de destaque</li>`;
  };
  return `<div class="featured-heading"><span>Seu jogo · ${escapeHtml(home.stadium.name)}</span><button class="text-button" data-featured-match="${match.homeId}">${match.phase === "finished" ? "Ver resumo" : "Gerenciar time"} ↗</button></div><div class="featured-score"><strong class="featured-club" style="--club-bg:${home.colors[0]};--club-fg:${home.colors[1]}">${escapeHtml(home.name)}</strong><b>${match.homeGoals} <span>×</span> ${match.awayGoals}</b><strong class="featured-club" style="--club-bg:${away.colors[0]};--club-fg:${away.colors[1]}">${escapeHtml(away.name)}</strong></div><div class="featured-events"><ul tabindex="0" aria-label="Eventos de ${escapeHtml(home.name)}">${highlights(home.id)}</ul><ul tabindex="0" aria-label="Eventos de ${escapeHtml(away.name)}">${highlights(away.id)}</ul></div>`;
}

function playerTable(game, report, clubId) {
  const club = getClub(game, clubId);
  const players = report.playerReports?.[clubId];
  return `<section class="card player-ratings"><div class="card-header"><h3>${escapeHtml(club.name)}</h3><span>${report.formations?.[clubId] || ""}</span></div>${players ? `<div class="ratings-scroll"><table class="ratings-table"><thead><tr><th>Pos.</th><th>Jogador</th><th>Min.</th><th>Energia</th><th>G / A</th><th>Nota</th></tr></thead><tbody>${players.map(player => `<tr class="${player.status === "Reserva" ? "reserve-row" : ""}"><td>${player.position}</td><td><strong>${escapeHtml(player.name)}</strong><small>${player.status}${player.yellows ? ` · ${player.yellows} 🟨` : ""}${player.red ? " · 🟥" : ""}</small></td><td>${player.minutes}′</td><td>${player.energy}%</td><td>${player.goals} / ${player.assists}</td><td><span class="performance-note ${noteClass(player.rating)}">${formatRating(player.rating)}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="card-body view-note">As notas não foram registradas neste jogo antigo.</p>`}</section>`;
}

function detailView(game, match, panel, selectedPlayer, historical) {
  if (!match) return `<div class="round-hint"><span>↗</span><p>Clique em um jogo para ver os lances e as notas.<br><strong>No seu jogo, abra a prancheta para ajustar a equipe.</strong></p></div>`;
  const home = getClub(game, match.homeId);
  const away = getClub(game, match.awayId);
  const own = [home.id, away.id].includes(game.userClubId);
  const report = match.teams ? matchReport(game, match) : match;
  const canManage = own && !historical && match.phase !== "finished";
  const cards = id => match.events.filter(event => event.clubId === id && ["yellow", "red"].includes(event.type)).length;
  return `<section class="match-detail"><div class="detail-heading" tabindex="-1"><div><p class="eyebrow">${escapeHtml(home.stadium.name)} · ${canManage ? "Seu jogo" : "Informações do jogo"}</p><h3>${escapeHtml(home.name)} <b>${match.homeGoals} × ${match.awayGoals}</b> ${escapeHtml(away.name)}</h3></div><button class="secondary-button" data-close-match>Voltar aos jogos</button></div>
    <div class="detail-tabs"><button data-match-panel="stats" class="tactic-choice" aria-pressed="${panel !== "tactics" || !canManage}">Escalações e notas</button>${canManage ? `<button data-match-panel="tactics" class="tactic-choice" aria-pressed="${panel === "tactics"}">Táticas e substituições</button>` : `<span class="view-note">Somente consulta</span>`}<span class="detail-stats">Finalizações: ${report.shots?.[home.id] ?? "—"} × ${report.shots?.[away.id] ?? "—"} · Cartões: ${cards(home.id)} × ${cards(away.id)}</span></div>
    ${canManage && panel === "tactics" ? renderTacticsBoard(game, selectedPlayer) : `<div class="ratings-grid">${playerTable(game, report, home.id)}${playerTable(game, report, away.id)}</div><p class="ratings-caption">Notas de 1 a 10, estimadas pelos acontecimentos em campo. G / A = gols / assistências. Quem ainda não jogou fica sem nota.</p>`}
    <details class="card detail-events" ${panel === "tactics" ? "" : "open"}><summary>Lances do jogo · ${match.events.filter(event => !event.hidden).length} registros</summary>${renderMatchEvents(game, match.events)}</details>
  </section>`;
}

export function renderRound(game, speed, selected, panel, selectedPlayer, historical = false) {
  const matches = historical ? game.lastRound : liveRoundMatches(game);
  const own = game.activeMatch;
  const phase = historical ? "finished" : own?.phase || "ready";
  const minute = historical ? 90 : Math.max(0, ...matches.map(match => match.minute || 0));
  const selectedMatch = matches.find(match => match.homeId === selected);
  const actions = historical ? `<button class="secondary-button" data-go="dashboard">Voltar à central</button>`
    : phase === "finished" ? `<button class="primary-button" data-match-action="finish">Concluir rodada</button>`
    : phase === "penalty" ? `<button class="primary-button" data-open-penalty>Escolher cobrador e bater</button>`
    : phase === "playing" ? `<button class="primary-button" data-match-action="pause">Pausar rodada</button>`
    : `<button class="primary-button" data-match-action="play">${phase === "ready" ? "Iniciar rodada" : phase === "halftime" ? "Iniciar segundo tempo" : "Continuar rodada"}</button><button class="secondary-button" data-match-action="step">Avançar 5 minutos</button>`;
  return `<div class="page-heading"><div><p class="eyebrow">Campeonato · Temporada ${seasonLabel(game)}</p><h2>${historical ? "Resumo da rodada" : "Rodada ao vivo"}</h2></div><p>Clique nos placares para abrir os jogos</p></div>
    <section class="round-livebar" data-match-region="summary"><div><span class="live-dot"></span><strong>Rodada ${historical ? game.week : game.week + 1} de ${game.schedule.length}</strong></div><div><strong id="match-clock">${minuteLabel(minute)}</strong></div><progress max="96" value="${minute}" aria-label="Progresso da rodada"></progress></section>
    <div class="match-controls"><div class="match-actions" data-match-region="actions">${actions}</div>${historical ? "" : `<div class="match-speed-control"><span>Velocidade</span><button id="match-speed" type="button" class="secondary-button" data-speed="${speed}" aria-label="Velocidade ${speed === 250 ? "rápida. Alternar para normal" : "normal. Alternar para rápida"}">${speed === 250 ? "Rápida · 4×" : "Normal · 1×"}</button></div>`}</div>
    <div data-match-region="alert">${phase === "penalty" ? `<p class="match-alert" role="status">Pênalti para seu time. A rodada está pausada: escolha o jogador no popup e faça a cobrança.</p>` : ""}</div>
    <section class="card featured-match" data-match-region="featured">${featuredMatch(game, matches.find(match => [match.homeId, match.awayId].includes(game.userClubId)))}</section>
    <section class="card round-scoreboard"><div class="card-header"><h3>Outros jogos da rodada</h3><span>${historical ? "Resultados finais" : "Todos os jogos no mesmo relógio"}</span></div><div data-match-region="fixtures">${fixtureRows(game, matches, selected)}</div></section>
    <div data-match-region="details">${detailView(game, selectedMatch, panel, selectedPlayer, historical)}</div>`;
}
