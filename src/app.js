import { developmentLabel } from "./development.js";
import { LineupEditor } from "./lineup-view.js";
import { renewContract } from "./contracts.js";
import { defaultMarketFilters, MARKET_RANGES, MARKET_COLUMNS, marketFilterError } from "./market-filters.js";
import { needsBalanceMigration, migratePlayerBalance } from "./player-balance.js";
import { openCareerRepository } from "./career-repository.js";
import { CareerSetup } from "./career-setup.js";
import { badgeContent } from "./club-badge.js";
import { escapeHtml } from "./html.js";
import { teamShirtMarkup } from "./team-shirt.js";
import {
  finishLiveRound,
  ensureCareerManagement,
  normalizeMidfieldPositions,
  buyPlayer,
  bindUserLeague,
  seasonLabel,
  formatMoney,
  getClub,
  getLineup,
  getSortedTable,
  getUserClub,
  leagueSeasonRules,
  getTransferTerms,
  getExchangePlayerCredit,
  searchTransferMarket,
  makeTransferOffer,
  getClubListing,
  acceptClubListing,
  loanOutPlayer,
  acceptIncomingOffer,
  counterIncomingOffer,
  sellPlayer,
  rejectIncomingOffer,
  setTactic,
  setMarkingIntensity,
  stadiumUpgradeCost,
  startNextSeason,
  upgradeStadium
} from "./core.js";
import { startMatch, resumeMatch, pauseMatch, advanceMatchMinute, setPenaltyTaker, takePenalty, ensureLiveRound, setMatchFormation, moveMatchPlayer } from "./match.js";
import { renderMatchEvents } from "./match-view.js";
import { renderPenaltyDialog } from "./penalty-view.js";
import { renderRound } from "./round-view.js";
import { averageRating, formatRating } from "./ratings.js";
import {
  SCOUT_REGIONS,
  academyPotentialRange,
  dismissScout,
  ensureYouthAcademy,
  hireScout,
  promoteProspect,
  releaseProspect,
  scoutContractCost,
  scoutExperienceLabel,
  scoutMarketRoundsRemaining,
  sortYouthProspects,
  startScouting
} from "./youth-academy.js";

const SAVE_KEY = "footcore-manager-save-v1";
let startupError = '';
const repository = await openCareerRepository().catch(error => { startupError = `Não foi possível abrir o salvamento: ${error.message}`; return null; });
let balanceDatabase;
let game = await loadGame();
let activeView = game ? (game.activeMatch ? "match" : game.finished && game.seasonReport ? "seasonReport" : "dashboard") : "setup";
let seasonReportTab = "overview";
let competitionLeagueId = null;
let marketPage = 0;
let matchTimer;
let matchSpeed = 1000;
let selectedMatchPlayer = null;
let selectedRoundMatch = null;
let matchPanel = "stats";
let penaltyPromptKey = null;
let matchDrag = null;
let suppressPlayerClickUntil = 0;
let toastTimer;
const marketFilters = defaultMarketFilters();
let offerTarget = null;
let selectedPlayerDetailId = null;
let playerDetailReturnView = "squad";
const squadSort = { key: "overall", direction: "desc" };
const academySort = { key: "potential", direction: "desc" };
const academyColumns = [
  { key: "name", label: "Atleta", direction: "asc" },
  { key: "position", label: "Pos.", direction: "asc" },
  { key: "age", label: "Idade", direction: "asc" },
  { key: "overall", label: "Geral", direction: "desc" },
  { key: "potential", label: "Potencial", direction: "desc" },
  { key: "value", label: "Valor projetado", direction: "desc" }
];
const squadColumns = [
  { key: "name", label: "Atleta", direction: "asc" },
  { key: "position", label: "Posição", direction: "asc" },
  { key: "age", label: "Idade", direction: "asc" },
  { key: "overall", label: "Geral", direction: "desc" },
  { key: "potential", label: "Potencial", direction: "desc" },
  { key: "value", label: "Valor", direction: "desc" }
];

const content = document.querySelector("#content");
const advanceButton = document.querySelector("#advance-button");
const penaltyDialog = document.querySelector("#penalty-dialog");
const offerDialog = document.querySelector("#offer-dialog");
const lineupEditor = new LineupEditor(content, {
  getGame: () => game,
  onChange: () => { saveGame(); },
  onStart: () => beginRound(),
  onMessage: (message, error) => showToast(message, error)
});

const careerSetup = new CareerSetup(content, {
  hasCareer: () => !!game,
  onCancel: () => { activeView = game?.activeMatch ? 'match' : 'dashboard'; render(); },
  onStart: async next => {
    if (!repository) throw new Error(startupError || 'Salvamento indisponível.');
    await repository.save(next);
    careerSetup.busy = false;
    game = next; competitionLeagueId = null; marketPage = 0;
    selectedRoundMatch = null; selectedMatchPlayer = null; matchPanel = 'stats'; penaltyPromptKey = null;
    Object.assign(marketFilters, defaultMarketFilters());
    activeView = 'dashboard'; render();
    showToast(`Você agora comanda o ${getUserClub(game).name}.`);
  }
});

async function updatePlayerBalance(target) {
  if (!needsBalanceMigration(target) || target.activeMatch) return;
  if (target.leagues && !balanceDatabase) {
    const response = await fetch('data/world/database.json?v=market-2');
    if (!response.ok) throw new Error('Não foi possível carregar a atualização dos jogadores.');
    balanceDatabase = await response.json();
  }
  if (migratePlayerBalance(target, balanceDatabase)) await repository.save(target);
}

async function loadGame() {
  try {
    if (!repository) return null;
    const loaded = await repository.load(localStorage, SAVE_KEY);
    if (!loaded) return null;
    if (!loaded.clubs?.some(c => c.id === loaded.userClubId) || !Array.isArray(loaded.schedule)) throw new Error('Carreira salva inválida.');
    const normalizedPositions = normalizeMidfieldPositions(loaded);
    [...loaded.clubs.flatMap(club => club.squad), ...loaded.market].forEach(player => { player.assists ??= 0; player.yellowCards ??= 0; player.yellowCardAccumulation ??= player.yellowCards % 3; player.redCards ??= 0; player.suspensionMatches ??= 0; player.suspensionReason ??= player.suspensionMatches ? "red" : null; player.injuryMatches ??= 0; player.injuryLabel ??= null; player.ratingTotal ??= 0; player.ratedMatches ??= 0; });
    await updatePlayerBalance(loaded);
    ensureCareerManagement(loaded);
    bindUserLeague(loaded);
    if (loaded.activeMatch?.phase === "playing") loaded.activeMatch.phase = "paused";
    ensureLiveRound(loaded);
    if (normalizedPositions) await repository.save(loaded);
    return loaded;
  } catch (error) {
    startupError = `Sua carreira foi preservada, mas não pôde ser aberta: ${error.message}`;
    return null;
  }
}

async function saveGame() {
  if (!game) return;
  const status = document.querySelector(".save-state");
  try {
    if (!repository) throw new Error('Salvamento indisponível');
    await repository.save(game);
    status.textContent = "Progresso salvo";
    status.classList.remove("save-error");
  } catch {
    status.textContent = "Falha ao salvar · mantenha esta aba aberta";
    status.classList.add("save-error");
  }
}

function badge(club, className = "club-badge") {
  return `<span class="${className}" style="background:${club.colors[0]};color:${club.colors[1]}">${badgeContent(club)}</span>`;
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 2600);
}

function nextFixture() {
  if (game.finished) return null;
  return game.schedule[game.week].find(match => match.homeId === game.userClubId || match.awayId === game.userClubId);
}

function pageHeading(kicker, title, side = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h2>${title}</h2></div>${side ? `<p>${side}</p>` : ""}</div>`;
}

function clubMail() {
  return game.news.filter(message => {
    const id = String(message.id);
    return !id.startsWith("free-signing-") && !id.startsWith("round-");
  });
}

function renderHeader() {
  document.querySelector('.top-stats').hidden = activeView === 'setup';
  document.querySelectorAll('.nav-item').forEach(button => { button.disabled = !game || careerSetup.busy; });
  if (activeView === 'setup') {
    document.querySelector('#club-identity').innerHTML = '<div><h1>FOOTCORE MANAGER</h1><p>Nova carreira · Base mundial</p></div>';
    advanceButton.hidden = true;
    return;
  }
  const club = getUserClub(game);
  document.querySelector("#club-identity").innerHTML = `${badge(club)}<div><h1>${escapeHtml(club.name)}</h1><p>${escapeHtml(club.stadium.name)} · Técnico</p></div>`;
  document.querySelector("#season-label").textContent = seasonLabel(game);
  document.querySelector("#week-label").textContent = game.finished ? "Fim" : `${game.week + 1}/${game.schedule.length}`;
  document.querySelector("#budget-label").textContent = formatMoney(club.budget);
  const unread = clubMail().filter(item => item.read !== true).length;
  const mailBadge = document.querySelector("#mail-badge");
  mailBadge.textContent = unread > 99 ? "99+" : unread;
  mailBadge.hidden = unread === 0;
  advanceButton.hidden = activeView === "match" || activeView === "lineup";
  advanceButton.innerHTML = game.activeMatch ? "Voltar à rodada <span>→</span>" : game.finished ? "Resumo da temporada <span>→</span>" : !nextFixture() ? "Avançar folga <span>→</span>" : activeView === "lineup" ? "Ir a jogo <span>→</span>" : "Escalar time <span>→</span>";
}

function renderMatchCard() {
  const fixture = nextFixture();
  if (!fixture && !game.finished) return `<section class="card card-body"><h3>Rodada de folga</h3><p>Seu clube não joga nesta rodada. Avance para acompanhar os demais resultados.</p></section>`;
  if (!fixture) {
    const champion = getClub(game, getSortedTable(game)[0].clubId);
    return `<section class="card match-card"><div class="card-header"><h3>Temporada encerrada</h3><span>Classificação final</span></div><div class="matchup"><div></div><div class="versus"><small>Campeão</small><strong>${escapeHtml(champion.shortName)}</strong></div><div></div></div></section>`;
  }
  const home = getClub(game, fixture.homeId);
  const away = getClub(game, fixture.awayId);
  return `<section class="card match-card">
    <div class="card-header"><h3>Próximo jogo</h3><span>Rodada ${game.week + 1} · ${escapeHtml(home.stadium.name)}</span></div>
    <div class="matchup">
      <div class="team">${badge(home, "team-badge")}<h4>${escapeHtml(home.name)}</h4><p>${fixture.homeId === game.userClubId ? "Seu time" : "Mandante"}</p></div>
      <div class="versus"><small>Campeonato</small><strong>VS</strong><small>Domingo · 16h</small></div>
      <div class="team">${badge(away, "team-badge")}<h4>${escapeHtml(away.name)}</h4><p>${fixture.awayId === game.userClubId ? "Seu time" : "Visitante"}</p></div>
    </div>
  </section>`;
}

function renderMetrics() {
  const club = getUserClub(game);
  const row = game.table.find(item => item.clubId === club.id);
  const rank = getSortedTable(game).findIndex(item => item.clubId === club.id) + 1;
  const average = Math.round(club.squad.reduce((sum, player) => sum + player.overall, 0) / club.squad.length);
  return `<div class="metric-grid">
    <div class="metric"><small>Posição atual</small><strong>${rank}º</strong><em>${row.points} pontos</em><div class="progress"><i style="width:${100 - (rank - 1) * 100 / game.table.length}%"></i></div></div>
    <div class="metric"><small>Moral da torcida</small><strong>${club.fanMorale}</strong><em>/ 100</em><div class="progress lime"><i style="width:${club.fanMorale}%"></i></div></div>
    <div class="metric"><small>Nível do elenco</small><strong>${average}</strong><em>média geral</em><div class="progress"><i style="width:${average}%"></i></div></div>
  </div>`;
}

function renderMiniTable() {
  const rows = getSortedTable(game).slice(0, 6).map((row, index) => {
    const club = getClub(game, row.clubId);
    return `<tr class="${club.id === game.userClubId ? "user-row" : ""}"><td class="position">${index + 1}</td><td>${escapeHtml(club.shortName)}</td><td>${row.played}</td><td>${row.gf - row.ga}</td><td class="positive-number">${row.points}</td></tr>`;
  }).join("");
  return `<section class="card"><div class="card-header"><h3>Classificação</h3><button class="text-button" data-go="competition">Ver tabela completa</button></div><div class="card-body"><table class="mini-table"><thead><tr><th>#</th><th>Clube</th><th>J</th><th>SG</th><th>PTS</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderNews() {
  return `<section class="card"><div class="card-header"><h3>Notícias do clube</h3><span>Últimas atualizações</span></div><div class="news-list">${game.news.slice(0, 4).map(item => `<article class="news-item ${item.type}"><span class="news-dot"></span><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p></div></article>`).join("")}</div></section>`;
}

function renderIncomingOffers() {
  const offers = game.incomingOffers || [];
  if (!offers.length) return "";
  return `<section class="card incoming-offers"><div class="card-header"><h3>Propostas recebidas</h3><span>Responda antes do prazo</span></div><div class="incoming-offer-list">${offers.map(offer => {
    const buyer = getClub(game, offer.buyerId);
    return `<article class="incoming-offer"><div><strong>${escapeHtml(offer.playerName)}</strong><span>${escapeHtml(buyer?.name || "Clube interessado")} · ${formatMoney(offer.amount)}</span><small>Expira após a rodada ${offer.expiresWeek}</small></div><div><button class="secondary-button" data-reject-incoming="${offer.id}">Recusar</button><button class="secondary-button" data-negotiate-incoming="${offer.id}">Negociar</button><button class="primary-button" data-accept-incoming="${offer.id}">Aceitar</button></div></article>`;
  }).join("")}</div></section>`;
}

function mailCategory(message) {
  const text = `${message.id} ${message.title}`.toLocaleLowerCase("pt-BR");
  if (/offer|transfer|buy-|sell-|listing|empréstimo|contrat/.test(text)) return { label: "Mercado", sender: "Diretoria de futebol" };
  if (/injury|lesion|suspens|yellow|red-/.test(text)) return { label: "Departamento médico", sender: "Comissão técnica" };
  if (/award|prize|champion|premia|acesso|rebaixamento|division/.test(text)) return { label: "Competições", sender: "Organização da liga" };
  if (/academy|scout|base/.test(text)) return { label: "Categoria de base", sender: "Coordenação da base" };
  return { label: "Clube", sender: "Secretaria do clube" };
}

function renderMail() {
  const messages = clubMail();
  const unread = messages.filter(item => item.read !== true).length;
  content.innerHTML = `${pageHeading("Comunicação do clube", "Correio", `${unread} ${unread === 1 ? "mensagem não lida" : "mensagens não lidas"}`)}
    <section class="card mail-card"><div class="card-header"><h3>Caixa de entrada</h3><button class="text-button" data-mail-read-all ${unread ? "" : "disabled"}>Marcar todas como lidas</button></div>
    <div class="mail-list">${messages.length ? messages.map(message => {
      const category = mailCategory(message);
      return `<button class="mail-item ${message.read === true ? "" : "unread"}" data-mail-read="${escapeHtml(message.id)}"><span class="mail-status"></span><span class="mail-copy"><small>${escapeHtml(category.sender)} · ${escapeHtml(category.label)}</small><strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.body)}</span><em>Temporada ${message.season ?? game.season} · Rodada ${(message.week ?? game.week) + 1}</em></span></button>`;
    }).join("") : `<div class="empty-state">Nenhuma mensagem recebida.</div>`}</div></section>`;
}

function renderDashboard() {
  const club = getUserClub(game);
  content.innerHTML = `${pageHeading("Sala do treinador", `Olá, professor`, `${escapeHtml(club.name)} · Temporada ${seasonLabel(game)}`)}
    ${renderIncomingOffers()}<div class="dashboard-grid"><div class="stack">${renderMatchCard()}${renderMetrics()}${renderNews()}</div><div class="stack">${renderMiniTable()}${renderLastRound()}</div></div>`;
}

function renderLastRound() {
  if (!game.lastRound.length) return `<section class="card"><div class="card-header"><h3>Última rodada</h3></div><div class="empty-state">Os resultados aparecerão aqui após a primeira rodada.</div></section>`;
  const items = game.lastRound.map(result => {
    const home = getClub(game, result.homeId);
    const away = getClub(game, result.awayId);
    return `<tr class="${result.homeId === game.userClubId || result.awayId === game.userClubId ? "user-row" : ""}"><td>${escapeHtml(home.shortName)}</td><td><button class="result-link" data-round-report="${result.homeId}" aria-label="Ver ${escapeHtml(home.name)} contra ${escapeHtml(away.name)}">${result.homeGoals} × ${result.awayGoals}</button></td><td>${escapeHtml(away.shortName)}</td></tr>`;
  }).join("");
  const ownMatch = game.lastRound.find(result => result.homeId === game.userClubId || result.awayId === game.userClubId);
  return `<section class="card"><div class="card-header"><h3>Última rodada</h3><span>Rodada ${game.week}</span></div><div class="card-body"><table class="mini-table"><tbody>${items}</tbody></table><details class="match-report"><summary>Relato do seu jogo</summary>${renderMatchEvents(game, ownMatch?.events || [])}</details></div></section>`;
}

function ratingClass(overall) {
  return overall >= 72 ? "high" : overall < 62 ? "low" : "";
}

function loanDescription(player) {
  return player.loan ? `<small class="transfer-role">Emprestado por ${escapeHtml(getClub(game, player.loan.ownerClubId).name)} · até o fim da temporada ${player.loan.endSeason}</small>` : "";
}

function contractLabel(endSeason) {
  if(!game.worldSeason) return `temporada ${endSeason}`;
  const year=game.worldSeason+endSeason-game.season;
  return game.leagues.find(l=>l.id===game.leagueId)?.season?.includes('/') ? `${year}/${String(year+1).slice(-2)}` : String(year);
}

function playerAvailabilityStatus(player, regularStatus) {
  if (player.injuryMatches > 0) return `🏥 ${player.injuryLabel || "Lesionado"} · ${player.injuryMatches} ${player.injuryMatches === 1 ? "partida" : "partidas"}`;
  if (player.suspensionMatches > 0) return `${player.suspensionReason === "yellow" ? "🟨" : "🟥"} Suspenso por 1 partida`;
  return regularStatus;
}

function playerDisciplineStatus(player) {
  const cards = player.yellowCardAccumulation || 0;
  return cards ? `🟨 ${cards}/3${cards === 2 ? " · pendurado" : ""}` : "Sem cartões pendentes";
}

function playerSquadRole(club, player, starters) {
  return starters.has(player.id) ? "Titular" : club.lineup && !club.lineup.bench.includes(player.id) ? "Não relacionado" : "Reserva";
}

function findPlayerContext(playerId) {
  for (const club of game.clubs) {
    const player = club.squad.find(item => item.id === playerId);
    if (player) return { player, club };
  }
  const player = game.market.find(item => item.id === playerId);
  return player ? { player, club: null } : null;
}

function renderSquad() {
  const club = getUserClub(game);
  const ownedLoans = game.clubs.filter(item => item.id !== club.id).flatMap(borrower => borrower.squad.filter(player => player.loan?.ownerClubId === club.id).map(player => ({ player, borrower })));
  const positions = ["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"];
  const squad = [...club.squad].sort((a, b) => {
    const key = squadSort.key;
    const comparison = key === "name" ? a.name.localeCompare(b.name, "pt-BR")
      : key === "position" ? positions.indexOf(a.position) - positions.indexOf(b.position)
      : a[key] - b[key];
    return comparison * (squadSort.direction === "asc" ? 1 : -1) || a.name.localeCompare(b.name, "pt-BR");
  });
  const starters = new Set(getLineup(club).map(player => player.id));
  content.innerHTML = `${pageHeading("Gestão esportiva", "Elenco", `${squad.length} no clube${ownedLoans.length ? ` · ${ownedLoans.length} emprestado${ownedLoans.length === 1 ? "" : "s"}` : ""}`)}
    <div class="page-heading"><button class="secondary-button" data-go="lineup">Montar escalação</button><div class="toolbar"><label for="tactic">Postura tática</label><select id="tactic"><option value="defensivo" ${club.tactic === "defensivo" ? "selected" : ""}>Defensiva</option><option value="equilibrado" ${club.tactic === "equilibrado" ? "selected" : ""}>Equilibrada</option><option value="ofensivo" ${club.tactic === "ofensivo" ? "selected" : ""}>Ofensiva</option></select></div></div>
    <p class="view-note">Clique em qualquer parte da linha de um atleta para abrir sua ficha completa. Defina titulares e reservas na tela Escalação. Qualquer atleta próprio pode ser emprestado quando houver um destino com chance de jogo, preservando o elenco mínimo e ao menos um goleiro. Contratos vencem ao fim da temporada indicada; renove antes de concluir a última rodada.</p>
    <section class="card data-card"><table class="data-table"><thead><tr>${squadColumns.map(column => {
      const active = squadSort.key === column.key;
      const next = active ? squadSort.direction === "asc" ? "desc" : "asc" : column.direction;
      return `<th scope="col" class="sortable-heading" aria-sort="${active ? squadSort.direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" data-squad-sort="${column.key}" title="Ordenar por ${column.label.toLocaleLowerCase("pt-BR")} em ordem ${next === "asc" ? "crescente" : "decrescente"}">${column.label}<span aria-hidden="true">${active ? squadSort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>`;
    }).join("")}<th scope="col">Contrato</th><th scope="col"></th></tr></thead><tbody>
    ${squad.map(player => `<tr class="player-detail-row" data-player-details="${player.id}" data-player-return="squad" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(player.name)}"><td class="player-name"><div class="player-with-shirt">${teamShirtMarkup(club, player.position)}<div><strong>${escapeHtml(player.name)}</strong>${loanDescription(player)}<small>${playerAvailabilityStatus(player, playerSquadRole(club, player, starters))} · Moral ${player.morale}</small><small class="discipline-status">${playerDisciplineStatus(player)}</small><small>${developmentLabel(player, game.season)}</small></div></div></td><td><span class="position-pill">${player.position}</span></td><td>${player.age}</td><td><span class="rating ${ratingClass(player.overall)}">${player.overall}</span></td><td>${player.potential}</td><td>${formatMoney(player.value)}</td><td>${player.loan ? 'Empréstimo' : `Até o fim de ${contractLabel(player.contractEndSeason)}<small>${player.releaseClause ? `Multa: ${formatMoney(player.releaseClause)}` : "Sem multa rescisória"}</small>${player.contractEndSeason===game.season?'<small>Vence nesta temporada</small>':''}${player.contractEndSeason<game.season+2?`<button class="action-button" data-renew="${player.id}">Renovar · ${formatMoney(player.salary*4)}</button>`:''}`}</td><td>${player.loan ? `<span class="view-note">Empréstimo</span>` : `<button class="action-button" data-loan-out="${player.id}">Emprestar</button><button class="action-button" data-sell="${player.id}">Vender</button>`}</td></tr>`).join("")}
    </tbody></table></section>${ownedLoans.length ? `<section class="card data-card"><div class="card-header"><h3>Emprestados pelo clube</h3><span>Retorno ao fim da temporada</span></div><table class="data-table"><thead><tr><th>Atleta</th><th>Pos.</th><th>Clube atual</th><th>Geral</th><th>Jogos no empréstimo</th><th>Evolução</th></tr></thead><tbody>${ownedLoans.map(({player, borrower}) => `<tr class="player-detail-row" data-player-details="${player.id}" data-player-return="squad" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(player.name)}"><td class="player-name"><div class="player-with-shirt">${teamShirtMarkup(borrower, player.position)}<strong>${escapeHtml(player.name)}</strong></div></td><td><span class="position-pill">${player.position}</span></td><td>${escapeHtml(borrower.name)}</td><td><span class="rating ${ratingClass(player.overall)}">${player.overall}</span></td><td>${Math.max(0, (player.appearances ?? 0) - (player.loan.startAppearances ?? 0))}</td><td>${developmentLabel(player, game.season)}</td></tr>`).join("")}</tbody></table></section>` : ""}`;
}

function renderPlayerDetails() {
  const context = findPlayerContext(selectedPlayerDetailId);
  if (!context) { activeView = playerDetailReturnView; render(); return; }
  const { player, club } = context;
  const userClub = getUserClub(game);
  const ownPlayer = club?.id === userClub.id || player.loan?.ownerClubId === userClub.id;
  const loanedOut = player.loan?.ownerClubId === userClub.id && club?.id !== userClub.id;
  const starters = ownPlayer ? new Set(getLineup(userClub).map(item => item.id)) : new Set();
  const terms = club && !ownPlayer ? getTransferTerms(game, club.id, player.id) : null;
  const listing = club && !ownPlayer ? getClubListing(game, club.id, player.id) : null;
  const regularStatus = loanedOut ? `Emprestado ao ${club.name}` : ownPlayer ? playerSquadRole(userClub, player, starters) : club ? terms?.role || "Atleta do elenco" : "Livre de contrato";
  const progression = player.progression?.season === game.season ? player.progression : null;
  const defensive = ["GOL", "ZAG", "LAT"].includes(player.position);
  const sourceDetails = [
    player.source?.country && `País: ${escapeHtml(player.source.country)}`,
    player.academyGraduate && "Formado na categoria de base",
    player.source?.star && "★ Estrela mundial",
    player.source?.foot && `Pé: ${escapeHtml(player.source.foot)}`,
    player.source?.technical && `Técnica: ${escapeHtml(player.source.technical)}`,
    player.source?.physical && `Físico: ${escapeHtml(player.source.physical)}`,
    player.source?.extra && `Extra: ${escapeHtml(player.source.extra)}`
  ].filter(Boolean);
  const metric = (label, value, note = "") => `<div class="player-detail-metric"><small>${label}</small><strong>${value}</strong>${note ? `<span>${note}</span>` : ""}</div>`;
  const marketAction = !club
    ? `<button class="primary-button" data-buy="${player.id}">Contratar · ${formatMoney(player.askingPrice)}</button>`
    : listing
      ? `<button class="primary-button" data-offer="${player.id}" data-club="${club.id}">${listing.type === "loan" ? "Contratar empréstimo" : `Comprar · ${formatMoney(listing.price)}`}</button>`
      : `<button class="primary-button" data-offer="${player.id}" data-club="${club.id}">${terms?.available ? "Fazer proposta" : "Ver situação"}</button>`;
  const actions = ownPlayer
    ? `${loanedOut ? `<span class="view-note">Emprestado ao ${escapeHtml(club.name)} até o fim da temporada</span>` : player.loan ? `<span class="view-note">Atleta emprestado</span>` : `${player.contractEndSeason < game.season + 2 ? `<button class="secondary-button" data-renew="${player.id}">Renovar · ${formatMoney(player.salary * 4)}</button>` : ""}<button class="secondary-button" data-loan-out="${player.id}">Emprestar jogador</button><button class="danger-button" data-sell="${player.id}">Vender jogador</button>`}`
    : marketAction;
  const contract = !club ? "Livre de contrato" : player.loan ? "Empréstimo" : `Até o fim de ${contractLabel(player.contractEndSeason)}`;
  const seasonHistory = [...(player.seasonHistory || [])].reverse();
  const individualAwards = [...(player.awards || [])].reverse();
  const seasonHistoryRows = seasonHistory.map(entry => `<tr><td><strong>${escapeHtml(entry.label || `Temporada ${entry.season}`)}</strong></td><td>${escapeHtml(entry.clubName || "—")}</td><td>${entry.appearances ?? 0}</td><td>${entry.goals ?? 0}</td><td>${entry.assists ?? 0}</td><td>${entry.yellowCards ?? 0}</td><td>${entry.redCards ?? 0}</td><td><strong>${formatRating(entry.ratedMatches > 0 ? entry.ratingTotal / entry.ratedMatches : null)}</strong><small>${entry.ratedMatches ?? 0} ${entry.ratedMatches === 1 ? "jogo avaliado" : "jogos avaliados"}</small></td></tr>`).join("");
  content.innerHTML = `${pageHeading(playerDetailReturnView === "market" ? "Mercado · Observação" : "Gestão esportiva · Elenco", "Detalhes do atleta", club ? escapeHtml(club.name) : "Sem clube")}
    <button class="secondary-button player-back-button" data-player-back>← Voltar ${playerDetailReturnView === "market" ? "ao mercado" : "ao elenco"}</button>
    <section class="card player-profile-hero">
      <div class="player-profile-overall"><small>Geral</small><strong>${player.overall}</strong></div>
      <div class="player-profile-name"><div class="player-profile-title">${teamShirtMarkup(club, player.position)}<div><span class="position-pill">${player.position}</span><h3>${escapeHtml(player.name)}</h3></div></div><p>${player.age} anos · ${escapeHtml(playerAvailabilityStatus(player, regularStatus))} · Moral ${player.morale}</p><p class="discipline-status">${playerDisciplineStatus(player)}</p>${sourceDetails.length ? `<p>${sourceDetails.join(" · ")}</p>` : ""}</div>
      <div class="player-profile-actions">${actions}</div>
    </section>
    <div class="player-detail-grid">
      <section class="card player-detail-card"><div class="card-header"><h3>Desempenho na temporada</h3><span>${player.ratedMatches || 0} ${player.ratedMatches === 1 ? "jogo avaliado" : "jogos avaliados"}</span></div><div class="player-detail-metrics player-performance-metrics">
        ${metric("Nota média", formatRating(averageRating(player)), "Somente partidas avaliadas")}
        ${metric("Jogos", player.appearances ?? 0)}${metric("Gols", player.goals ?? 0)}${metric("Assistências", player.assists ?? 0)}
        ${metric("Amarelos", player.yellowCards ?? 0, `${player.yellowCardAccumulation || 0}/3 no ciclo`)}${metric("Vermelhos", player.redCards ?? 0)}
      </div></section>
      <section class="card player-detail-card"><div class="card-header"><h3>Nível e evolução</h3><span>Temporada ${seasonLabel(game)}</span></div><div class="player-detail-metrics">
        ${metric("Geral", player.overall, progression ? `Início: ${progression.startOverall}` : "")}${metric("Potencial", player.potential, progression ? `Início: ${progression.startPotential}` : "")}${metric("Forma", player.form)}${metric("Moral", player.morale)}
        ${metric("Minutos avaliados", progression?.minutes ?? 0)}${metric("Evolução", developmentLabel(player, game.season))}
      </div></section>
      ${defensive ? `<section class="card player-detail-card"><div class="card-header"><h3>Desempenho defensivo</h3><span>Em campo</span></div><div class="player-detail-metrics">${metric("Jogos sem sofrer gols", progression?.cleanSheets ?? 0)}${metric("Gols sofridos", progression?.conceded ?? 0)}${player.position === "GOL" ? `${metric("Defesas", progression?.saves ?? 0)}${metric("Pênaltis defendidos", progression?.penaltySaves ?? 0)}` : ""}</div></section>` : ""}
      ${player.position !== "GOL" ? `<section class="card player-detail-card"><div class="card-header"><h3>Contribuição tática</h3><span>Ações que também influenciam a nota</span></div><div class="player-detail-metrics">${metric("Desarmes", progression?.tackles ?? 0)}${metric("Passes decisivos", progression?.keyPasses ?? 0)}${metric("Pré-assistências", progression?.preAssists ?? 0)}</div></section>` : ""}
      <section class="card player-detail-card"><div class="card-header"><h3>Contrato e valor</h3><span>${contract}</span></div><div class="player-detail-metrics">
        ${metric("Valor de mercado", formatMoney(player.value))}${metric("Salário por rodada", formatMoney(player.salary))}${metric("Vínculo", contract, player.contractEndSeason === game.season ? "Vence nesta temporada" : "")}${metric("Multa rescisória", player.releaseClause ? formatMoney(player.releaseClause) : "Sem multa", player.releaseClause ? "O clube não pode recusar uma oferta neste valor." : "Propostas dependem da decisão da diretoria.")}${metric("Situação", playerAvailabilityStatus(player, regularStatus))}
      </div>${listing ? `<p class="card-body view-note">${listing.type === "loan" ? "Disponível para empréstimo" : "Preço fixo"}: ${formatMoney(listing.price)}</p>` : ""}</section>
      ${individualAwards.length ? `<section class="card player-detail-card"><div class="card-header"><h3>Prêmios individuais</h3><span>${individualAwards.length} conquista${individualAwards.length === 1 ? "" : "s"}</span></div><div class="card-body">${individualAwards.map(award => `<p><strong>${escapeHtml(award.label)}</strong> · ${escapeHtml(award.leagueName)} · temporada ${award.season}<br><small>${escapeHtml(award.statLabel)} · geral +${award.overallGain} · potencial +${award.potentialGain}</small></p>`).join("")}</div></section>` : ""}
      <section class="card player-detail-card player-history-card"><div class="card-header"><h3>Temporadas anteriores</h3><span>${seasonHistory.length} ${seasonHistory.length === 1 ? "temporada registrada" : "temporadas registradas"}</span></div>${seasonHistory.length ? `<div class="data-card"><table class="data-table player-history-table"><thead><tr><th>Temporada</th><th>Clube</th><th>Jogos</th><th>Gols</th><th>Assistências</th><th>Amarelos</th><th>Vermelhos</th><th>Nota média</th></tr></thead><tbody>${seasonHistoryRows}</tbody></table></div>` : `<p class="card-body view-note">Nenhuma temporada anterior foi registrada para este atleta. O histórico passará a ser preservado nos próximos encerramentos de temporada.</p>`}</section>
    </div>`;
}

function renderMarket() {
  content.innerHTML = `${pageHeading("Scouting e negócios", "Mercado", "Observe os rivais. Encontre seu próximo reforço.")}
    <div class="market-filters card">
      <label>Pesquisar atleta ou clube<input id="market-query" type="search" placeholder="Nome do jogador ou do time" autocomplete="off"></label>
      <label>Clube<select id="market-club"><option value="all">Todos os clubes</option><option value="market">Sem clube</option>${game.clubs.filter(club => club.id !== game.userClubId).map(club => `<option value="${club.id}">${escapeHtml(club.name)}</option>`).join("")}</select></label>
      <label>País do clube<select data-market-filter="country"><option value="all">Todos os países</option>${[...new Set(game.clubs.map(c=>c.country).filter(Boolean))].sort().map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></label>
      <label>Campeonato<select data-market-filter="leagueId"><option value="all">Todos os campeonatos</option>${(game.leagues || []).map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.country)} · ${escapeHtml(l.name)}</option>`).join('')}</select></label>
      <label>Disponibilidade<select id="market-type"><option value="all">Todas as modalidades</option><option value="free">Sem contrato</option><option value="fixed">Preço fixo</option><option value="loan">Empréstimo</option><option value="negotiation">Sob proposta</option></select></label>

      <fieldset class="market-positions"><legend>Posições · selecione uma ou mais</legend>${["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"].map(position=>`<label><input type="checkbox" data-market-position="${position}" ${marketFilters.positions.includes(position)?'checked':''}>${position}</label>`).join('')}</fieldset>
      <details class="market-advanced" open><summary>Idade, nível e orçamento</summary><div class="market-range-grid">
        ${MARKET_RANGES.map(r=>`<fieldset><legend>${r.label}</legend><div class="market-range"><label>Mínimo<input type="number" data-market-filter="min${r.key}" data-unit="${r.unit}" min="${r.min}" max="${r.max}" step="${r.step}" placeholder="Sem mínimo"></label><span aria-hidden="true">—</span><label>Máximo<input type="number" data-market-filter="max${r.key}" data-unit="${r.unit}" min="${r.min}" max="${r.max}" step="${r.step}" placeholder="Sem máximo"></label></div></fieldset>`).join('')}
        <label>Salário máximo (R$ mil/rodada)<input type="number" data-market-filter="maxSalary" data-unit="1000" min="0" step="1" placeholder="Sem limite"></label>
        <label>Margem de evolução mínima<input type="number" data-market-filter="minGrowth" min="0" max="98" step="1" placeholder="Potencial − geral"></label>
      </div></details>
      <div class="market-filter-actions"><label><input type="checkbox" data-market-filter="availableOnly"> Apenas disponíveis</label><label><input type="checkbox" data-market-filter="affordableOnly"> Contratação cabe no meu caixa</label><button id="market-clear" class="text-button">Limpar filtros</button></div>
      <p class="view-note market-filter-hint">Os filtros são combinados. Posições selecionadas são alternativas. Valor de mercado é a avaliação do atleta; preço de contratação inclui a exigência do clube ou a taxa de empréstimo, sem salários futuros.</p>
    </div>
    <p class="view-note">Clique nos cabeçalhos para ordenar. Use “Sem contrato” para jogadores livres: a contratação paga luvas ao atleta, sem transferência a um clube. Os clubes costumam renovar suas principais peças; atletas fortes ficam livres apenas raramente. Outros clubes também podem contratá-los.</p>
    <p class="view-note">Compre pelo preço anunciado, contrate por empréstimo ou negocie com o clube. Os anúncios são revistos conforme o elenco muda; titulares e peças-chave continuam exigindo propostas.</p>
    <p id="market-count" role="status" class="view-note"></p>
    <section class="card data-card"><table class="data-table"><thead><tr>${MARKET_COLUMNS.map(column => `<th scope="col" class="sortable-heading" aria-sort="none"><button type="button" data-market-sort="${column.key}">${column.label}<span aria-hidden="true">↕</span></button></th>`).join('')}<th scope="col">Negociação</th></tr></thead><tbody id="market-results"></tbody></table></section>
    <section class="card season-history"><div class="card-header"><h3>Suas últimas negociações</h3></div><div class="card-body">${(game.negotiations || []).length ? game.negotiations.slice(0, 5).map(item => `<article class="negotiation-entry"><strong>${escapeHtml(item.playerName)} · ${escapeHtml(item.clubName)}</strong><p>${formatMoney(item.amount)}${item.exchangePlayerName ? ` + ${escapeHtml(item.exchangePlayerName)} (crédito de ${formatMoney(item.exchangeCredit)})` : ""} · ${{ rejected: "Recusada", counter: "Contraproposta", accepted: "Aceita", purchased: "Compra por preço fixo", loaned: "Empréstimo contratado" }[item.status]}${item.counterOffer !== null && item.counterOffer !== undefined ? ` de ${formatMoney(item.counterOffer)}` : ""} · Temporada ${item.season}, após ${item.week} rodada(s)</p></article>`).join("") : `<p class="view-note">Suas propostas e as respostas dos clubes aparecerão aqui.</p>`}</div></section>
    <section class="card season-history"><div class="card-header"><h3>Transferências entre clubes</h3><span>Mercado mundial</span></div><div class="card-body">${(game.transferDeals || []).length ? game.transferDeals.slice(0, 8).map(item => `<article class="negotiation-entry"><strong>${escapeHtml(item.playerName)}</strong><p>${escapeHtml(item.sellerName)} → ${escapeHtml(item.buyerName)} · ${formatMoney(item.amount)}${item.exchangePlayerName ? ` + ${escapeHtml(item.exchangePlayerName)}` : ""}${item.status === "clause" ? " · Multa rescisória" : ""}</p></article>`).join("") : `<p class="view-note">As negociações realizadas pela IA aparecerão aqui conforme as rodadas avançarem.</p>`}</div></section>`;
  document.querySelector("#market-query").value = marketFilters.query;
  document.querySelector("#market-club").value = marketFilters.clubId;
  content.querySelectorAll('[data-market-filter]').forEach(input => {
    const value = marketFilters[input.dataset.marketFilter];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value === '' ? '' : typeof value === 'number' ? value / Number(input.dataset.unit || 1) : value;
  });

  document.querySelector("#market-type").value = marketFilters.dealType;
  renderMarketResults();
}

function renderMarketResults() {

  for (const column of MARKET_COLUMNS) {
    const button = content.querySelector(`[data-market-sort="${column.key}"]`);
    const active = marketFilters.sort === column.key;
    const next = active ? (marketFilters.direction === 'asc' ? 'desc' : 'asc') : column.direction;
    button.closest('th').setAttribute('aria-sort', active ? (marketFilters.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    button.querySelector('span').textContent = active ? (marketFilters.direction === 'asc' ? '↑' : '↓') : '↕';
    button.title = `Ordenar por ${column.key === 'name' ? 'nome do atleta' : column.label.toLocaleLowerCase('pt-BR')} em ordem ${next === 'asc' ? 'crescente' : 'decrescente'}`;
  }
  const filterError = marketFilterError(marketFilters);
  const entries = searchTransferMarket(game, marketFilters);
  const pages = Math.max(1, Math.ceil(entries.length / 60));
  marketPage = Math.min(marketPage, pages - 1);
  document.querySelector("#market-count").innerHTML = `${filterError ? `<strong class="save-error">${escapeHtml(filterError)}</strong> · ` : ""}${entries.length} atletas encontrados · Página ${marketPage + 1} de ${pages} <button class="text-button" data-market-page="-1" ${marketPage===0?'disabled':''}>Anterior</button> <button class="text-button" data-market-page="1" ${marketPage+1===pages?'disabled':''}>Próxima</button>`;
  document.querySelector("#market-results").innerHTML = entries.length ? entries.slice(marketPage * 60, (marketPage + 1) * 60).map(({ player, club, terms, listing }) => `<tr class="player-detail-row" data-player-details="${player.id}" data-player-return="market" tabindex="0" aria-label="Abrir ficha de ${escapeHtml(player.name)}">
    <td class="player-name"><div class="player-with-shirt">${teamShirtMarkup(club, player.position)}<div><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(club?.name || "Sem clube")}</small>${!club ? `<small>${player.freeAgentOrigin==='generated'?'Atleta fictício gerado pelo jogo':player.previousClub?`Contrato encerrado · ${escapeHtml(player.previousClub)}`:'Livre de contrato'}</small>` : ""}${terms ? `<small class="transfer-role">${terms.role}${terms.available ? "" : " · Indisponível"}</small>` : ""}</div></div></td>
    <td><span class="position-pill">${player.position}</span></td><td>${player.age}</td><td><span class="rating ${ratingClass(player.overall)}">${player.overall}</span></td><td>${player.potential}</td><td>${formatMoney(player.salary)}/rod.</td><td>${formatMoney(player.value)}</td>
    <td>${club ? `${listing ? `<strong class="fixed-price">${listing.type === "loan" ? "Taxa: " : "Preço fixo: "}${formatMoney(listing.price)}</strong>${listing.type === "loan" ? `<small class="listing-note">Até o fim da temporada ${listing.endSeason} · 100% do salário</small>` : ""}` : ""}<button class="action-button" data-offer="${player.id}" data-club="${club.id}">${listing ? listing.type === "loan" ? "Contratar empréstimo" : "Comprar por preço fixo" : terms.available ? "Fazer proposta" : "Ver situação"}</button>` : `<strong class="fixed-price">Luvas: ${formatMoney(player.askingPrice)}</strong><button class="action-button buy" data-buy="${player.id}">Contratar</button>`}</td></tr>`).join("") : `<tr><td colspan="8" class="empty-state">${marketFilters.dealType === "free" || marketFilters.clubId === "market" ? "Nenhum jogador livre atende aos filtros neste momento. Novas oportunidades podem surgir com contratos não renovados." : "Nenhum atleta atende a todos os filtros. Amplie os intervalos ou clique em Limpar filtros."}</td></tr>`;
}

function openOffer(sellerId, playerId) {
  const club = getClub(game, sellerId);
  const player = club?.squad.find(item => item.id === playerId);
  const terms = getTransferTerms(game, sellerId, playerId);
  if (!terms || !player) return;
  const listing = getClubListing(game, sellerId, playerId);
  offerTarget = { sellerId, playerId, listing };
  if (listing) {
    offerDialog.innerHTML = `<form id="offer-form"><p class="eyebrow">${listing.type === "loan" ? "Empréstimo" : "Venda por preço fixo"} · ${escapeHtml(club.name)}</p><h2 id="offer-title">${escapeHtml(player.name)}</h2>
      <p>${player.position} · ${player.age} anos · Geral ${player.overall} · Potencial ${player.potential}</p>
      <p>${listing.reason}</p>
      <div class="offer-facts"><p>${listing.type === "loan" ? "Taxa de empréstimo" : "Preço anunciado"}<strong>${formatMoney(listing.price)}</strong></p><p>Seu caixa<strong>${formatMoney(getUserClub(game).budget)}</strong></p><p>Salário por rodada<strong>${formatMoney(player.salary)}</strong></p></div>
      <p>${listing.type === "loan" ? `Contrato até o fim da temporada ${listing.endSeason} (${listing.remaining} rodadas restantes). Você paga a taxa agora e 100% do salário a cada rodada. O atleta retorna automaticamente ao ${escapeHtml(club.name)}, sem opção de compra e sem reembolso da taxa.` : "A compra é imediata pelo preço anunciado, sem enviar proposta. Seu clube assume o salário do atleta."}</p>
      <div id="offer-response" role="status" aria-live="polite"></div><div class="dialog-actions"><button type="button" id="close-offer" class="secondary-button">Fechar</button><button type="submit" class="primary-button">${listing.type === "loan" ? "Confirmar empréstimo" : "Confirmar compra"}</button></div></form>`;
    offerDialog.showModal();
    return;
  }
  const userClub = getUserClub(game);
  const exchangeOptions = userClub.squad.filter(item => !item.loan).sort((first, second) => second.value - first.value).map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.position} · GER ${item.overall} · crédito ${formatMoney(getExchangePlayerCredit(item))}</option>`).join("");
  offerDialog.innerHTML = `<form id="offer-form">
    <p class="eyebrow">Negociação com ${escapeHtml(club.name)}</p><h2 id="offer-title">${escapeHtml(player.name)}</h2>
    <p>${player.position} · ${player.age} anos · Geral ${player.overall} · ${terms.role}</p>
    <div class="offer-facts"><p>Valor de mercado<strong>${formatMoney(player.value)}</strong></p><p>Seu caixa<strong>${formatMoney(getUserClub(game).budget)}</strong></p><p>Salário por rodada<strong>${formatMoney(player.salary)}</strong></p></div>
    <ul class="offer-reasons">${terms.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    ${terms.available ? `<div class="offer-composition"><label class="offer-label" for="offer-amount">Dinheiro oferecido (R$)<input id="offer-amount" name="amount" type="number" min="0" step="1000" max="${Math.floor(userClub.budget)}" value="${Math.min(player.value, Math.max(0, Math.floor(userClub.budget)))}"></label><label class="offer-label" for="offer-exchange-player">Jogador oferecido na troca<select id="offer-exchange-player" name="exchangePlayer"><option value="">Nenhum jogador</option>${exchangeOptions}</select></label></div><p class="view-note">O outro clube considera 75% do valor de mercado do atleta oferecido. Dinheiro e jogadores são transferidos juntos após a aceitação.</p>` : ""}
    <div id="offer-response" role="status" aria-live="polite"></div>
    <div class="dialog-actions"><button type="button" id="close-offer" class="secondary-button">Fechar</button>${terms.available ? `<button type="submit" class="primary-button">Enviar proposta</button>` : ""}</div></form>`;
  offerDialog.showModal();
}

function openIncomingNegotiation(offerId) {
  const offer = game.incomingOffers.find(item => item.id === offerId);
  const seller = getUserClub(game);
  const buyer = offer && getClub(game, offer.buyerId);
  const player = offer && seller.squad.find(item => item.id === offer.playerId);
  if (!offer || !buyer || !player) return;
  const exchangeOptions = buyer.squad.filter(item => !item.loan).sort((first, second) => second.value - first.value).map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.position} · GER ${item.overall} · crédito ${formatMoney(getExchangePlayerCredit(item))}</option>`).join("");
  offerTarget = { mode: "incoming", incomingOfferId: offer.id };
  offerDialog.innerHTML = `<form id="offer-form"><p class="eyebrow">Contraproposta para ${escapeHtml(buyer.name)}</p><h2 id="offer-title">${escapeHtml(player.name)}</h2>
    <p>A oferta recebida é de <strong>${formatMoney(offer.amount)}</strong>. Peça mais dinheiro, um atleta do comprador ou combine os dois.</p>
    <div class="offer-composition"><label class="offer-label" for="offer-amount">Dinheiro solicitado (R$)<input id="offer-amount" name="amount" type="number" min="0" step="1000" max="${Math.floor(buyer.budget)}" value="${Math.min(buyer.budget, Math.ceil(offer.amount * 1.1 / 1000) * 1000)}"></label><label class="offer-label" for="offer-exchange-player">Jogador solicitado na troca<select id="offer-exchange-player" name="exchangePlayer"><option value="">Nenhum jogador</option>${exchangeOptions}</select></label></div>
    <p class="view-note">O comprador pode aceitar ou limitar o valor. A proposta original continua disponível se a contraproposta for recusada.</p><div id="offer-response" role="status" aria-live="polite"></div>
    <div class="dialog-actions"><button type="button" id="close-offer" class="secondary-button">Fechar</button><button type="submit" class="primary-button">Enviar contraproposta</button></div></form>`;
  offerDialog.showModal();
}

offerDialog.addEventListener("click", event => {
  if (event.target.closest("#close-offer")) offerDialog.close();
  if (event.target.closest("#use-counter")) {
    document.querySelector("#offer-amount").value = event.target.closest("#use-counter").dataset.amount;
    document.querySelector("#offer-amount").focus();
  }
});
offerDialog.addEventListener("submit", event => {
  event.preventDefault();
  if (!offerTarget) return;
  const { sellerId, playerId, listing, mode, incomingOfferId } = offerTarget;
  const amount = Number(document.querySelector("#offer-amount")?.value ?? 0);
  const exchangePlayerId = document.querySelector("#offer-exchange-player")?.value || null;
  const result = mode === "incoming" ? counterIncomingOffer(game, incomingOfferId, amount, exchangePlayerId) : listing ? acceptClubListing(game, sellerId, playerId, listing.type, listing.price) : makeTransferOffer(game, sellerId, playerId, amount, exchangePlayerId);
  if (result.ok || (mode !== "incoming" && !listing && result.status !== "invalid")) saveGame();
  render();
  const response = document.querySelector("#offer-response");
  response.className = `offer-response ${result.ok ? "accepted" : ""}`;
  response.textContent = result.message;
  if (result.counterOffer !== undefined) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "use-counter";
    button.className = "action-button";
    button.dataset.amount = result.counterOffer;
    const availableBudget = mode === "incoming" ? getClub(game, game.incomingOffers.find(item => item.id === incomingOfferId)?.buyerId)?.budget ?? 0 : getUserClub(game).budget;
    button.textContent = result.counterOffer > availableBudget ? "Valor acima do caixa disponível" : "Usar valor sugerido";
    button.disabled = result.counterOffer > availableBudget;
    response.append(button);
  }
  if (result.ok) {
    offerDialog.querySelector('button[type="submit"]').disabled = true;
    const amountInput = document.querySelector("#offer-amount");
    if (amountInput) amountInput.disabled = true;
    offerTarget = null;
  }
});
offerDialog.addEventListener("close", () => { offerTarget = null; });

function renderCompetition() {
  const league = game.leagues?.find(l=>l.id===(competitionLeagueId || game.leagueId));
  const rules = league ? leagueSeasonRules(game, league.id) : { promotionPlaces: 0, relegationPlaces: 0, championPrize: 0, lastPrize: 0 };
  const latestAwards = game.lastSeasonPlayerAwards?.leagues.find(item => item.leagueId === (league?.id || "national"))?.awards || [];
  const rows = getSortedTable(game, league?.id).map((row, index) => {
    const club = getClub(game, row.clubId);
    const zone = rules.promotionPlaces && index < rules.promotionPlaces ? "↑ Zona de acesso" : rules.relegationPlaces && index >= league.clubIds.length - rules.relegationPlaces ? "↓ Zona de rebaixamento" : index === 0 ? "Líder" : "";
    return `<tr class="${club.id === game.userClubId ? "user-row" : ""}"><td><strong>${index + 1}</strong></td><td class="player-name">${escapeHtml(club.name)}<small>${zone || escapeHtml(club.stadium.name)}</small></td><td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gf - row.ga}</td><td><strong>${row.points}</strong></td></tr>`;
  }).join("");
  const history = getUserClub(game).history;
  content.innerHTML = `${pageHeading(league ? `${league.country} · ${seasonLabel(game, league.id)}` : "Liga nacional", league ? escapeHtml(league.name) : "Campeonato", `${league?.schedule.length ?? game.schedule.length} rodadas · turno e returno`)}
    ${game.leagues ? `<label class="competition-picker">Ver campeonato<select id="competition-league">${game.leagues.map(l=>`<option value="${l.id}" ${l.id===league.id?'selected':''}>${escapeHtml(l.country)} · ${escapeHtml(l.name)}</option>`).join('')}</select></label><p class="view-note">${escapeHtml(league.note)}</p><p class="view-note">${rules.promotionPlaces ? `${rules.promotionPlaces} clube${rules.promotionPlaces === 1 ? " sobe" : "s sobem"} · ` : ""}${rules.relegationPlaces ? `${rules.relegationPlaces} clube${rules.relegationPlaces === 1 ? " desce" : "s descem"} · ` : ""}Premiação: ${formatMoney(rules.championPrize)} para o campeão até ${formatMoney(rules.lastPrize)} para a última colocação.</p>` : ''}
    <section class="card data-card"><table class="data-table"><thead><tr><th>#</th><th>Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>PTS</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  if (latestAwards.length) content.innerHTML += `<section class="card season-history"><div class="card-header"><h3>Prêmios individuais da temporada ${game.lastSeasonPlayerAwards.season}</h3><span>Um jogador pode vencer mais de uma categoria</span></div><div class="card-body">${latestAwards.map(award => `<p><strong>${escapeHtml(award.label)}:</strong> <button class="player-detail-link" data-player-details="${award.playerId}" data-player-return="competition">${escapeHtml(award.playerName)}</button> · ${escapeHtml(award.clubName)} · ${escapeHtml(award.statLabel)} · prêmio de ${formatMoney(award.money)}</p>`).join("")}</div></section>`;
  if (history.length) content.innerHTML += `<section class="card season-history"><div class="card-header"><h3>Histórico do clube</h3></div><div class="card-body">${[...history].reverse().map(season => `<p>Temporada ${season.season} · ${season.leagueName ? `${escapeHtml(season.leagueName)} · ` : ""}${season.position}º lugar · ${season.points} pontos${season.position === 1 ? " · Campeão" : ""}${season.prizeMoney ? ` · ${formatMoney(season.prizeMoney)} pela colocação` : ""}${season.individualAwardsMoney ? ` · ${formatMoney(season.individualAwardsMoney)} por prêmios individuais` : ""}</p>`).join("")}</div></section>`;
}

const financeLabels = {
  bilheteria: "Bilheteria",
  salarios: "Salários do elenco",
  transferencias: "Transferências",
  emprestimos: "Empréstimos",
  premiacaoLiga: "Premiação da liga",
  premiosIndividuais: "Prêmios individuais",
  estadio: "Ampliação do estádio",
  olheiros: "Categoria de base e olheiros",
  contratos: "Renovações de contrato"
};

function signedMoney(value) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
}

function reportTabs() {
  const tabs = [
    ["overview", "Visão geral"],
    ["standings", "Classificação"],
    ["awards", "Premiações"],
    ["team", "Seleção da liga"],
    ["finance", "Finanças"],
    ["players", "Evolução do elenco"]
  ];
  return `<div class="season-report-tabs" role="tablist" aria-label="Seções do resumo da temporada">${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${seasonReportTab === id}" class="${seasonReportTab === id ? "active" : ""}" data-season-tab="${id}">${label}</button>`).join("")}</div>`;
}

function renderSeasonOverview(report) {
  const champion = report.standings[0];
  const finance = report.club.finance;
  const placementPrize = game.lastSeasonAwards?.clubs?.[game.userClubId]?.prize ?? 0;
  const ownAwards = report.awards.filter(award => award.clubId === game.userClubId);
  const movement = report.promoted.find(item => item.clubId === game.userClubId) || report.relegated.find(item => item.clubId === game.userClubId);
  const bestChange = report.club.playerChanges[0];
  return `<div class="season-report-summary">
    <section class="season-hero"><div><p class="eyebrow">${escapeHtml(report.leagueName)} · ${escapeHtml(report.label)}</p><h3>${escapeHtml(champion?.clubName || "Temporada encerrada")}</h3><p>${champion?.clubId === game.userClubId ? "Seu clube levantou a taça." : "Campeão da temporada."}</p></div><strong>${champion?.points ?? 0}<small>pontos</small></strong></section>
    <div class="season-kpi-grid">
      <article><small>Sua colocação</small><strong>${report.club.position}º</strong><span>${report.club.points} pontos · ${report.club.wins}V ${report.club.draws}E ${report.club.losses}D</span></article>
      <article><small>Saldo da temporada</small><strong class="${finance.net >= 0 ? "positive-number" : "negative-number"}">${signedMoney(finance.net)}</strong><span>Caixa final de ${formatMoney(finance.endingBudget)}</span></article>
      <article><small>Premiações</small><strong>${formatMoney(placementPrize + ownAwards.reduce((total, award) => total + award.money, 0))}</strong><span>${ownAwards.length} prêmio${ownAwards.length === 1 ? " individual" : "s individuais"}</span></article>
      <article><small>Destino</small><strong>${movement ? (report.promoted.some(item => item.clubId === game.userClubId) ? "Acesso" : "Rebaixado") : "Permanece"}</strong><span>${movement ? escapeHtml(movement.to) : escapeHtml(report.leagueName)}</span></article>
    </div>
    <div class="season-overview-grid">
      <section class="card card-body"><h3>Campanha</h3><p><strong>${report.club.goalsFor}</strong> gols marcados e <strong>${report.club.goalsAgainst}</strong> sofridos.</p><p>Saldo de gols: <strong>${report.club.goalsFor - report.club.goalsAgainst}</strong>.</p></section>
      <section class="card card-body"><h3>Destaque do elenco</h3>${bestChange ? `<p><strong>${escapeHtml(bestChange.playerName)}</strong> teve a maior valorização.</p><p class="positive-number">${signedMoney(bestChange.valueChange)} · geral ${bestChange.startOverall} → ${bestChange.endOverall}</p>` : `<p>Não há comparação disponível para esta temporada.</p>`}</section>
      <section class="card card-body"><h3>Movimentações</h3>${report.promoted.length || report.relegated.length ? `<p><strong>Subiram:</strong> ${report.promoted.map(item => escapeHtml(item.clubName)).join(", ") || "—"}</p><p><strong>Caíram:</strong> ${report.relegated.map(item => escapeHtml(item.clubName)).join(", ") || "—"}</p>` : `<p>Esta liga não teve acesso ou rebaixamento.</p>`}</section>
    </div>
  </div>`;
}

function renderSeasonStandings(report) {
  return `<section class="card data-card"><table class="data-table"><thead><tr><th>#</th><th>Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>PTS</th></tr></thead><tbody>${report.standings.map(row => `<tr class="${row.clubId === game.userClubId ? "user-row" : ""}"><td><strong>${row.position}</strong></td><td class="player-name">${escapeHtml(row.clubName)}</td><td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gf - row.ga}</td><td><strong>${row.points}</strong></td></tr>`).join("")}</tbody></table></section>`;
}

function renderSeasonAwards(report) {
  return `<div class="season-awards-grid">${report.awards.map(award => `<article class="card season-award"><span>${award.type === "topScorer" ? "⚽" : award.type === "topAssister" ? "◎" : "★"}</span><small>${escapeHtml(award.label)}</small><h3>${escapeHtml(award.playerName)}</h3><p>${escapeHtml(award.clubName)}</p><strong>${escapeHtml(award.statLabel)}</strong><em>${formatMoney(award.money)} para o clube · geral +${award.overallGain} · potencial +${award.potentialGain}</em></article>`).join("") || `<section class="card card-body"><p>Nenhuma premiação individual registrada.</p></section>`}</div>`;
}

function renderSeasonTeam(report) {
  const positions = [report.teamOfSeason.slice(8, 11), report.teamOfSeason.slice(5, 8), report.teamOfSeason.slice(1, 5), report.teamOfSeason.slice(0, 1)];
  const minimumAppearances = report.teamOfSeasonMinimumAppearances ?? Math.max(1, Math.ceil(Math.max(0, ...report.standings.map(row => row.played)) * 0.4));
  const playerCard = player => `<article class="season-team-player" aria-label="${escapeHtml(player.playerName)}, ${player.position}, nota ${player.average.toFixed(1)}">${teamShirtMarkup(getClub(game, player.clubId) || { name: player.clubName }, player.position)}<strong>${escapeHtml(player.playerName)}</strong><small>${escapeHtml(player.clubName)}</small><em>Nota ${player.average.toFixed(1).replace(".", ",")}</em><span>${player.appearances}J · ${player.goals}G · ${player.assists}A</span></article>`;
  return `<section class="card season-team-card"><div class="card-header"><h3>Time do campeonato</h3><span>Formação 4-3-3 · participação mínima de 40% (${minimumAppearances} jogos)</span></div><div class="season-team-pitch"><div class="field-markings" aria-hidden="true"><span class="field-center-circle"></span><span class="field-center-spot"></span><span class="field-box field-box-top"><i></i><b></b></span><span class="field-box field-box-bottom"><i></i><b></b></span></div>${positions.map(row => `<div class="season-team-row" style="--players:${row.length}">${row.map(playerCard).join("")}</div>`).join("")}</div></section>`;
}

function renderSeasonFinance(report) {
  const finance = report.club.finance;
  const rows = [...Object.entries(finance.income).map(([key, value]) => ({ key, value, type: "Receita" })), ...Object.entries(finance.expenses).map(([key, value]) => ({ key, value: -value, type: "Despesa" }))];
  if (Math.abs(finance.other) >= 1) rows.push({ key: "outros", value: finance.other, type: "Ajustes" });
  return `<div class="season-finance-grid"><article><small>Caixa inicial</small><strong>${formatMoney(finance.startingBudget)}</strong></article><article><small>Total ganho</small><strong class="positive-number">${formatMoney(finance.totalIncome)}</strong></article><article><small>Total gasto</small><strong class="negative-number">${formatMoney(finance.totalExpenses)}</strong></article><article><small>Caixa final</small><strong>${formatMoney(finance.endingBudget)}</strong></article></div><section class="card data-card"><table class="data-table"><thead><tr><th>Categoria</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${rows.sort((first, second) => Math.abs(second.value) - Math.abs(first.value)).map(row => `<tr><td class="player-name">${financeLabels[row.key] || "Outros ajustes"}</td><td>${row.type}</td><td class="${row.value >= 0 ? "positive-number" : "negative-number"}"><strong>${signedMoney(row.value)}</strong></td></tr>`).join("")}</tbody></table></section>`;
}

function renderSeasonPlayers(report) {
  const changes = report.club.playerChanges;
  return `<section class="card data-card"><div class="card-header"><h3>Valorização e desvalorização</h3><span>Comparação com o início da temporada</span></div><table class="data-table"><thead><tr><th>Atleta</th><th>Pos.</th><th>Geral inicial</th><th>Geral final</th><th>Valor inicial</th><th>Valor final</th><th>Variação</th></tr></thead><tbody>${changes.map(player => `<tr><td class="player-name">${escapeHtml(player.playerName)}</td><td><span class="position-pill">${player.position}</span></td><td>${player.startOverall}</td><td><strong>${player.endOverall}</strong><small>${player.overallChange > 0 ? `+${player.overallChange}` : player.overallChange || "sem alteração"}</small></td><td>${formatMoney(player.startValue)}</td><td>${formatMoney(player.endValue)}</td><td class="${player.valueChange >= 0 ? "positive-number" : "negative-number"}"><strong>${signedMoney(player.valueChange)}</strong></td></tr>`).join("") || `<tr><td colspan="7" class="empty-state">A comparação começará a partir da próxima temporada completa.</td></tr>`}</tbody></table></section>`;
}

function renderSeasonReport() {
  const report = game.seasonReport;
  if (!report) { activeView = "dashboard"; renderDashboard(); return; }
  const renderers = { overview: renderSeasonOverview, standings: renderSeasonStandings, awards: renderSeasonAwards, team: renderSeasonTeam, finance: renderSeasonFinance, players: renderSeasonPlayers };
  content.innerHTML = `${pageHeading("Encerramento da temporada", `Resumo ${escapeHtml(report.label)}`, `${escapeHtml(report.leagueName)} · dados preservados para análise`)}${reportTabs()}<div class="season-report-panel" role="tabpanel">${(renderers[seasonReportTab] || renderSeasonOverview)(report)}</div><div class="season-report-actions"><p>Revise os dados antes de planejar o próximo ano.</p><button type="button" class="primary-button" data-start-next-season>Iniciar próxima temporada <span>→</span></button></div>`;
}

function renderStadium() {
  const club = getUserClub(game);
  const cost = stadiumUpgradeCost(club);
  content.innerHTML = `${pageHeading("Patrimônio do clube", "Estádio", "Amplie para aumentar a renda de bilheteria")}
    <section class="card stadium-hero"><div class="stadium-visual"><div class="pitch"></div></div><div class="stadium-info">
      <p class="eyebrow">Nível ${club.stadium.level} de 5</p><h3>${escapeHtml(club.stadium.name)}</h3><p>A casa do ${escapeHtml(club.name)} e o principal ponto de encontro da torcida.</p>
      <div class="stadium-facts"><div class="fact"><small>Capacidade</small><strong>${club.stadium.capacity.toLocaleString("pt-BR")}</strong></div><div class="fact"><small>Ingresso médio</small><strong>${formatMoney(club.stadium.ticketPrice)}</strong></div><div class="fact"><small>Moral da torcida</small><strong>${club.fanMorale}/100</strong></div><div class="fact"><small>Próximo nível</small><strong>+5.000</strong></div></div>
      <button id="upgrade-button" class="primary-button" ${club.stadium.level >= 5 ? "disabled" : ""}>${club.stadium.level >= 5 ? "Nível máximo" : `Ampliar por ${formatMoney(cost)}`} <span>↑</span></button>
      <p class="upgrade-note">Cada ampliação aumenta a capacidade e melhora a moral da torcida.</p>
    </div></section>`;
}

function renderYouthAcademy() {
  const academy = ensureYouthAcademy(game);
  const payroll = academy.scouts.reduce((total, scout) => total + scout.salary, 0);
  const marketRounds = scoutMarketRoundsRemaining(game);
  const scoutCards = academy.scouts.map(scout => {
    const specialty = SCOUT_REGIONS.find(region => region.id === scout.specialty)?.name || "Mundial";
    const missionRegion = SCOUT_REGIONS.find(region => region.id === scout.mission?.regionId);
    const progress = scout.mission ? Math.round((scout.mission.totalRounds - scout.mission.roundsRemaining) / scout.mission.totalRounds * 100) : 0;
    return `<article class="academy-scout">
      <div class="academy-scout-head"><div><strong>${escapeHtml(scout.name)}</strong><small>${scoutExperienceLabel(scout.experience)} · ${"★".repeat(scout.experience)}${"☆".repeat(5 - scout.experience)}</small></div><button class="text-button" data-dismiss-scout="${scout.id}">Dispensar</button></div>
      <p>Especialidade: ${escapeHtml(specialty)} · ${formatMoney(scout.salary)}/rodada · contrato para 1 relatório</p>
      ${scout.mission ? `<div class="academy-mission"><strong>Observando ${escapeHtml(missionRegion.name)}</strong><small>${scout.mission.roundsRemaining} ${scout.mission.roundsRemaining === 1 ? "rodada restante" : "rodadas restantes"}</small><div class="progress lime"><i style="width:${progress}%"></i></div></div>` : `<div class="academy-scout-action"><select id="scout-region-${scout.id}" aria-label="Região de ${escapeHtml(scout.name)}">${SCOUT_REGIONS.map(region => `<option value="${region.id}" ${region.id === scout.specialty ? "selected" : ""}>${escapeHtml(region.name)}</option>`).join("")}</select><button class="secondary-button" data-start-scout="${scout.id}">Iniciar busca</button></div>`}
    </article>`;
  }).join("");
  const candidates = academy.candidateScouts.map(scout => `<tr><td class="player-name">${escapeHtml(scout.name)}<small>Especialista em ${escapeHtml(SCOUT_REGIONS.find(region => region.id === scout.specialty)?.name || "múltiplas regiões")} · disponível por mais ${Math.max(0, scout.availableUntil - academy.scoutMarketTime)} rodada(s)</small></td><td>${scoutExperienceLabel(scout.experience)}<small>${"★".repeat(scout.experience)}${"☆".repeat(5 - scout.experience)}</small></td><td>${formatMoney(scout.salary)}/rod.</td><td>${formatMoney(scout.signingFee)}</td><td><strong>${formatMoney(scoutContractCost(scout))}</strong><small>luvas + salários previstos</small></td><td><button class="action-button buy" data-hire-scout="${scout.id}" ${academy.scouts.length >= 3 ? "disabled" : ""}>Contratar</button></td></tr>`).join("");
  const prospects = sortYouthProspects(academy.prospects, academySort.key, academySort.direction).map(player => {
    const [minimum, maximum] = academyPotentialRange(player);
    const region = SCOUT_REGIONS.find(item => item.id === player.academy?.regionId);
    return `<tr><td class="player-name">${escapeHtml(player.name)}<small>${escapeHtml(player.country)} · descoberto em ${escapeHtml(region?.name || "outra região")}</small></td><td><span class="position-pill">${player.position}</span></td><td>${player.age}</td><td><span class="rating ${ratingClass(player.overall)}">${player.overall}</span></td><td><strong>${minimum}–${maximum}</strong><small>estimativa do olheiro</small></td><td>${formatMoney(player.value)}</td><td class="academy-actions"><button class="action-button buy" data-promote-prospect="${player.id}" ${player.age < 16 ? "disabled" : ""}>Promover</button><button class="action-button" data-release-prospect="${player.id}">Dispensar</button></td></tr>`;
  }).join("");
  content.innerHTML = `${pageHeading("Formação de talentos", "Categoria de base", `${academy.prospects.length}/18 jovens · ${academy.scouts.length}/3 olheiros`)}
    <div class="academy-summary metric-grid"><div class="metric"><small>Folha dos olheiros</small><strong>${formatMoney(payroll)}</strong><em>por rodada</em></div><div class="metric"><small>Talentos observados</small><strong>${academy.prospects.length}</strong><em>máximo 18</em></div><div class="metric"><small>Equipe de scouting</small><strong>${academy.scouts.length}</strong><em>máximo 3</em></div></div>
    <section class="card academy-section"><div class="card-header"><h3>Seus olheiros</h3><span>O vínculo termina automaticamente quando o relatório é entregue</span></div><div class="academy-scout-grid">${scoutCards || `<div class="empty-state">Contrate um olheiro para começar a buscar talentos.</div>`}</div></section>
    <section class="card data-card academy-section"><div class="card-header"><h3>Olheiros disponíveis</h3><span>Mercado renova em ${marketRounds} ${marketRounds === 1 ? "rodada" : "rodadas"} · especialistas e elites são raros</span></div><table class="data-table"><thead><tr><th>Olheiro</th><th>Experiência</th><th>Salário</th><th>Luvas</th><th>Custo da missão</th><th>Ação</th></tr></thead><tbody>${candidates || `<tr><td colspan="6" class="empty-state">Novos profissionais chegarão na próxima renovação.</td></tr>`}</tbody></table></section>
    <section class="card data-card academy-section"><div class="card-header"><h3>Talentos observados</h3><span>Valor projetado, não uma oferta · dispensar não gera receita</span></div><table class="data-table academy-table"><thead><tr>${academyColumns.map(column => {
      const active = academySort.key === column.key;
      const next = active ? academySort.direction === "asc" ? "desc" : "asc" : column.direction;
      return `<th scope="col" class="sortable-heading" aria-sort="${active ? academySort.direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" data-academy-sort="${column.key}" title="Ordenar por ${column.label.toLocaleLowerCase("pt-BR")} em ordem ${next === "asc" ? "crescente" : "decrescente"}">${column.label}<span aria-hidden="true">${active ? academySort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>`;
    }).join("")}<th scope="col">Ações</th></tr></thead><tbody>${prospects || `<tr><td colspan="7" class="empty-state">Nenhum talento observado. Envie um olheiro para uma região.</td></tr>`}</tbody></table><p class="view-note academy-value-note">Após a promoção, o jovem precisa atuar em 5 jogos para receber propostas. O valor oferecido começa baixo e cresce gradualmente até ele se firmar no profissional.</p></section>`;
}

function renderMatch() {
  const focusAttribute = ["data-match-player", "data-formation", "data-match-tactic", "data-set-taker", "data-round-match", "data-match-panel"].find(attribute => document.activeElement?.hasAttribute(attribute));
  const focusValue = focusAttribute ? document.activeElement.getAttribute(focusAttribute) : null;
  const html = renderRound(game, matchSpeed, selectedRoundMatch, matchPanel, selectedMatchPlayer, activeView === "roundReport");
  if (!content.querySelector("#match-speed") || activeView === "roundReport") {
    content.innerHTML = html;
    return;
  }

  // Keep the speed button mounted so live ticks preserve keyboard focus.
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const next of template.content.querySelectorAll("[data-match-region]")) {
    const current = content.querySelector(`[data-match-region="${next.dataset.matchRegion}"]`);
    if (current.innerHTML !== next.innerHTML) current.innerHTML = next.innerHTML;
  }
  if (focusAttribute) content.querySelector(`[${focusAttribute}="${focusValue}"]`)?.focus({ preventScroll: true });
}

function render() {
  if (game && activeView !== "setup") game.news = game.news.map(item => ({ ...item, read: item.read ?? false, season: item.season ?? game.season, week: item.week ?? game.week })).slice(0, 200);
  renderHeader();
  if (startupError) { content.innerHTML = `<section class="card card-body" role="alert"><h2>Não foi possível carregar a carreira</h2><p>${escapeHtml(startupError)}</p><p>Recarregue a página para tentar novamente. O salvamento existente não foi substituído.</p></section>`; return; }
  if (activeView === 'setup') { careerSetup.render(); if (!careerSetup.database && !careerSetup.loading && !careerSetup.error) careerSetup.load(); return; }
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === (activeView === "player" ? playerDetailReturnView : activeView)));
  ({ match: renderMatch, roundReport: renderMatch, seasonReport: renderSeasonReport, dashboard: renderDashboard, mail: renderMail, squad: renderSquad, player: renderPlayerDetails, lineup: () => lineupEditor.render(), academy: renderYouthAcademy, market: renderMarket, competition: renderCompetition, stadium: renderStadium }[activeView] || renderDashboard)();
  syncPenaltyDialog();
}

function openPenaltyDialog() {
  const html = renderPenaltyDialog(game);
  if (!html || penaltyDialog.open) return;
  penaltyDialog.innerHTML = html;
  penaltyDialog.showModal();
  penaltyDialog.querySelector("input:checked")?.focus({ preventScroll: true });
}

function syncPenaltyDialog() {
  const match = game.activeMatch;
  if (match?.phase !== "penalty" || match.pendingPenalty?.clubId !== game.userClubId) {
    if (penaltyDialog.open) penaltyDialog.close();
    penaltyPromptKey = null;
    return;
  }
  if (activeView !== "match") return;
  const key = `${match.season}-${match.week}-${match.minute}`;
  if (penaltyPromptKey === key) return;
  penaltyPromptKey = key;
  openPenaltyDialog();
}

penaltyDialog.addEventListener("change", event => {
  if (event.target.name !== "penalty-taker") return;
  const player = getUserClub(game).squad.find(item => item.id === event.target.value);
  penaltyDialog.querySelector("#take-penalty-button").textContent = `Cobrar com ${player.name}`;
});
penaltyDialog.addEventListener("submit", event => {
  event.preventDefault();
  const takerId = new FormData(event.target).get("penalty-taker");
  matchAction("penalty", takerId);
});
penaltyDialog.addEventListener("click", event => {
  if (event.target.closest("[data-close-penalty]")) penaltyDialog.close();
});

function stopMatchClock() {
  clearTimeout(matchTimer);
  if (game?.activeMatch?.phase === "playing") { pauseMatch(game); saveGame(); }
}

function scheduleMatchTick() {
  clearTimeout(matchTimer);
  if (game?.activeMatch?.phase !== "playing" || activeView !== "match") return;
  matchTimer = setTimeout(() => {
    if (game?.activeMatch?.phase !== "playing" || activeView !== "match") return;
    advanceMatchMinute(game);
    if (game.activeMatch.phase === "penalty") { selectedRoundMatch = null; matchPanel = "stats"; }
    saveGame();
    render();
    scheduleMatchTick();
  }, matchSpeed);
}

async function matchAction(action, takerId) {
  clearTimeout(matchTimer);
  let result;
  if (action === "play") result = resumeMatch(game);
  if (action === "pause") result = pauseMatch(game);
  if (action === "step") {
    result = resumeMatch(game);
    if (result.ok) {
      for (let index = 0; index < 5 && game.activeMatch.phase === "playing"; index++) advanceMatchMinute(game);
      if (game.activeMatch.phase === "playing") pauseMatch(game);
    }
  }
  if (action === "penalty") result = takePenalty(game, takerId);
  if (action === "finish") {
    result = finishLiveRound(game);
    if (result.ok) { activeView = game.finished && game.seasonReport ? "seasonReport" : "dashboard"; render(); try { await updatePlayerBalance(game); } catch { showToast("Atualização dos jogadores pendente. Será tentada na próxima abertura.", true); } showToast(game.finished ? "Temporada encerrada!" : "Rodada concluída!"); }
  }
  if (!result) return;
  if (game?.activeMatch?.phase === "penalty") { selectedRoundMatch = null; matchPanel = "stats"; }
  if (action === "play" && result.ok) { selectedRoundMatch = null; matchPanel = "stats"; }
  selectedMatchPlayer = null;
  if (result.ok) saveGame();
  if (result.message) showToast(result.message, !result.ok);
  render();
  scheduleMatchTick();
}

document.querySelector(".nav").addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (!button || button.disabled || !game || careerSetup.busy) return;
  stopMatchClock();
  activeView = button.dataset.view;
  selectedPlayerDetailId = null;
  render();
});

function applyMatchDecision(result) {
  if (result.ok) { selectedMatchPlayer = null; saveGame(); }
  if (result.message) showToast(result.message, !result.ok);
  renderMatch();
}

function clearMatchDrag() {
  document.querySelector(".match-drag-preview")?.remove();
  content.querySelectorAll(".drop-target, .drag-origin").forEach(item => item.classList.remove("drop-target", "drag-origin"));
  matchDrag = null;
}

// Pointer dragging also works on touchscreens and does not depend on native HTML drag menus.
content.addEventListener("dragstart", event => { if (event.target.closest("[data-match-player]")) event.preventDefault(); });
content.addEventListener("pointerdown", event => {
  const player = event.target.closest('[data-match-player][draggable="true"]');
  if (!player || event.button !== 0) return;
  matchDrag = { id: player.dataset.matchPlayer, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moving: false, source: player };
});
content.addEventListener("pointermove", event => {
  if (!matchDrag || matchDrag.pointerId !== event.pointerId) return;
  if (!matchDrag.moving && Math.hypot(event.clientX - matchDrag.x, event.clientY - matchDrag.y) < 8) return;
  event.preventDefault();
  if (!matchDrag.moving) {
    matchDrag.moving = true;
    content.setPointerCapture(event.pointerId);
    matchDrag.source.classList.add("drag-origin");
    const preview = document.createElement("div");
    preview.className = "match-drag-preview";
    preview.textContent = matchDrag.source.querySelector("strong").textContent;
    document.body.append(preview);
  }
  const preview = document.querySelector(".match-drag-preview");
  preview.style.left = `${event.clientX + 12}px`;
  preview.style.top = `${event.clientY + 12}px`;
  content.querySelectorAll(".drop-target").forEach(item => item.classList.remove("drop-target"));
  const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-match-slot]");
  if (slot && !slot.disabled) slot.classList.add("drop-target");
});
content.addEventListener("pointerup", event => {
  if (!matchDrag || matchDrag.pointerId !== event.pointerId) return;
  const { id, moving } = matchDrag;
  const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-match-slot]");
  if (content.hasPointerCapture(event.pointerId)) content.releasePointerCapture(event.pointerId);
  clearMatchDrag();
  if (!moving) return;
  suppressPlayerClickUntil = Date.now() + 250;
  if (slot && !slot.disabled) applyMatchDecision(moveMatchPlayer(game, id, Number(slot.dataset.matchSlot)));
});
content.addEventListener("pointercancel", clearMatchDrag);
content.addEventListener("lostpointercapture", clearMatchDrag);

function openPlayerDetails(target) {
  selectedPlayerDetailId = target.dataset.playerDetails;
  playerDetailReturnView = target.dataset.playerReturn === "market" ? "market" : "squad";
  activeView = "player";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

content.addEventListener("keydown", event => {
  const row = event.target.closest("tr.player-detail-row[data-player-details]");
  if (!row || event.target !== row || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  openPlayerDetails(row);
});

content.addEventListener("click", event => {
  const seasonTab = event.target.closest("[data-season-tab]");
  if (seasonTab) { seasonReportTab = seasonTab.dataset.seasonTab; renderSeasonReport(); return; }
  if (event.target.closest("[data-start-next-season]")) {
    const result = startNextSeason(game);
    if (result.ok) { seasonReportTab = "overview"; activeView = "dashboard"; saveGame(); showToast("Nova temporada iniciada!"); }
    else showToast(result.message, true);
    render();
    return;
  }
  const playerDetails = event.target.closest("[data-player-details]");
  const action = event.target.closest("button, a, input, select, textarea, label");
  if (playerDetails && (!action || action.classList.contains("player-detail-link"))) {
    openPlayerDetails(playerDetails);
    return;
  }
  if (event.target.closest("[data-player-back]")) {
    activeView = playerDetailReturnView;
    selectedPlayerDetailId = null;
    render();
    return;
  }
  const marketSortButton = event.target.closest('[data-market-sort]');
  if (marketSortButton) {
    const column = MARKET_COLUMNS.find(item => item.key === marketSortButton.dataset.marketSort);
    if (!column) return;
    marketFilters.direction = marketFilters.sort === column.key ? (marketFilters.direction === 'asc' ? 'desc' : 'asc') : column.direction;
    marketFilters.sort = column.key;
    marketPage = 0;
    renderMarketResults();
    return;
  }
  if (event.target.closest('#market-clear')) { Object.assign(marketFilters, defaultMarketFilters()); marketPage = 0; renderMarket(); return; }
  const pageButton = event.target.closest('[data-market-page]');
  if (pageButton && !pageButton.disabled) { marketPage += Number(pageButton.dataset.marketPage); renderMarketResults(); return; }
  const speedButton = event.target.closest("#match-speed");
  if (speedButton) {
    matchSpeed = matchSpeed === 1000 ? 250 : 1000;
    speedButton.textContent = matchSpeed === 250 ? "Rápida · 4×" : "Normal · 1×";
    speedButton.dataset.speed = String(matchSpeed);
    speedButton.setAttribute("aria-label", `Velocidade ${matchSpeed === 250 ? "rápida. Alternar para normal" : "normal. Alternar para rápida"}`);
    scheduleMatchTick();
    return;
  }
  if (Date.now() < suppressPlayerClickUntil) return;
  if (event.target.closest("[data-open-penalty]")) { openPenaltyDialog(); return; }
  const report = event.target.closest("[data-round-report]");
  if (report) { stopMatchClock(); activeView = "roundReport"; selectedRoundMatch = report.dataset.roundReport; matchPanel = "stats"; render(); return; }
  const fixture = event.target.closest("[data-round-match], [data-featured-match]");
  if (fixture || event.target.closest("[data-open-own]")) {
    selectedRoundMatch = fixture?.dataset.roundMatch || fixture?.dataset.featuredMatch || game.activeMatch.homeId;
    selectedMatchPlayer = null;
    const own = activeView === "match" && selectedRoundMatch === game.activeMatch.homeId;
    matchPanel = own && game.activeMatch.phase !== "finished" ? "tactics" : "stats";
    if (own) { stopMatchClock(); saveGame(); }
    renderMatch();
    window.scrollTo({ top: 0, behavior: "instant" });
    content.querySelector(".detail-heading")?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest("[data-close-match]")) { selectedRoundMatch = null; selectedMatchPlayer = null; renderMatch(); return; }
  const panel = event.target.closest("[data-match-panel]");
  if (panel) { matchPanel = panel.dataset.matchPanel; if (matchPanel === "tactics") stopMatchClock(); renderMatch(); return; }
  const formation = event.target.closest("[data-formation]");
  if (formation) { applyMatchDecision(setMatchFormation(game, formation.dataset.formation)); return; }
  const posture = event.target.closest("[data-match-tactic]");
  if (posture) { applyMatchDecision(setTactic(game, posture.dataset.matchTactic)); return; }
  const marking = event.target.closest("[data-match-marking]");
  if (marking) { applyMatchDecision(setMarkingIntensity(game, marking.dataset.matchMarking)); return; }
  const taker = event.target.closest("[data-set-taker]");
  if (taker) { applyMatchDecision(setPenaltyTaker(game, taker.dataset.setTaker)); return; }
  if (event.target.closest("[data-clear-player]")) { selectedMatchPlayer = null; renderMatch(); return; }
  const slot = event.target.closest("[data-match-slot]");
  const player = event.target.closest("[data-match-player]");
  if (selectedMatchPlayer && slot && game.activeMatch.phase !== "penalty" && selectedMatchPlayer !== player?.dataset.matchPlayer) {
    applyMatchDecision(moveMatchPlayer(game, selectedMatchPlayer, Number(slot.dataset.matchSlot)));
    return;
  }
  if (player) { selectedMatchPlayer = selectedMatchPlayer === player.dataset.matchPlayer ? null : player.dataset.matchPlayer; renderMatch(); return; }

  const matchButton = event.target.closest("[data-match-action]");
  if (matchButton) { matchAction(matchButton.dataset.matchAction); return; }
  const sortButton = event.target.closest("[data-squad-sort]");
  if (sortButton) {
    const column = squadColumns.find(item => item.key === sortButton.dataset.squadSort);
    if (!column) return;
    const scrollLeft = content.querySelector(".data-card").scrollLeft;
    squadSort.direction = squadSort.key === column.key ? squadSort.direction === "asc" ? "desc" : "asc" : column.direction;
    squadSort.key = column.key;
    renderSquad();
    content.querySelector(".data-card").scrollLeft = scrollLeft;
    content.querySelector(`[data-squad-sort="${column.key}"]`).focus({ preventScroll: true });
    return;
  }
  const academySortButton = event.target.closest("[data-academy-sort]");
  if (academySortButton) {
    const column = academyColumns.find(item => item.key === academySortButton.dataset.academySort);
    if (!column) return;
    const scrollLeft = content.querySelector(".academy-table")?.closest(".data-card")?.scrollLeft || 0;
    academySort.direction = academySort.key === column.key ? academySort.direction === "asc" ? "desc" : "asc" : column.direction;
    academySort.key = column.key;
    renderYouthAcademy();
    const card = content.querySelector(".academy-table")?.closest(".data-card");
    if (card) card.scrollLeft = scrollLeft;
    content.querySelector(`[data-academy-sort="${column.key}"]`)?.focus({ preventScroll: true });
    return;
  }
  const incomingAcceptance = event.target.closest("[data-accept-incoming]");
  if (incomingAcceptance) {
    const result = acceptIncomingOffer(game, incomingAcceptance.dataset.acceptIncoming);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const incomingNegotiation = event.target.closest("[data-negotiate-incoming]");
  if (incomingNegotiation) { openIncomingNegotiation(incomingNegotiation.dataset.negotiateIncoming); return; }
  const incomingRejection = event.target.closest("[data-reject-incoming]");
  if (incomingRejection) {
    const result = rejectIncomingOffer(game, incomingRejection.dataset.rejectIncoming);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const mailMessage = event.target.closest("[data-mail-read]");
  if (mailMessage) {
    const message = game.news.find(item => item.id === mailMessage.dataset.mailRead);
    if (message && message.read !== true) { message.read = true; saveGame(); render(); }
    return;
  }
  if (event.target.closest("[data-mail-read-all]")) {
    clubMail().forEach(item => { item.read = true; });
    saveGame(); render(); return;
  }
  const offer = event.target.closest("[data-offer]");
  if (offer) { openOffer(offer.dataset.club, offer.dataset.offer); return; }
  const go = event.target.closest("[data-go]");
  if (go) { activeView = go.dataset.go; render(); return; }
  const buy = event.target.closest("[data-buy]");
  if (buy) {
    const result = buyPlayer(game, buy.dataset.buy);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const renewal = event.target.closest('[data-renew]');
  if(renewal){const result=renewContract(game,renewal.dataset.renew);if(result.ok)saveGame();showToast(result.message,!result.ok);render();return;}
  const sell = event.target.closest("[data-sell]");
  if (sell) {
    const result = sellPlayer(game, sell.dataset.sell);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const loanOut = event.target.closest("[data-loan-out]");
  if (loanOut) {
    const result = loanOutPlayer(game, loanOut.dataset.loanOut);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const hire = event.target.closest("[data-hire-scout]");
  if (hire) {
    const result = hireScout(game, hire.dataset.hireScout);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const dismiss = event.target.closest("[data-dismiss-scout]");
  if (dismiss) {
    const result = dismissScout(game, dismiss.dataset.dismissScout);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const scout = event.target.closest("[data-start-scout]");
  if (scout) {
    const regionId = content.querySelector(`#scout-region-${scout.dataset.startScout}`)?.value;
    const result = startScouting(game, scout.dataset.startScout, regionId);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const promotion = event.target.closest("[data-promote-prospect]");
  if (promotion) {
    const result = promoteProspect(game, promotion.dataset.promoteProspect);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  const release = event.target.closest("[data-release-prospect]");
  if (release) {
    const result = releaseProspect(game, release.dataset.releaseProspect);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render(); return;
  }
  if (event.target.closest("#upgrade-button")) {
    const result = upgradeStadium(game);
    if (result.ok) saveGame();
    showToast(result.message, !result.ok); render();
  }
});

content.addEventListener("input", event => {
  const filters = { "market-query": "query", "market-club": "clubId", "market-type": "dealType" };
  const key = event.target.dataset.marketFilter || filters[event.target.id];
  if (event.target.dataset.marketPosition) {
    marketFilters.positions = [...content.querySelectorAll('[data-market-position]:checked')].map(input=>input.dataset.marketPosition);
  } else if (key) {
    marketFilters[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value) * Number(event.target.dataset.unit || 1)) : event.target.value;
  } else return;
  marketPage = 0;
  renderMarketResults();
});

content.addEventListener("change", event => {
  if (event.target.id === "competition-league") { competitionLeagueId = event.target.value; renderCompetition(); return; }
  if (event.target.id !== "tactic") return;
  setTactic(game, event.target.value);
  saveGame();
  showToast("Postura tática atualizada.");
});

function beginRound() {
  if (game.activeMatch) { activeView = "match"; render(); return; }
  if (game.finished) { activeView = "seasonReport"; render(); return; }
  const result = startMatch(game);
  if (result.ok) {
    saveGame();
    activeView = game.finished && game.seasonReport ? "seasonReport" : result.bye ? "dashboard" : "match";
    selectedRoundMatch = null; matchPanel = "stats"; selectedMatchPlayer = null;
  } else {
    showToast(result.message, true);
  }
  render();
}
advanceButton.addEventListener('click', () => {
  if(!game.activeMatch&&!game.finished&&nextFixture()&&activeView!=='lineup') { activeView='lineup';render();saveGame();return; }
  beginRound();
});

document.querySelector("#new-game-button").addEventListener("click", () => {
  if (careerSetup.busy || startupError) return;
  stopMatchClock(); activeView = 'setup'; render(); window.scrollTo(0, 0);
});

render();
saveGame();
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game?.activeMatch?.phase === "playing") { stopMatchClock(); render(); }
});
