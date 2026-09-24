import { escapeHtml } from "./html.js";
import { getClub } from "./core.js";
import { matchPlayerRating } from "./match.js";
import { playerMatchStats, formatRating } from "./ratings.js";

export function renderPenaltyDialog(game) {
  const match = game.activeMatch;
  if (match?.phase !== "penalty" || match.pendingPenalty?.clubId !== game.userClubId) return "";
  const club = getClub(game, game.userClubId);
  const team = match.teams[club.id];
  const players = team.onField.map(id => club.squad.find(player => player.id === id))
    .sort((a, b) => matchPlayerRating(game, club.id, b).overall - matchPlayerRating(game, club.id, a).overall);
  const selected = players.find(player => player.id === team.takerId) || players[0];
  return `<form id="penalty-form"><header class="penalty-heading"><span class="penalty-ball" aria-hidden="true">⚽</span><div><p class="eyebrow">${match.minute}′ · ${escapeHtml(club.name)}</p><h2 id="penalty-title">Pênalti a seu favor!</h2><p id="penalty-description">Escolha o cobrador e bata aqui mesmo.</p></div></header>
    <div class="penalty-column-head" aria-hidden="true"><span></span><span>Pos.</span><span>Jogador</span><span>Geral</span><span>Energia</span><span>Nota</span></div>
    <fieldset class="penalty-players"><legend class="sr-only">Jogadores disponíveis para cobrar</legend>${players.map(player => {
      const rating = matchPlayerRating(game, club.id, player);
      return `<label class="penalty-player"><input type="radio" name="penalty-taker" value="${player.id}" ${player.id === selected.id ? "checked" : ""} required aria-label="${escapeHtml(player.name)}, ${player.position}, geral ${rating.overall}"><span class="penalty-position">${player.position}</span><strong>${escapeHtml(player.name)}</strong><span>${rating.overall}</span><span>${Math.round(team.energy[player.id])}%</span><span>${formatRating(playerMatchStats(match, club.id, player).rating)}</span></label>`;
    }).join("")}</fieldset>
    <footer class="penalty-footer"><span>A rodada aguarda sua cobrança.</span><button type="submit" class="primary-button" id="take-penalty-button">Cobrar com ${escapeHtml(selected.name)}</button><button type="button" class="text-button" data-close-penalty>Voltar à rodada</button></footer></form>`;
}
