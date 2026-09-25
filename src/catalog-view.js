import { escapeHtml as html } from "./html.js";

export function validateCatalog(data) {
  if (data?.version !== 1 || !Array.isArray(data.teams) || data.teams.length > 2000 || !Array.isArray(data.countries)) throw new Error("Catálogo local inválido.");
  const ids = new Set();
  for (const team of data.teams) {
    if (!/^[a-z0-9-]+$/.test(team.id) || ids.has(team.id) || typeof team.name !== "string" || team.name.length > 80 || !/^[A-Z]{3}$/.test(team.country) || !Number.isInteger(team.players) || team.players < 14 || team.players > 40 || !Number.isInteger(team.strength) || team.strength < 1 || team.strength > 99 || team.csv !== `data/m26/times/${team.id}.csv` || team.badgePath !== `data/m26/escudos/${team.id}.png`) throw new Error("Time inválido no catálogo local.");
    ids.add(team.id);
  }
  if (!Number.isInteger(data.players) || data.players !== data.teams.reduce((sum, team) => sum + team.players, 0) || typeof data.name !== "string" || data.countries.some(c => !/^[A-Z]{3}$/.test(c.code) || typeof c.name !== "string")) throw new Error("Resumo do catálogo inválido.");
  return data;
}

const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function catalogTeams(catalog, country, query) {
  return catalog.teams.filter(t => (country === "all" || t.country === country) && normalize(t.name).includes(normalize(query.trim())));
}

export function catalogRows(catalog, country, query, selection) {
  const teams = catalogTeams(catalog, country, query);
  return teams.length ? teams.map(t => `<label class="catalog-team"><input type="checkbox" data-catalog-select="${t.id}" ${selection.has(t.id) ? "checked" : ""} aria-label="Selecionar ${html(t.name)} (${t.country})"><img src="${t.badgePath}" alt="" loading="lazy"><span><strong>${html(t.name)}</strong><small>${t.country} · ${t.players} jogadores · Força original ${t.strength}</small></span></label>`).join("") : `<p class="empty-state">Nenhum time encontrado com estes filtros.</p>`;
}

export function renderCatalog(catalog, country, query, selection, busy, available = 20) {
  if (!catalog) return `<section class="card m26-intro"><div><h3>Clubes disponíveis</h3><p>Escolha os clubes que deseja usar.</p></div><button class="primary-button" data-import-action="catalog" ${busy ? "disabled" : ""}>Explorar times</button></section>`;
  return `<section class="card m26-catalog"><div class="card-header"><h3>Pacote ${html(catalog.name)}</h3><span>${catalog.teams.length} times · ${catalog.players.toLocaleString("pt-BR")} jogadores</span></div><div class="catalog-filters"><label>País<select id="catalog-country"><option value="all">Todos os países</option>${catalog.countries.map(c => `<option value="${html(c.code)}" ${country === c.code ? "selected" : ""}>${html(c.name)} (${c.code})</option>`).join("")}</select></label><label>Pesquisar time<input id="catalog-query" type="search" value="${html(query)}" placeholder="Flamengo, Barcelona, Palmeiras…"></label></div><div id="catalog-list" class="catalog-list">${catalogRows(catalog, country, query, selection)}</div><div class="catalog-footer"><span id="catalog-selected-count">${selection.size} selecionados · ${available} vagas na biblioteca</span><button class="primary-button" data-import-action="catalog-add" ${selection.size && selection.size <= available && !busy ? "" : "disabled"}>Adicionar à minha biblioteca</button></div><p class="view-note catalog-note">Os nomes e elencos são os do pacote enviado. Geral e potencial serão estimados na escala global do Footcore (não são notas individuais do arquivo); você poderá conferir antes de começar. Selecione até 20 clubes no total da biblioteca.</p></section>`;
}
