import { assistRatingWeight, goalRatingWeight, keyPassRatingWeight, preAssistRatingWeight, tackleRatingWeight } from "./player-impact.js";

const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
export const averageRating = player => player.ratedMatches > 0 ? player.ratingTotal / player.ratedMatches : null;
export const formatRating = rating => rating == null ? "—" : rating.toFixed(1).replace(".", ",");

export function playerMatchStats(match, clubId, player) {
  const team = match.teams[clubId];
  const events = match.events;
  const entry = events.find(event => event.type === "substitution" && event.inId === player.id)?.minute ?? 0;
  const exit = events.find(event => (event.type === "substitution" && event.outId === player.id) || (event.type === "red" && event.playerId === player.id))?.minute ?? match.minute;
  const minutes = team.minutes?.[player.id] ?? (team.participants.includes(player.id) ? Math.max(0, exit - entry) : 0);
  const goals = events.filter(event => (event.type === "goal" || !event.type) && event.scorerId === player.id).length;
  const assists = events.filter(event => (event.type === "goal" || !event.type) && event.assisterId === player.id).length;
  const preAssists = events.filter(event => (event.type === "goal" || !event.type) && event.preAssisterId === player.id).length;
  const tackles = events.filter(event => event.type === "tackle" && event.playerId === player.id && event.minute > entry && event.minute <= exit).length;
  const keyPasses = events.filter(event => event.type === "key-pass" && event.playerId === player.id && event.minute > entry && event.minute <= exit).length;
  const yellows = events.filter(event => event.type === "yellow" && event.playerId === player.id).length;
  const red = team.sentOff.includes(player.id);
  const conceded = events.filter(event => (event.type === "goal" || !event.type) && event.clubId !== clubId && event.minute > entry && event.minute <= exit).length;
  const missedPenalties = events.filter(event => event.type === "penalty-miss" && event.playerId === player.id).length;
  const shots = events.filter(event => event.type === "shot" && event.playerId === player.id).length;
  const saves = events.filter(event => event.keeperId === player.id && event.saved && event.minute > entry && event.minute <= exit).length;
  const penaltySaves = events.filter(event => event.type === "penalty-miss" && event.keeperId === player.id && event.saved && event.minute > entry && event.minute <= exit).length;
  const cleanSheet = minutes >= 60 && conceded === 0;
  const defender = ["GOL", "ZAG", "LAT"].includes(player.position);
  const tacticalContribution = Math.min(tackles * tackleRatingWeight(player.position) + keyPasses * keyPassRatingWeight(player.position), 0.9);
  const score = 6 + Math.min(saves * 0.12, 0.8) + penaltySaves * 0.8 + goals * goalRatingWeight(player.position) + assists * assistRatingWeight(player.position)
    + preAssists * preAssistRatingWeight(player.position) + tacticalContribution + Math.min(shots * 0.04, 0.3)
    - yellows * 0.25 - (red ? 1 : 0) - missedPenalties * 0.8 - conceded * (defender ? 0.25 : 0.08)
    + (cleanSheet ? defender ? 0.6 : 0.2 : 0);
  const rating = minutes > 0 ? Math.round(clamp(score, 1, 10) * 10) / 10 : null;
  return { id: player.id, name: player.name, position: player.position, overall: player.overall, minutes, rating, goals, assists, preAssists, tackles, keyPasses, yellows, red, conceded, cleanSheet, saves, penaltySaves, energy: Math.round(team.energy[player.id]), status: red ? "Expulso" : team.replaced.includes(player.id) ? "Substituído" : team.onField.includes(player.id) ? "Em campo" : "Reserva" };
}

export function matchReport(game, match) {
  if (match.playerReports) return match;
  const playerReports = Object.fromEntries(Object.entries(match.teams).map(([clubId, team]) => [clubId,
    game.clubs.find(club => club.id === clubId).squad.map(player => playerMatchStats(match, clubId, player))
      .sort((a, b) => Number(team.onField.includes(b.id)) - Number(team.onField.includes(a.id)) || ["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"].indexOf(a.position) - ["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"].indexOf(b.position) || b.minutes - a.minutes)
  ]));
  return { homeId: match.homeId, awayId: match.awayId, homeGoals: match.homeGoals, awayGoals: match.awayGoals, events: match.events, minute: match.minute, phase: match.phase, playerReports,
    shots: Object.fromEntries(Object.entries(match.teams).map(([id, team]) => [id, team.shots])), formations: Object.fromEntries(Object.entries(match.teams).map(([id, team]) => [id, team.formation])) };
}

export function recordPlayerRating(player, rating) {
  if (rating == null) return;
  player.ratingTotal = Math.round(((player.ratingTotal ?? 0) + rating) * 10) / 10;
  player.ratedMatches = (player.ratedMatches ?? 0) + 1;
}
