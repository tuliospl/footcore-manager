// Footcore design estimates, not ratings or transfer valuations recovered from M26.
import { expectedPerformanceRating } from './player-impact.js';

export const BALANCE_VERSION = 6;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const countryAdjustment = { ENG: 0, ESP: 0, DEU: 0, ITA: 0, FRA: 0, PRT: -3, NLD: -3, BRA: -5, ARG: -6, RUS: -5, TUR: -5, MEX: -6, SAU: -6, USA: -7, JPN: -7, COL: -8, PRY: -9, URY: -8 };
// Editorial anchors on one global scale. Club names identify the source record only;
// moving a player never changes his rating. CSV ratings explicitly supplied win.
const anchors = new Map();
const anchor = (club, rows) => rows.forEach(([name, overall, potential = overall]) => anchors.set(normalize(`${club}:${name}`), { overall, potential }));
anchor('Bayern', [
  ['Jonas Urbig',77,85], ['Leon Klanac',62,78], ['Manuel Neuer',84], ['Sven Ulreich',70],
  ['Alphonso Davies',84,87], ['Josip Stanisic',80,83], ['Konrad Laimer',83], ['Nathaniel Brown',78,85], ['Sacha Boey',77,80],
  ['Dayot Upamecano',85,87], ['Hiroki Ito',79,81], ['Jonathan Tah',85], ['Min-jae Kim',83], ['Tarek Buchmann',65,80],
  ['Aleksandar Pavlovic',82,89], ['Joshua Kimmich',88], ['Santos Daiber',61,78], ['Bara Sapoko Ndiaye',63,80],
  ['Ismael Saibari',81,85], ['Jamal Musiala',89,93], ['Lennart Karl',77,89], ['Tom Bischof',76,86],
  ['Luis Díaz',87], ['Michael Olise',88,92], ['Harry Kane',90], ['Serge Gnabry',82]
]);
anchor('Flamengo', [
  ['Arrascaeta',82], ['Pedro',81], ['Lucas Paquetá',80], ['Jorginho',79],
  ['Samuel Lino',78,80], ['Léo Ortiz',78], ['Danilo',76], ['Bruno Henrique',75]
]);
anchor('Palmeiras', [
  ['Jhon Arias',82], ['Gustavo Gómez',81], ['Vitor Roque',80,85], ['Andreas Pereira',79],
  ['Flaco López',79,81], ['Marlon Freitas',78], ['Joaquín Piquerez',78], ['Murilo',77],
  ['Agustín Giay',77,83], ['Khellven',76,79], ['Carlos Miguel',76]
]);
anchor('Inter Miami', [
  ['Lionel Messi',86], ['Rodrigo De Paul',84], ['Casemiro',80], ['Luis Suárez',79]
]);
anchor('Al-Nassr', [
  ['Cristiano Ronaldo',85], ['Iñigo Martínez',85], ['Sadio Mané',83], ['Kingsley Coman',83],
  ['João Félix',80,82], ['Bento',78]
]);
anchor('Real Madrid', [['Kylian Mbappé',92,94], ['Vinicius Junior',90,93], ['Jude Bellingham',90,94], ['Federico Valverde',89,91], ['Thibaut Courtois',89], ['Endrick',78,90]]);
anchor('Manchester City', [['Erling Haaland',92,94], ['Phil Foden',88,91], ['Gianluigi Donnarumma',89,91]]);
anchor('Barcelona', [['Lamine Yamal',92,95], ['Pedri',90,94], ['Raphinha',89], ['Rodri',89]]);
anchor('Paris Saint-Germain', [['Ousmane Dembélé',91], ['Vitinha',89,92], ['Achraf Hakimi',88,90], ['João Neves',87,93], ['Désiré Doué',85,93]]);

export function estimatePlayer({ name, clubName, country, strength, age, position, star, starter, extra = 0 }) {
  const reviewed = anchors.get(normalize(`${clubName}:${name}`));
  if (reviewed) return { ...reviewed, method: 'reviewed' };
  let hash = 2166136261;
  for (const ch of normalize(name)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const variation = (hash >>> 0) % 5 - 2;
  const youth = Math.max(0, 22 - age) * (starter || star ? 0.5 : 1.5);
  const decline = Math.max(0, age - (position === 'GOL' ? 35 : 31)) * 0.8;
  const role = star ? (starter ? 3 : 2) : starter ? 0 : -5;
  const contextualOverall = Math.round(45 + strength * 0.4 + (countryAdjustment[country] ?? -6) + role + variation - youth - decline);
  const globalStarFloor = star ? 74 + Math.round(extra * 1.5) : 35;
  const overall = clamp(Math.max(contextualOverall, globalStarFloor), 35, 89);
  const growth = age <= 20 ? 8 + ((hash >>> 0) % 5) : age <= 23 ? 5 : age <= 26 ? 2 : 0;
  return { overall, potential: clamp(overall + growth, overall, 93), method: 'estimated' };
}

export function playerValue(player) {
  const { age, overall, potential } = player;
  const ageFactor = age <= 21 ? 1.25 : age <= 25 ? 1.15 : age <= 28 ? 1 : age <= 31 ? 0.82 : Math.max(0.08, 0.7 * 0.8 ** (age - 32));
  const upside = age <= 26 ? 1 + Math.max(0, potential - overall) * 0.06 : 1;
  const evidence = Math.min(1, (player.ratedMatches ?? 0) / 10);
  const average = player.ratedMatches > 0 ? (player.ratingTotal ?? 0) / player.ratedMatches : null;
  const ratingFactor = average == null ? 1 : clamp(1 + (average - expectedPerformanceRating(player)) * 0.16 * evidence, 0.78, 1.35);
  const formFactor = 1 + (clamp(player.form ?? 65, 20, 99) - 65) * 0.0025 * evidence;
  return Math.max(10_000, Math.round(3_000_000 * Math.exp((overall - 65) * 0.17) * ageFactor * upside * ratingFactor * formFactor / 1000) * 1000);
}

export function needsBalanceMigration(game) {
  return !!game && (game.leagues || !game.databaseName) && (game.balanceVersion ?? 0) < BALANCE_VERSION;
}

export function migratePlayerBalance(game, database) {
  if (!needsBalanceMigration(game) || game.activeMatch) return false;
  if (game.leagues && !database) throw new Error('A base atualizada é necessária para recalibrar esta carreira.');
  const reference = new Map((database?.clubs || []).flatMap(c => c.squad.map(p => [`db-${p.id}`, p])));
  for (const player of [...game.clubs.flatMap(c => c.squad), ...game.market]) {
    const base = reference.get(player.id);
    if (base?.calibration) {
      // Preserve earned development, identity, transfers, age, loans and match history.
      const previous = player.calibration;
      const overallDelta = previous?.baseOverall !== undefined
        ? player.overall - previous.baseOverall
        : previous
          ? (player.progression?.overallGained ?? 0) - (player.progression?.overallLost ?? 0)
          : Math.max(0, player.overall - base.calibration.legacyOverall);
      const potentialDelta = previous?.basePotential !== undefined
        ? player.potential - previous.basePotential
        : previous
          ? (player.progression?.potentialGained ?? 0) - (player.progression?.potentialLost ?? 0)
          : Math.max(0, player.potential - base.calibration.legacyPotential);
      player.overall = clamp(base.overall + overallDelta, 1, 99);
      player.potential = clamp(Math.max(player.overall, base.potential + potentialDelta), 1, 99);
      if (player.progression?.season === game.season) {
        player.progression.startOverall = player.overall - ((player.progression.overallGained ?? 0) - (player.progression.overallLost ?? 0));
        player.progression.startPotential = player.potential - ((player.progression.potentialGained ?? 0) - (player.progression.potentialLost ?? 0));
      }
      player.calibration = { ...base.calibration };
    }
    // Explicitly priced external databases are not migrated; world M26 values were estimates.
    const ratio = player.value > 0 && player.askingPrice !== undefined ? player.askingPrice / player.value : 1;
    player.value = playerValue(player);
    if (player.askingPrice !== undefined) player.askingPrice = Math.round(player.value * ratio / 1000) * 1000;
  }
  game.balanceVersion = BALANCE_VERSION;
  game.news.unshift({ id: 'balance-v6', type: 'info', title: 'Estrelas agora têm nível global', body: 'Atletas marcados como estrelas mantêm um patamar mínimo de qualidade independentemente da liga. A atualização também corrige acúmulos indevidos de recalibrações anteriores sem apagar resultados ou transferências.' });
  return true;
}
