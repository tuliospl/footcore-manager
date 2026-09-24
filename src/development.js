import { playerValue } from './player-balance.js';
import { expectedPerformanceRating } from './player-impact.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const round = n => Math.round(n * 10000) / 10000;

function stateFor(player, season) {
  if (!player.progression || player.progression.season !== season) {
    const previous = player.progression;
    player.progression = {
      season, startOverall: player.overall, startPotential: player.potential,
      overallProgress: previous?.overallProgress ?? 0,
      potentialProgress: previous?.potentialProgress ?? 0,
      minutes: 0, matches: 0, cleanSheets: 0, conceded: 0, saves: 0, penaltySaves: 0,
      tackles: 0, keyPasses: 0, preAssists: 0,
      overallGained: 0, overallLost: 0, potentialGained: 0, potentialLost: 0,
      lastMatch: null, lastSignal: 0
    };
  }
  return player.progression;
}

// Match ratings already include goals, assists, cards and defensive work.
// This extra positional component gives sustained defensive results their own weight.
export function performanceSignal(player, stats) {
  const defensive = ['GOL', 'ZAG', 'LAT'].includes(player.position);
  let signal = stats.rating - expectedPerformanceRating(player);
  if (defensive) {
    signal += stats.cleanSheet ? 0.3 : 0;
    signal -= Math.max(0, (stats.conceded ?? 0) - 1) * 0.12;
  }
  if (player.position === 'GOL') signal += (stats.penaltySaves ?? 0) * 0.45;
  return clamp(signal, -2.5, 2.5);
}

function applyProgress(player, state, key, progressKey, maxGain, maxLoss) {
  const gained = `${key}Gained`, lost = `${key}Lost`;
  while (state[progressKey] >= 1 && state[gained] < maxGain && player[key] < (key === 'overall' ? player.potential : 99)) {
    player[key]++; state[gained]++; state[progressKey] -= 1;
  }
  while (state[progressKey] <= -1 && state[lost] < maxLoss && player[key] > (key === 'potential' ? player.overall : 1)) {
    player[key]--; state[lost]++; state[progressKey] += 1;
  }
  // Never stockpile several points behind a ceiling or a seasonal limit.
  state[progressKey] = round(clamp(state[progressKey], -0.99, 0.99));
}

export function developPlayer(player, stats, season, matchKey) {
  if (!stats || stats.minutes <= 0 || stats.rating == null) return;
  const state = stateFor(player, season);
  if (state.lastMatch === matchKey) return;
  state.lastMatch = matchKey;
  state.matches++;
  state.minutes += stats.minutes;
  for (const key of ['cleanSheets', 'conceded', 'saves', 'penaltySaves', 'tackles', 'keyPasses', 'preAssists']) {
    state[key] += key === 'cleanSheets' ? Number(!!stats.cleanSheet) : stats[key] ?? 0;
  }
  const exposure = clamp(stats.minutes / 90, 0, 1);
  const signal = performanceSignal(player, stats);
  state.lastSignal = round(signal);
  const ageFactor = player.age <= 21 ? 1.25 : player.age <= 23 ? 1.1 : player.age <= 28 ? 0.8 : 0.5;
  const eliteFactor = player.overall >= 90 ? 0.6 : player.overall >= 85 ? 0.8 : 1;
  const training = signal >= -0.25 ? player.age <= 21 ? 0.075 : player.age <= 23 ? 0.06 : player.age <= 28 && signal >= 0.45 ? 0.015 : 0 : 0;
  state.overallProgress += exposure * (signal * (signal > 0 ? 0.22 * ageFactor * eliteFactor : 0.1) + training);
  state.potentialProgress += exposure * signal * (signal > 0 ? 0.17 * ageFactor * (player.potential >= 90 ? 0.65 : 1) : 0.1);
  // At least five complete matches of evidence before revising potential.
  if (state.minutes >= 450) applyProgress(player, state, 'potential', 'potentialProgress', 3, 4);
  else state.potentialProgress = round(clamp(state.potentialProgress, -0.99, 0.99));
  applyProgress(player, state, 'overall', 'overallProgress', 4, 4);
  // Overall may have declined this match, opening room for a potential downgrade.
  if (state.minutes >= 450) applyProgress(player, state, 'potential', 'potentialProgress', 3, 4);
  player.potential = clamp(player.potential, player.overall, 99);
  player.development = Math.max(0, state.overallProgress);
  const formWeight = 0.2 * exposure;
  player.form = clamp(Math.round((player.form ?? 65) * (1 - formWeight) + stats.rating * 10 * formWeight), 20, 99);
  player.value = playerValue(player);
}

export function agePlayer(player, season) {
  const state = stateFor(player, season);
  if (state.aged) return;
  state.aged = true;
  player.age++;
  const onset = player.position === 'GOL' ? 35 : ['ZAG', 'VOL'].includes(player.position) ? 33 : 31;
  const decline = player.age > onset ? Math.min(4, 0.6 + (player.age - onset) * 0.35) : 0;
  player.ageDecline = (player.ageDecline ?? 0) + decline;
  const loss = Math.min(player.overall - 1, Math.floor(player.ageDecline));
  player.ageDecline = round(player.ageDecline - Math.floor(player.ageDecline));
  player.overall -= loss;
  player.potential = Math.max(player.overall, player.potential - loss);
  state.ageLoss = loss;
  player.value = playerValue(player);
}

export function developmentLabel(player, season) {
  const state = player.progression;
  if (!state || state.season !== season) return 'Evolução: aguardando partidas avaliadas';
  const signed = n => n > 0 ? `+${n}` : `${n}`;
  const progress = state.overallProgress >= 0
    ? `${Math.round(state.overallProgress * 100)}% para o próximo ponto`
    : `${Math.round(Math.abs(state.overallProgress) * 100)}% de tendência de queda`;
  return `Temporada: geral ${signed(player.overall - state.startOverall)} · ${progress} · potencial ${signed(player.potential - state.startPotential)}`;
}
