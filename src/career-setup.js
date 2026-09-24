import { escapeHtml as html } from './html.js';
import { badgeContent } from './club-badge.js';
import { createGameFromDatabase, formatMoney } from './core.js';

export function filterCareerClubs(database, { country = 'BRA', leagueId = 'all', query = '' } = {}) {
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const needle = normalize(query.trim());
  const league = database.leagues.find(l => l.id === leagueId);
  return database.clubs.filter(c => (country === 'all' || c.country === country) && (!league || league.clubIds.includes(c.id)) && (!needle || normalize(c.name).includes(needle)));
}

export class CareerSetup {
  constructor(content, { onStart, onCancel, hasCareer }) {
    Object.assign(this, { content, onStart, onCancel, hasCareer });
    this.country = 'BRA'; this.leagueId = 'all'; this.query = ''; this.selected = null;
    this.database = null; this.loading = false; this.busy = false; this.error = '';
    content.addEventListener('input', event => {
      if (event.target.id !== 'career-query') return;
      this.query = event.target.value; this.renderClubs();
    });
    content.addEventListener('change', event => {
      if (event.target.id === 'career-country') { this.country = event.target.value; this.leagueId = 'all'; this.selected = null; this.query = ''; this.render(); }
      if (event.target.id === 'career-league') { this.leagueId = event.target.value; this.selected = null; this.renderClubs(); this.renderChoice(); }
    });
    content.addEventListener('click', async event => {
      const button = event.target.closest('[data-career-club]');
      if (button && !this.busy) { this.selected = button.dataset.careerClub; this.renderClubs(); this.renderChoice(); }
      if (event.target.closest('#career-cancel') && !this.busy) this.onCancel();
      if (event.target.closest('#career-retry')) this.load();
      if (event.target.closest('#career-start') && !this.busy && this.selected) {
        this.busy = true; this.error = ''; this.renderChoice();
        try {
          const next = createGameFromDatabase(this.database, this.selected, Date.now(), this.database);
          await this.onStart(next);
        } catch (error) { this.error = `Não foi possível iniciar: ${error.message}`; }
        finally { this.busy = false; if (this.content.querySelector('#career-setup')) this.renderChoice(); }
      }
    });
  }
  async load() {
    if (this.loading) return;
    this.loading = true; this.error = ''; this.render();
    try {
      const response = await fetch('data/world/database.json?v=market-2');
      if (!response.ok) throw new Error('A base de clubes não pôde ser carregada.');
      this.database = await response.json();
      if (!this.database.clubs?.length || !this.database.leagues?.length) throw new Error('Base de clubes inválida.');
    } catch (error) { this.error = error.message; }
    finally { this.loading = false; if (this.content.querySelector('#career-setup')) this.render(); }
  }
  render() {
    this.content.innerHTML = `<section id="career-setup"><div class="page-heading"><div><p class="eyebrow">Sua próxima história começa aqui</p><h2>Escolha seu clube</h2></div>${this.hasCareer() ? '<button id="career-cancel" class="secondary-button">Continuar carreira atual</button>' : ''}</div>
      <div class="career-intro"><strong>Brasil 2026 · Europa 2026/27</strong><p>Times, escudos e elencos já carregados. Escolha onde quer começar.</p></div>
      ${!this.database ? `<section class="card card-body" role="status">${this.loading ? 'Carregando países, ligas e elencos…' : `${html(this.error)} <button id="career-retry" class="secondary-button">Tentar novamente</button>`}</section>` : `
      <div class="career-filters card"><label>País<select id="career-country"><option value="all">Todos os países</option>${this.database.countries.map(c=>`<option value="${html(c.code)}" ${c.code === this.country ? 'selected' : ''}>${html(c.name)}</option>`).join('')}</select></label>
      <label>Campeonato<select id="career-league"><option value="all">Todas as divisões</option>${this.database.leagues.filter(l=>this.country==='all'||l.country===this.country).map(l=>`<option value="${html(l.id)}" ${this.leagueId===l.id?'selected':''}>${html(l.name)} · ${html(l.season)}</option>`).join('')}</select></label>
      <label>Buscar clube<input id="career-query" type="search" placeholder="Ex.: Flamengo, Real Madrid…" value="${html(this.query)}"></label></div>
      <div class="career-layout"><section><p id="career-count" class="view-note" role="status"></p><div id="career-clubs" class="career-clubs"></div></section><aside id="career-choice" class="card career-choice" aria-live="polite"></aside></div>
      <details class="career-rules"><summary>Sobre as ligas e os dados desta carreira</summary><p>As divisões usam os participantes de 2026 ou 2026/27. Nas ligas incompletas, jogam somente os clubes presentes no pacote. Todos os campeonatos usam turno e returno; acesso, rebaixamento e premiações por colocação são processados ao fim da temporada. Grupos e mata-mata não são simulados.</p><p>Elencos do pacote MKFP 02-09-26. O arquivo original não contém geral individual. As notas usam uma escala global estimada por força do clube, contexto da liga, idade e papel no elenco, com referências individuais revisadas. Não são avaliações oficiais.</p><p>${this.database.clubs.length} clubes · ${this.database.countries.length} países · ${this.database.leagues.filter(l=>l.playable).length} ligas jogáveis. O Manthiqueira está no mercado, mas sua divisão precisa de mais clubes para uma carreira.</p></details>`}</section>`;
    if (this.database) { this.content.querySelector('#career-country').value = this.country; this.renderClubs(); this.renderChoice(); }
  }
  renderClubs() {
    const clubs = filterCareerClubs(this.database, this);
    this.content.querySelector('#career-count').textContent = `${clubs.length} ${clubs.length === 1 ? 'clube encontrado' : 'clubes encontrados'}`;
    this.content.querySelector('#career-clubs').innerHTML = clubs.length ? clubs.map(c=>{
      const league=this.database.leagues.find(l=>l.clubIds.includes(c.id));
      return `<button class="career-club ${this.selected===c.id?'selected':''}" data-career-club="${html(c.id)}" aria-pressed="${this.selected===c.id}"><span class="career-badge">${badgeContent(c)}</span><span><strong>${html(c.name)}</strong><small>${html(league.name)}</small><small>${c.squad.length} jogadores · Geral ${Math.round(c.squad.reduce((n,p)=>n+p.overall,0)/c.squad.length)}</small></span><span class="career-arrow">${this.selected===c.id?'✓':'→'}</span></button>`;
    }).join('') : '<p>Nenhum clube encontrado. Altere os filtros.</p>';
  }
  renderChoice() {
    const target=this.content.querySelector('#career-choice');
    const club=this.database.clubs.find(c=>c.id===this.selected);
    if (!club) { target.innerHTML='<p class="eyebrow">Seu próximo desafio</p><h3>Qual escudo você vai defender?</h3><p>Selecione um clube para conhecer seu elenco e campeonato.</p>'; return; }
    const league=this.database.leagues.find(l=>l.clubIds.includes(club.id));
    target.innerHTML=`<span class="career-badge large">${badgeContent(club)}</span><p class="eyebrow">${html(league.season)} · ${html(club.country)}</p><h3>${html(club.name)}</h3><p>${html(club.stadium.name)}</p>
      <div class="career-facts"><div><small>Campeonato</small><strong>${html(league.name)}</strong></div><div><small>Caixa inicial</small><strong>${formatMoney(club.budget)}</strong></div><div><small>Participantes na base</small><strong>${league.clubIds.length} de ${league.expectedClubs}</strong></div></div>
      <p class="view-note">${league.partial ? 'Base parcial: faltam clubes desta divisão. ' : 'Participantes completos. '}Turno e returno, com acesso, rebaixamento e premiação quando houver divisões adjacentes disponíveis.</p>
      <details><summary>Ver elenco · ${club.squad.length} jogadores</summary><div class="career-roster"><table class="mini-table"><thead><tr><th>Pos.</th><th>Jogador</th><th>Idade</th><th>Geral*</th></tr></thead><tbody>${club.squad.map(p=>`<tr><td>${p.position}</td><td>${html(p.name)}</td><td>${p.age}</td><td>${p.overall}</td></tr>`).join('')}</tbody></table></div><small>* Geral estimado na escala global do Footcore.</small></details>
      ${!league.playable?'<p>Faltam adversários desta divisão no pacote. Este clube participa do mercado das outras carreiras.</p>':''}
      <button id="career-start" class="primary-button" ${this.busy||!league.playable?'disabled':''}>${this.busy?'Preparando sua carreira…':'Comandar este clube →'}</button>
      ${this.error?`<p class="save-error" role="alert">${html(this.error)}</p>`:''}`;
  }
}
