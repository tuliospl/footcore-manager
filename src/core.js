import { developPlayer, agePlayer } from "./development.js";
import { ensureLineup } from "./lineup.js";
import { positionalRating } from "./tactics.js";
import { ensureContracts, expireContracts, freeAgentFee, recruitFreeAgents } from "./contracts.js";
import { marketFilterError } from "./market-filters.js";
import { playerValue, BALANCE_VERSION } from "./player-balance.js";
import { attackingWeight, creativeWeight, defensiveWeight, weightedPlayer } from "./player-impact.js";
import { matchReport, recordPlayerRating } from "./ratings.js";
import { formationPositions } from "./tactics.js";
import { validateDatabase } from "./database.js";
import { ensureYouthAcademy, advanceYouthAcademy, ageYouthAcademy } from "./youth-academy.js";
import { MARKING_STYLES, markingStyle } from "./marking.js";
import { ensureSeasonTracking, playerValueChanges, recordSeasonFinance, seasonFinanceSummary } from "./season-tracking.js";
import { ensureSponsorships, finishSponsorshipSeason, processSponsorshipRound, startSponsorshipSeason } from "./sponsorships.js";
import { applyDivisionFanImpact, ensureFanbases, processFanRound, recordPlayerArrival, recordPlayerDeparture, settleFanSeason, startFanSeason } from "./fans.js";
import { ensureStadiumOperations, medicalInjuryRisk, medicalRecoveryReduction, processStadiumRound, stadiumExpansionQuote, stadiumRevenueProjection, startStadiumProject } from "./stadium.js";
import { completeCompetitionRound, competitionTeam, ensureParallelCompetitions, pendingCompetitionFixture, processCompetitionCalendar } from "./competitions.js";
import { leagueCalendarProfile } from "./calendar.js";

const FIRST_NAMES = ["Caio", "Davi", "Enzo", "Felipe", "Gabriel", "Hugo", "João", "Léo", "Lucas", "Mateus", "Rafael", "Vitor"];
const LAST_NAMES = ["Almeida", "Barbosa", "Costa", "Dias", "Ferreira", "Gomes", "Lima", "Mendes", "Nunes", "Oliveira", "Rocha", "Silva"];
const POSITIONS = ["GOL", "ZAG", "ZAG", "LAT", "LAT", "VOL", "MC", "MC", "MC", "ATA", "ATA", "GOL", "ZAG", "MC", "MC", "ATA"];
const CLUB_DATA = [
  ["Aurora FC", "AUR", "#ffd43b", "#151b2b"],
  ["Atlético da Serra", "SER", "#ef4444", "#171717"],
  ["União Portuária", "POR", "#38bdf8", "#f8fafc"],
  ["Real Cerrado", "CER", "#22c55e", "#fefce8"],
  ["Estrela do Sul", "EST", "#a855f7", "#f5f3ff"],
  ["Ferroviário Central", "FER", "#f97316", "#111827"],
  ["Nacional do Vale", "NAV", "#2563eb", "#ffffff"],
  ["Grêmio Imperial", "IMP", "#eab308", "#7f1d1d"]
];

export function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createPlayer(random, index, quality = 64, position = POSITIONS[index % POSITIONS.length]) {
  const age = 18 + Math.floor(random() * 17);
  const overall = clamp(Math.round(quality + random() * 12 - 5 - Math.max(0, age - 30) * 0.4), 48, 83);
  const potential = clamp(overall + Math.floor(random() * (age < 24 ? 15 : 6)), overall, 90);
  const player = {
    id: `p-${index}-${Math.floor(random() * 1e7)}`,
    name: `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`,
    position,
    age,
    overall,
    potential,
    form: 60 + Math.floor(random() * 21),
    morale: 65 + Math.floor(random() * 21),
    salary: Math.round((overall ** 2 * 1.8) / 100) * 100,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    yellowCardAccumulation: 0,
    redCards: 0,
    suspensionMatches: 0,
    suspensionReason: null,
    injuryMatches: 0,
    injuryLabel: null,
    appearances: 0,
    ratingTotal: 0,
    ratedMatches: 0,
    development: 0
  };
  player.value = playerValue(player);
  return player;
}

function createClub(random, data, clubIndex) {
  const quality = 59 + clubIndex * 1.4 + Math.floor(random() * 5);
  return {
    id: `club-${clubIndex}`,
    name: data[0],
    shortName: data[1],
    colors: [data[2], data[3]],
    budget: 5200000 + Math.floor(random() * 3200000),
    stadium: {
      name: clubIndex === 0 ? "Arena da Aurora" : `Estádio ${data[0].split(" ")[0]}`,
      level: 1,
      capacity: 12000 + Math.floor(random() * 5000),
      ticketPrice: 32
    },
    fanMorale: 65 + Math.floor(random() * 16),
    reputation: 50 + Math.floor(quality / 3),
    tactic: "equilibrado",
    markingIntensity: "moderada",
    squad: Array.from({ length: 16 }, (_, index) => createPlayer(random, clubIndex * 100 + index, quality, POSITIONS[index])),
    history: []
  };
}

export function createSchedule(clubIds) {
  if (clubIds.length < 2) return [];
  const rotation = [...clubIds];
  if (rotation.length % 2) rotation.push(null);
  const rounds = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const matches = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) matches.push(round % 2 === 0 ? { homeId: first, awayId: second } : { homeId: second, awayId: first });
    }
    rounds.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }
  return [...rounds, ...rounds.map(round => round.map(match => ({ homeId: match.awayId, awayId: match.homeId })) )];
}

export function freshTable(clubs) {
  return clubs.map(club => ({ clubId: club.id, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
}

function generateMarket(random, season) {
  return Array.from({ length: 12 }, (_, index) => {
    const player = createPlayer(random, 9000 + season * 100 + index, 58 + Math.floor(random() * 12));
    player.askingPrice = Math.round(player.value * (0.92 + random() * 0.3) / 1000) * 1000;
    return player;
  });
}

export function createGame(seed = Date.now()) {
  const random = mulberry32(seed);
  const clubs = CLUB_DATA.map((data, index) => createClub(random, data, index));
  const game = {
    version: 1,
    balanceVersion: BALANCE_VERSION,
    seed,
    rngState: seed + 701,
    season: 1,
    week: 0,
    userClubId: clubs[0].id,
    clubs,
    schedule: createSchedule(clubs.map(club => club.id)),
    table: freshTable(clubs),
    market: generateMarket(random, 1),
    news: [{ id: "welcome", type: "info", title: "Bem-vindo ao clube", body: "A diretoria espera uma temporada competitiva e contas equilibradas." }],
    lastRound: [],
    finished: false
  };
  ensureCareerManagement(game);
  return game;
}

export function createGameFromDatabase(input, userClubId, seed = Date.now(), world = null) {
  const validation = validateDatabase(input, { world: !!world });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  const database = validation.database;
  if (!database.clubs.some(club => club.id === userClubId)) throw new Error("Escolha um clube da base para comandar.");
  const random = mulberry32(seed);
  const hydratePlayer = (data, index) => {
    const player = { ...createPlayer(random, index), ...data, id: `db-${data.id}` };
    player.value = data.value ?? playerValue(player);
    player.salary = data.salary ?? Math.round((player.overall ** 2 * 1.8) / 100) * 100;
    return player;
  };
  const clubs = database.clubs.map(c => ({ ...c, id: `db-${c.id}`, stadium: { ...c.stadium, level: 1 }, fanMorale: 70, reputation: 70, tactic: "equilibrado", markingIntensity: "moderada", formation: "4-4-2", history: [], squad: c.squad.map(hydratePlayer) }));
  const game = { ...createGame(seed), databaseName: database.name, clubs, userClubId: `db-${userClubId}`, schedule: world ? [] : createSchedule(clubs.map(c => c.id)), table: freshTable(clubs), market: database.freeAgents.map((p, i) => { const player = hydratePlayer(p, i); return { ...player, askingPrice: player.value }; }) };
  if (world) {
    const ids = new Set(clubs.map(c => c.id));
    const used = new Set();
    const leagueIds = new Set();
    game.leagues = world.leagues.map(def => {
      if (!def.id || leagueIds.has(def.id)) throw new Error("Identificador de liga repetido ou inválido.");
      leagueIds.add(def.id);
      const clubIds = def.clubIds.map(id => `db-${id}`);
      if (clubIds.length < 1 || new Set(clubIds).size !== clubIds.length || clubIds.some(id => !ids.has(id) || used.has(id))) throw new Error("Composição de liga inválida.");
      clubIds.forEach(id => used.add(id));
      return { ...def, clubIds, table: freshTable(clubIds.map(id => ({ id }))), schedule: createSchedule(clubIds), week: 0, lastRound: [] };
    });
    if (used.size !== ids.size) throw new Error("Há clubes sem campeonato na base.");
    game.leagueId = game.leagues.find(l => l.clubIds.includes(game.userClubId))?.id;
    if (!game.leagueId || game.leagues.find(l => l.id === game.leagueId).clubIds.length < 2) throw new Error("Seu clube não possui liga.");
    game.worldSeason = 2026;
    bindUserLeague(game);
  }
  ensureCareerManagement(game);
  return game;
}

export function ensureCareerManagement(game) {
  ensureFanbases(game);
  ensureStadiumOperations(game);
  ensureContracts(game);
  ensureYouthAcademy(game);
  ensureSponsorships(game);
  ensureParallelCompetitions(game);
  for (const club of game.clubs) club.markingIntensity = MARKING_STYLES[club.markingIntensity] ? club.markingIntensity : "moderada";
  for (const league of game.leagues || []) league.note = normalizedLeagueNote(league.note);
  if ((game.developmentReferenceVersion ?? 0) < 1) {
    for (const player of [...game.clubs.flatMap(club => club.squad), ...game.market]) {
      const progression = player.progression;
      if (!progression || progression.season !== game.season) continue;
      progression.startOverall = player.overall - ((progression.overallGained ?? 0) - (progression.overallLost ?? 0));
      progression.startPotential = player.potential - ((progression.potentialGained ?? 0) - (progression.potentialLost ?? 0));
    }
    game.developmentReferenceVersion = 1;
  }
  if ((game.managementVersion ?? 0) < 2) {
    // Remove only the former generated pool; never remove players already signed.
    game.market=game.market.filter(player=>player.freeAgentOrigin!=='generated');
    game.managementVersion=2;
  }
  game.incomingOffers ??= [];
  game.outgoingOffers ??= [];
  game.receivedOfferHistory ??= [];
  game.transferDeals ??= [];
  for (const club of game.clubs) for (const player of club.squad) ensureReleaseClause(game, club, player);
  game.managementVersion = Math.max(3, game.managementVersion ?? 0);
  ensureSeasonTracking(game);
}

function transferRoll(key) {
  let result = 2166136261;
  for (const character of String(key)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  result = Math.imul(result ^ result >>> 16, 0x45d9f3b);
  result = Math.imul(result ^ result >>> 16, 0x45d9f3b);
  return ((result ^ result >>> 16) >>> 0) / 4294967296;
}

function clubAverage(club) {
  return club.squad.reduce((total, player) => total + player.overall, 0) / Math.max(1, club.squad.length);
}

function academyGraduateAppearances(game, player) {
  const previousSeasons = (player.seasonHistory || []).filter(entry => entry.season !== game.season).reduce((total, entry) => total + (entry.appearances || 0), 0);
  return previousSeasons + (player.appearances || 0);
}

function academyGraduateCanBeSold(game, player) {
  return !player.academyGraduate || player.age >= 18 || academyGraduateAppearances(game, player) >= 5;
}

function ensureReleaseClause(game, club, player) {
  if (Object.prototype.hasOwnProperty.call(player, "releaseClause") || player.loan) return;
  const key = `${game.seed}:${club.id}:${player.id}:release-clause`;
  if (transferRoll(key) >= 0.38) {
    player.releaseClause = null;
    return;
  }
  const multiplier = 1.8 + transferRoll(`${key}:value`) * 1.2;
  player.releaseClause = Math.ceil(player.value * multiplier / 1000) * 1000;
}

export function bindUserLeague(game) {
  const league = game.leagues?.find(l => l.id === game.leagueId);
  if (league) { game.table = league.table; game.schedule = league.schedule; game.week = league.week; game.lastRound = league.lastRound; }
  return game;
}

export function seasonLabel(game, leagueId = game.leagueId) {
  if (!game.worldSeason) return String(game.season);
  const league = game.leagues.find(l => l.id === leagueId);
  return league?.season?.includes('/') ? `${game.worldSeason}/${String(game.worldSeason + 1).slice(-2)}` : String(game.worldSeason);
}

function normalizedLeagueNote(note = "") {
  return note.replace("Sem grupos, mata-mata, acesso ou rebaixamento nesta versão.", "Acesso e rebaixamento acontecem entre as divisões disponíveis; grupos e mata-mata não são simulados.");
}

export function leagueMovementPlaces(upperLeague, lowerLeague) {
  const size = Math.min(upperLeague?.clubIds?.length ?? 0, lowerLeague?.clubIds?.length ?? 0);
  if (size < 2 || upperLeague.country !== lowerLeague.country || Number(lowerLeague.tier) !== Number(upperLeague.tier) + 1) return 0;
  if (upperLeague.country === "BRA" && size >= 8) return 4;
  return size >= 16 ? 3 : size >= 10 ? 2 : 1;
}

function leaguePrizeProfile(game, league) {
  if (!game || !league?.clubIds?.length) return null;
  const clubProfiles = league.clubIds.map(clubId => {
    const squad = getClub(game, clubId)?.squad || [];
    const strongest = squad.map(player => player.overall).filter(Number.isFinite).sort((first, second) => second - first).slice(0, 18);
    if (!strongest.length) return null;
    const selected = squad.slice().sort((first, second) => second.overall - first.overall).slice(0, 18);
    return {
      qualityRating: strongest.reduce((total, overall) => total + overall, 0) / strongest.length,
      averagePlayerValue: selected.reduce((total, player) => total + (Number(player.value) || 0), 0) / selected.length
    };
  }).filter(Boolean);
  if (!clubProfiles.length) return null;
  return {
    qualityRating: clubProfiles.reduce((total, profile) => total + profile.qualityRating, 0) / clubProfiles.length,
    averagePlayerValue: clubProfiles.reduce((total, profile) => total + profile.averagePlayerValue, 0) / clubProfiles.length
  };
}

export function leaguePrizeMoney(league, position, game = null, suppliedProfile = null) {
  const clubs = league?.clubIds?.length ?? 0;
  if (clubs < 2 || position < 1 || position > clubs) return 0;
  const tierPools = [0, 30_000_000, 12_000_000, 5_000_000, 2_500_000, 1_200_000];
  const profile = suppliedProfile || leaguePrizeProfile(game, league);
  const sizeFactor = Math.sqrt(clubs / 20);
  const reinforcementPlayers = profile ? Math.max(3, 4 + (profile.qualityRating - 50) / 10) : null;
  const dynamicPrize = profile ? profile.averagePlayerValue * reinforcementPlayers * sizeFactor : null;
  const championPrize = dynamicPrize === null
    ? (tierPools[Math.min(5, Math.max(1, Number(league.tier) || 1))] || tierPools[5]) * clamp(clubs / 20, 0.4, 1.2)
    : dynamicPrize;
  const positionFactor = clubs === 1 ? 1 : 1 - ((position - 1) / (clubs - 1)) * 0.75;
  return Math.round(championPrize * positionFactor / 1000) * 1000;
}

export function leagueIndividualAwardMoney(league, type) {
  const base = { topScorer: 2_000_000, topAssister: 1_500_000, bestPlayer: 3_000_000 }[type] || 0;
  const tierFactor = [0, 1, 0.55, 0.3, 0.16, 0.1][Math.min(5, Math.max(1, Number(league?.tier) || 1))];
  return Math.round(base * tierFactor * clamp((league?.clubIds?.length ?? 0) / 20, 0.4, 1.2) / 1000) * 1000;
}

export function leagueAwardWinners(game, leagueId) {
  const league = game.leagues?.find(item => item.id === leagueId) || (!game.leagues && leagueId === "national" ? { id: "national", name: "Liga nacional", tier: 1, clubIds: game.clubs.map(club => club.id), schedule: game.schedule } : null);
  if (!league) return [];
  const entries = league.clubIds.flatMap(clubId => {
    const club = getClub(game, clubId);
    return club.squad.map(player => ({ player, club, average: player.ratedMatches > 0 ? player.ratingTotal / player.ratedMatches : 0 }));
  });
  const compareName = (first, second) => first.player.name.localeCompare(second.player.name, "pt-BR");
  const topScorer = [...entries].sort((first, second) => second.player.goals - first.player.goals || second.player.assists - first.player.assists || second.average - first.average || compareName(first, second))[0];
  const topAssister = [...entries].sort((first, second) => second.player.assists - first.player.assists || second.player.goals - first.player.goals || second.average - first.average || compareName(first, second))[0];
  const minimumRatedMatches = Math.max(3, Math.ceil((league.schedule?.length || 1) * 0.35));
  const rated = entries.filter(entry => entry.player.ratedMatches >= minimumRatedMatches);
  const bestPlayer = [...(rated.length ? rated : entries.filter(entry => entry.player.ratedMatches > 0))].sort((first, second) => second.average - first.average || second.player.ratedMatches - first.player.ratedMatches || second.player.goals - first.player.goals || compareName(first, second))[0];
  return [
    topScorer && { type: "topScorer", label: "Artilheiro da liga", stat: topScorer.player.goals, statLabel: `${topScorer.player.goals} gols`, ...topScorer },
    topAssister && { type: "topAssister", label: "Líder de assistências", stat: topAssister.player.assists, statLabel: `${topAssister.player.assists} assistências`, ...topAssister },
    bestPlayer && { type: "bestPlayer", label: "Melhor jogador da liga", stat: bestPlayer.average, statLabel: `nota média ${bestPlayer.average.toFixed(1).replace(".", ",")}`, ...bestPlayer }
  ].filter(Boolean);
}

export function leagueSeasonRules(game, leagueId) {
  const league = game.leagues?.find(item => item.id === leagueId);
  if (!league) return { promotionPlaces: 0, relegationPlaces: 0, championPrize: 0, lastPrize: 0 };
  const upper = game.leagues.find(item => item.country === league.country && Number(item.tier) === Number(league.tier) - 1 && item.clubIds.length > 1);
  const lower = game.leagues.find(item => item.country === league.country && Number(item.tier) === Number(league.tier) + 1 && item.clubIds.length > 1);
  const prizeProfile = leaguePrizeProfile(game, league);
  return {
    promotionPlaces: upper ? leagueMovementPlaces(upper, league) : 0,
    relegationPlaces: lower ? leagueMovementPlaces(league, lower) : 0,
    qualityRating: prizeProfile?.qualityRating ?? null,
    averagePlayerValue: prizeProfile?.averagePlayerValue ?? null,
    championPrize: leaguePrizeMoney(league, 1, game, prizeProfile),
    lastPrize: leaguePrizeMoney(league, league.clubIds.length, game, prizeProfile)
  };
}

export function getClub(game, clubId) {
  return game.clubs.find(club => club.id === clubId) || game.externalClubs?.find(club => club.id === clubId);
}

export function getUserClub(game) {
  return getClub(game, game.userClubId);
}

export function normalizeMidfieldPositions(game) {
  let changed = false;
  const players = [...(game.clubs || []).flatMap(club => club.squad || []), ...(game.market || [])];
  for (const player of players) {
    if (player.position !== "MEI") continue;
    player.position = "MC";
    changed = true;
  }
  return changed;
}

export function getSortedTable(game, leagueId = game.leagueId) {
  return [...(game.leagues?.find(l => l.id === leagueId)?.table || game.table)].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

export function getLineup(club) {
  if(club.lineup) return ensureLineup(club).slots.map(id=>club.squad.find(p=>p.id===id)).filter(Boolean);
  const available = club.squad.filter(player => !(player.suspensionMatches > 0) && !(player.injuryMatches > 0)).sort((a, b) => b.overall - a.overall);
  const starters = [];
  for (const position of formationPositions(club.formation)) {
    let index = available.findIndex(player => player.position === position);
    if (index < 0) index = available.findIndex(player => player.position !== "GOL");
    if (index < 0) index = 0;
    if (available.length) starters.push(...available.splice(index, 1));
  }
  return starters;
}

export function clubStrength(club) {
  const starters = getLineup(club);
  if (!starters.length) return 35;
  const base = starters.reduce((sum, player) => sum + (club.lineup ? positionalRating(player, formationPositions(club.formation)[club.lineup.slots.indexOf(player.id)]).overall : player.overall) * 0.72 + player.form * 0.18 + player.morale * 0.1, 0) / starters.length;
  const tacticBonus = club.tactic === "ofensivo" ? 0.8 : club.tactic === "defensivo" ? -0.3 : 0.3;
  return base + tacticBonus;
}

function poisson(random, expected) {
  const limit = Math.exp(-expected);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit);
  return count - 1;
}

function pickScorer(random, starters) {
  const candidates = starters.filter(player => player.position !== "GOL");
  return weightedPlayer(random, candidates.length ? candidates : starters, player => attackingWeight(player));
}

function pickAssister(random, starters, scorer) {
  // Some goals come from individual plays or set pieces without an assist.
  if (random() < 0.25) return null;
  const candidates = starters.filter(player => player.id !== scorer.id && player.position !== "GOL");
  return candidates.length ? weightedPlayer(random, candidates, player => creativeWeight(player)) : null;
}

function recordGoal(random, clubId, starters) {
  const scorer = pickScorer(random, starters);
  const assister = pickAssister(random, starters, scorer);
  const preAssisterCandidates = assister ? starters.filter(player => player.id !== scorer.id && player.id !== assister.id && player.position !== "GOL") : [];
  const preAssister = preAssisterCandidates.length && random() < 0.55 ? weightedPlayer(random, preAssisterCandidates, player => creativeWeight(player)) : null;
  scorer.goals += 1;
  if (assister) assister.assists = (assister.assists ?? 0) + 1;
  return { minute: 4 + Math.floor(random() * 87), clubId, scorer: scorer.name, scorerId: scorer.id, assister: assister?.name ?? null, assisterId: assister?.id ?? null, preAssister: preAssister?.name ?? null, preAssisterId: preAssister?.id ?? null };
}

function simulateMatch(game, match, random) {
  const home = getClub(game, match.homeId);
  const away = getClub(game, match.awayId);
  const homeLineup = getLineup(home);
  const awayLineup = getLineup(away);
  const difference = clubStrength(home) + 3.2 - clubStrength(away);
  const homeExpected = clamp(1.3 + difference * 0.045 + (home.tactic === "ofensivo" ? 0.25 : 0) + markingStyle(away).opponentExpectedGoalsAdjustment, 0.25, 3.2);
  const awayExpected = clamp(1.05 - difference * 0.038 + (away.tactic === "ofensivo" ? 0.25 : 0) + markingStyle(home).opponentExpectedGoalsAdjustment, 0.2, 2.9);
  const homeGoals = poisson(random, homeExpected);
  const awayGoals = poisson(random, awayExpected);
  const events = [];
  for (let index = 0; index < homeGoals; index += 1) {
    events.push(recordGoal(random, home.id, homeLineup));
  }
  for (let index = 0; index < awayGoals; index += 1) {
    events.push(recordGoal(random, away.id, awayLineup));
  }
  [...homeLineup, ...awayLineup].forEach(player => { player.appearances += 1; });
  // Off-screen fixtures also supply discipline and goalkeeping evidence.
  for (const [club, lineup, opponents] of [[home, homeLineup, awayLineup], [away, awayLineup, homeLineup]]) {
    const marking = markingStyle(club);
    const keeper = opponents.find(p => p.position === "GOL");
    const shots = 3 + Math.floor(random() * 7);
    for (let i = 0; i < shots; i++) {
      const shooter = pickScorer(random, lineup);
      const saved = !!keeper && random() < 0.45;
      events.push({ type: "shot", minute: 1 + Math.floor(random() * 90), clubId: club.id, playerId: shooter.id, keeperId: saved ? keeper.id : null, saved, message: saved ? `${keeper.name} defende a finalização de ${shooter.name}.` : `${shooter.name} finaliza para fora.` });
    }
    if (random() < 0.1) {
      const shooter = pickScorer(random, lineup);
      const saved = !!keeper && random() < 0.7;
      events.push({ type: "penalty-miss", minute: 1 + Math.floor(random() * 90), clubId: club.id, playerId: shooter.id, keeperId: saved ? keeper.id : null, saved, message: saved ? `${keeper.name} defende o pênalti de ${shooter.name}!` : `${shooter.name} cobra o pênalti para fora!` });
    }
    for (let index = 0, total = Math.round((5 + Math.floor(random() * 7)) * marking.tackleMultiplier); index < total; index++) {
      const player = weightedPlayer(random, lineup.filter(item => item.position !== "GOL"), item => defensiveWeight(item));
      events.push({ type: "tackle", minute: 1 + Math.floor(random() * 90), clubId: club.id, playerId: player.id, hidden: true, message: `${player.name} recupera a bola.` });
    }
    for (let index = 0, total = 2 + Math.floor(random() * 5); index < total; index++) {
      const player = weightedPlayer(random, lineup.filter(item => item.position !== "GOL"), item => creativeWeight(item));
      events.push({ type: "key-pass", minute: 1 + Math.floor(random() * 90), clubId: club.id, playerId: player.id, hidden: true, message: `${player.name} cria uma chance de gol.` });
    }
    for (const player of lineup) {
      if (random() < marking.quickYellowRate) events.push({ type: "yellow", minute: 1 + Math.floor(random() * 90), clubId: club.id, playerId: player.id, message: `Cartão amarelo para ${player.name}.` });
      // Late dismissals preserve the already simulated scoring actions.
      if (player.position !== "GOL" && random() < marking.quickRedRate) {
        const lastAction = Math.max(0, ...events.filter(e => e.playerId === player.id || e.scorerId === player.id || e.assisterId === player.id).map(e => e.minute));
        events.push({ type: "red", minute: Math.max(85, lastAction), clubId: club.id, playerId: player.id, message: `${player.name} recebe cartão vermelho!` });
      }
    }
  }
  events.sort((a, b) => a.minute - b.minute);
  const teams = Object.fromEntries([[home, homeLineup], [away, awayLineup]].map(([club, lineup]) => [club.id, { onField: lineup.map(p => p.id), participants: lineup.map(p => p.id), replaced: [], sentOff: [], minutes: Object.fromEntries(lineup.map(p => [p.id, 90])), energy: Object.fromEntries(club.squad.map(p => [p.id, lineup.includes(p) ? 64 : 100])), shots: events.filter(e => e.clubId === club.id && (!e.type || ["goal", "shot", "penalty-miss"].includes(e.type))).length, formation: club.formation || "4-4-2" }]));
  for (const event of events.filter(e => e.type === "red")) {
    const team = teams[event.clubId];
    team.sentOff.push(event.playerId);
    team.onField = team.onField.filter(id => id !== event.playerId);
    team.minutes[event.playerId] = event.minute;
  }
  const report = matchReport(game, { ...match, homeGoals, awayGoals, events, minute: 90, phase: "finished", teams });
  for (const club of [home, away]) for (const stats of report.playerReports[club.id]) {
    const player = club.squad.find(p => p.id === stats.id);
    recordPlayerRating(player, stats.rating);
    player.yellowCards = (player.yellowCards ?? 0) + stats.yellows;
    player.redCards = (player.redCards ?? 0) + Number(stats.red);
  }
  return report;
}

function updateTable(game, result) {
  const home = game.table.find(row => row.clubId === result.homeId);
  const away = game.table.find(row => row.clubId === result.awayId);
  home.played += 1; away.played += 1;
  home.gf += result.homeGoals; home.ga += result.awayGoals;
  away.gf += result.awayGoals; away.ga += result.homeGoals;
  if (result.homeGoals > result.awayGoals) {
    home.wins += 1; home.points += 3; away.losses += 1;
  } else if (result.homeGoals < result.awayGoals) {
    away.wins += 1; away.points += 3; home.losses += 1;
  } else {
    home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
  }
}

function developSquads(game, results) {
  for (const result of results) {
    const matchKey = `${game.season}:${result.homeId}:${result.awayId}`;
    for (const [clubId, reports] of Object.entries(result.playerReports || {})) {
      const club = getClub(game, clubId);
      for (const stats of reports) {
        const player = club.squad.find(p => p.id === stats.id);
        if (player) developPlayer(player, stats, game.season, matchKey);
      }
    }
  }
}

function processFinances(game, results) {
  game.clubs.forEach(club => {
    const match = results.find(result => result.homeId === club.id || result.awayId === club.id);
    if (!match) return;
    const payroll = club.squad.reduce((sum, player) => sum + player.salary, 0);
    let income = 0;
    let stadiumCommercial = 0;
    if (match?.homeId === club.id) {
      const projection = stadiumRevenueProjection(game, club, true);
      income = projection.gate;
      stadiumCommercial = projection.commercial;
      match.attendance = projection.attendance;
      match.income = projection.total;
      match.stadiumRevenue = projection;
    } else {
      stadiumCommercial = stadiumRevenueProjection(game, club, false).commercial;
    }
    club.budget += income + stadiumCommercial - payroll;
    recordSeasonFinance(game, club.id, "bilheteria", income, "income");
    recordSeasonFinance(game, club.id, "operacoesEstadio", stadiumCommercial, "income");
    recordSeasonFinance(game, club.id, "salarios", payroll, "expense");
  });
  processSponsorshipRound(game, results);
}

function processCompetitionFinances(game, results) {
  for (const result of results) {
    const club = getClub(game, result.homeId);
    if (!club) continue;
    const projection = stadiumRevenueProjection(game, club, true);
    result.attendance = projection.attendance;
    result.income = projection.total;
    result.stadiumRevenue = projection;
    club.budget += projection.total;
    recordSeasonFinance(game, club.id, "bilheteria", projection.gate, "income");
    recordSeasonFinance(game, club.id, "operacoesEstadio", projection.commercial, "income");
  }
}

function applyCompetitionResults(game, results, random) {
  processCompetitionFinances(game, results);
  updateMorale(game, results, random);
  processFanRound(game, results);
  developSquads(game, results);
  updateAvailability(game, results, random);
}

function simulateCompetitionRound(game, competition, fixtures, random) {
  return fixtures.map(fixture => simulateMatch(game, { ...fixture, competitionId: competition.id }, random));
}

function processParallelCalendar(game, random) {
  return processCompetitionCalendar(game, (competition, fixtures) => {
    const results = simulateCompetitionRound(game, competition, fixtures, random);
    applyCompetitionResults(game, results, random);
    return results;
  });
}

function updateMorale(game, results, random) {
  results.forEach(result => {
    const home = getClub(game, result.homeId);
    const away = getClub(game, result.awayId);
    const draw = result.homeGoals === result.awayGoals;
    const homeWon = result.homeGoals > result.awayGoals;
    home.fanMorale = clamp(home.fanMorale + (draw ? 0 : homeWon ? 4 : -5), 0, 100);
    away.fanMorale = clamp(away.fanMorale + (draw ? 1 : homeWon ? -3 : 5), 0, 100);
    home.squad.forEach(player => { player.morale = clamp(player.morale + (draw ? 0 : homeWon ? 2 : -2), 20, 100); });
    away.squad.forEach(player => { player.morale = clamp(player.morale + (draw ? 0 : homeWon ? -2 : 2), 20, 100); });
  });
  if (random() < 0.18) {
    const club = pick(random, game.clubs);
    club.fanMorale = clamp(club.fanMorale + Math.floor(random() * 5) - 2, 0, 100);
  }
}

function buildRoundNews(game, results) {
  const userClub = getUserClub(game);
  const result = results.find(item => item.homeId === userClub.id || item.awayId === userClub.id);
  if (!result) {
    game.news.unshift({ id: `bye-${game.season}-${game.week}`, type: "info", title: "Rodada de folga", body: "Seu clube não jogou nesta rodada. Os demais resultados já foram atualizados." });
    game.news = game.news.slice(0, 200);
    return;
  }
  const home = getClub(game, result.homeId);
  const away = getClub(game, result.awayId);
  const userGoals = result.homeId === userClub.id ? result.homeGoals : result.awayGoals;
  const opponentGoals = result.homeId === userClub.id ? result.awayGoals : result.homeGoals;
  const tone = userGoals > opponentGoals ? "positive" : userGoals < opponentGoals ? "negative" : "info";
  game.news.unshift({
    id: `round-${game.season}-${game.week}`,
    type: tone,
    title: `${home.shortName} ${result.homeGoals} x ${result.awayGoals} ${away.shortName}`,
    body: userGoals > opponentGoals ? "Vitória importante aumenta a confiança do elenco e da torcida." : userGoals < opponentGoals ? "O resultado pressiona o trabalho para a próxima rodada." : "Um ponto conquistado em uma partida equilibrada."
  });
  game.news = game.news.slice(0, 200);
}

function archivePlayerSeason(player, season, label, clubName) {
  player.seasonHistory ??= [];
  if (player.seasonHistory.some(entry => entry.season === season)) return;
  player.seasonHistory.push({
    season,
    label,
    clubName,
    appearances: player.appearances ?? 0,
    goals: player.goals ?? 0,
    assists: player.assists ?? 0,
    yellowCards: player.yellowCards ?? 0,
    redCards: player.redCards ?? 0,
    ratingTotal: player.ratingTotal ?? 0,
    ratedMatches: player.ratedMatches ?? 0
  });
}

function queuePrizePayment(game, clubId, category, amount, description) {
  game.pendingPrizePayments ??= [];
  game.pendingPrizePayments.push({ clubId, category, amount, description, earnedSeason: game.season });
}

function payPendingPrizes(game) {
  const payments = game.pendingPrizePayments || [];
  const userPayments = payments.filter(payment => payment.clubId === game.userClubId);
  for (const payment of payments) {
    const club = getClub(game, payment.clubId);
    if (!club) continue;
    club.budget += payment.amount;
    recordSeasonFinance(game, club.id, payment.category, payment.amount, "income");
  }
  game.pendingPrizePayments = [];
  if (!userPayments.length) return;
  const total = userPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const leagueMoney = userPayments.filter(payment => payment.category === "premiacaoLiga").reduce((sum, payment) => sum + payment.amount, 0);
  const individualMoney = total - leagueMoney;
  const breakdown = [leagueMoney ? `${formatMoney(leagueMoney)} pela colocação` : "", individualMoney ? `${formatMoney(individualMoney)} por prêmios individuais` : ""].filter(Boolean).join(" e ");
  game.news.unshift({ id: `prize-payment-${game.season}-${game.userClubId}`, type: "positive", title: `Premiações recebidas: ${formatMoney(total)}`, body: `${breakdown} foram creditados no caixa no primeiro dia da nova temporada.` });
}

function awardSeasonPrizes(game) {
  const awards = new Map();
  const leagues = game.leagues || [{ id: "national", name: "Liga nacional", country: "", tier: 1, clubIds: game.clubs.map(club => club.id) }];
  for (const league of leagues) {
    if (league.clubIds.length < 2) continue;
    const ranking = getSortedTable(game, game.leagues ? league.id : undefined);
    const prizeProfile = leaguePrizeProfile(game, league);
    ranking.forEach((row, index) => {
      const prize = leaguePrizeMoney(league, index + 1, game, prizeProfile);
      const club = getClub(game, row.clubId);
      queuePrizePayment(game, club.id, "premiacaoLiga", prize, `${index + 1}º lugar em ${league.name}`);
      awards.set(club.id, { prize, position: index + 1, leagueId: league.id, leagueName: league.name });
    });
  }
  game.lastSeasonAwards = { season: game.season, clubs: Object.fromEntries(awards) };
  return awards;
}

function awardIndividualHonors(game) {
  const leagueAwards = [];
  const leagues = game.leagues || [{ id: "national", name: "Liga nacional", tier: 1, clubIds: game.clubs.map(club => club.id), schedule: game.schedule }];
  for (const league of leagues) {
    if (league.clubIds.length < 2) continue;
    const awards = leagueAwardWinners(game, league.id).map(winner => {
      const { player, club } = winner;
      const money = leagueIndividualAwardMoney(league, winner.type);
      const overallBefore = player.overall;
      const potentialBefore = player.potential;
      player.potential = Math.min(99, player.potential + 1);
      player.overall = Math.min(player.potential, player.overall + 1);
      player.value = playerValue(player);
      queuePrizePayment(game, club.id, "premiosIndividuais", money, `${winner.label}: ${player.name}`);
      const record = {
        season: game.season,
        leagueId: league.id,
        leagueName: league.name,
        type: winner.type,
        label: winner.label,
        stat: winner.stat,
        statLabel: winner.statLabel,
        playerId: player.id,
        playerName: player.name,
        clubId: club.id,
        clubName: club.name,
        money,
        overallGain: player.overall - overallBefore,
        potentialGain: player.potential - potentialBefore
      };
      player.awards ??= [];
      player.awards.push(record);
      const history = club.history.find(entry => entry.season === game.season);
      if (history) history.individualAwardsMoney = (history.individualAwardsMoney ?? 0) + money;
      if (club.id === game.userClubId) game.news.unshift({ id: `award-${game.season}-${winner.type}-${player.id}`, type: "positive", title: `${player.name}: ${winner.label}`, body: `${winner.statLabel}. O geral e o potencial do atleta melhoraram; os ${formatMoney(money)} serão pagos no início da próxima temporada.` });
      return record;
    });
    leagueAwards.push({ leagueId: league.id, leagueName: league.name, awards });
  }
  game.lastSeasonPlayerAwards = { season: game.season, leagues: leagueAwards };
  return leagueAwards;
}

export function worldAwardWinners(game) {
  const leagueByClub = new Map((game.leagues || []).flatMap(league => league.clubIds.map(clubId => [clubId, league])));
  const leagueChampionIds = new Set((game.leagues || []).filter(league => league.clubIds.length > 1).map(league => getSortedTable(game, league.id)[0]?.clubId).filter(Boolean));
  const competitionTitles = new Map();
  for (const competition of game.competitions?.items || []) if (competition.finished && competition.season === game.season && competition.championId) competitionTitles.set(competition.championId, (competitionTitles.get(competition.championId) || 0) + 1);
  const entries = game.clubs.flatMap(club => {
    const league = leagueByClub.get(club.id);
    const rounds = league?.schedule?.length || game.schedule?.length || 1;
    const minimumAppearances = Math.max(21, Math.ceil(rounds * 0.7));
    const titleBonus = (leagueChampionIds.has(club.id) ? 0.25 : 0) + (competitionTitles.get(club.id) || 0) * 0.2;
    return club.squad.map(player => {
      const appearances = player.appearances ?? 0;
      const average = player.ratedMatches ? player.ratingTotal / player.ratedMatches : 0;
      const goalsPerGame = (player.goals ?? 0) / Math.max(1, appearances);
      const assistsPerGame = (player.assists ?? 0) / Math.max(1, appearances);
      const progression = player.progression?.season === game.season ? player.progression : {};
      const cleanSheetRate = (progression.cleanSheets ?? 0) / Math.max(1, appearances);
      const savesPerGame = (progression.saves ?? 0) / Math.max(1, appearances);
      const tacklesPerGame = (progression.tackles ?? 0) / Math.max(1, appearances);
      const keyPassesPerGame = (progression.keyPasses ?? 0) / Math.max(1, appearances);
      const preAssistsPerGame = (progression.preAssists ?? 0) / Math.max(1, appearances);
      const common = average + player.overall / 500 + titleBonus;
      let positionalScore = common;
      if (player.position === "GOL") positionalScore += Math.min(0.9, savesPerGame * 0.18) + Math.min(0.8, cleanSheetRate * 1.25) + Math.min(0.6, (progression.penaltySaves ?? 0) * 0.18);
      else if (player.position === "ZAG") positionalScore += Math.min(0.85, tacklesPerGame * 0.16) + Math.min(0.65, cleanSheetRate) + Math.min(0.35, goalsPerGame * 1.8) + Math.min(0.3, assistsPerGame * 1.3);
      else if (player.position === "LAT") positionalScore += Math.min(0.7, tacklesPerGame * 0.13) + Math.min(0.5, cleanSheetRate * 0.75) + Math.min(0.55, assistsPerGame * 1.5) + Math.min(0.35, keyPassesPerGame * 0.1);
      else if (["VOL", "MC"].includes(player.position)) positionalScore += Math.min(0.65, tacklesPerGame * 0.1) + Math.min(0.65, keyPassesPerGame * 0.11) + Math.min(0.45, preAssistsPerGame * 1.5) + Math.min(0.55, assistsPerGame * 1.2) + Math.min(0.45, goalsPerGame);
      else positionalScore += Math.min(1.15, goalsPerGame * 0.95) + Math.min(0.65, assistsPerGame * 0.7) + Math.min(0.25, keyPassesPerGame * 0.06);
      return { player, club, appearances, average, minimumAppearances, titleBonus, goalsPerGame, assistsPerGame, cleanSheetRate, savesPerGame, tacklesPerGame, keyPassesPerGame, preAssistsPerGame, positionalScore, ballonScore: positionalScore };
    });
  });
  const byName = (first, second) => first.player.name.localeCompare(second.player.name, "pt-BR");
  const eligible = entries.filter(entry => entry.player.ratedMatches >= entry.minimumAppearances && entry.appearances >= entry.minimumAppearances);
  const ranked = candidates => [...candidates].sort((first, second) => second.positionalScore - first.positionalScore || second.average - first.average || second.appearances - first.appearances || byName(first, second))[0];
  const ballon = [...eligible].sort((first, second) => second.ballonScore - first.ballonScore || second.average - first.average || second.player.goals - first.player.goals || byName(first, second))[0];
  const boot = [...eligible].sort((first, second) => second.player.goals - first.player.goals || second.goalsPerGame - first.goalsPerGame || second.player.assists - first.player.assists || second.average - first.average || byName(first, second))[0];
  const keeper = ranked(eligible.filter(entry => entry.player.position === "GOL"));
  const fullback = ranked(eligible.filter(entry => entry.player.position === "LAT"));
  const defender = ranked(eligible.filter(entry => entry.player.position === "ZAG"));
  const midfielder = ranked(eligible.filter(entry => ["VOL", "MC"].includes(entry.player.position)));
  const forward = ranked(eligible.filter(entry => entry.player.position === "ATA"));
  const coachCandidates = (game.leagues || []).flatMap(league => {
    const table = getSortedTable(game, league.id);
    const strengthRanking = league.clubIds.map(clubId => getClub(game, clubId)).filter(Boolean).sort((first, second) => clubStrength(second) - clubStrength(first));
    return table.map((row, index) => {
      const club = getClub(game, row.clubId);
      const minimumMatches = Math.max(21, Math.ceil((league.schedule?.length || 1) * 0.7));
      if (!club?.coach || row.played < minimumMatches) return null;
      const expectedPosition = strengthRanking.findIndex(item => item.id === club.id) + 1;
      const overachievement = (expectedPosition - (index + 1)) / Math.max(1, league.clubIds.length - 1);
      const pointsPerGame = row.points / Math.max(1, row.played);
      const goalDifferencePerGame = (row.gf - row.ga) / Math.max(1, row.played);
      const titles = (leagueChampionIds.has(club.id) ? 1 : 0) + (competitionTitles.get(club.id) || 0);
      const coachScore = pointsPerGame * 2 + Math.max(-0.5, Math.min(0.8, goalDifferencePerGame * 0.12)) + overachievement * 1.5 + titles * 0.5 + clubStrength(club) / 500;
      return { coachAward: true, coachName: club.coach, club, appearances: row.played, minimumAppearances: minimumMatches, coachScore, pointsPerGame, overachievement, titles };
    }).filter(Boolean);
  });
  const coach = coachCandidates.sort((first, second) => second.coachScore - first.coachScore || second.titles - first.titles || second.pointsPerGame - first.pointsPerGame || first.coachName.localeCompare(second.coachName, "pt-BR"))[0];
  return [
    ballon && { type: "ballonDor", label: "Bola de Ouro", stat: ballon.ballonScore, statLabel: `nota média ${ballon.average.toFixed(1).replace(".", ",")} · ${ballon.player.goals} gols · ${ballon.player.assists} assistências`, money: 12_000_000, ...ballon },
    boot && { type: "goldenBoot", label: "Chuteira de Ouro", stat: boot.player.goals, statLabel: `${boot.player.goals} gols em ${boot.appearances} jogos`, money: 8_000_000, ...boot },
    keeper && { type: "bestGoalkeeper", label: "Melhor goleiro do mundo", stat: keeper.positionalScore, statLabel: `nota ${keeper.average.toFixed(1).replace(".", ",")} · ${keeper.player.progression?.cleanSheets ?? 0} jogos sem sofrer gols · ${keeper.player.progression?.saves ?? 0} defesas`, money: 5_000_000, ...keeper },
    fullback && { type: "bestFullback", label: "Melhor lateral do mundo", stat: fullback.positionalScore, statLabel: `nota ${fullback.average.toFixed(1).replace(".", ",")} · ${fullback.player.progression?.tackles ?? 0} desarmes · ${fullback.player.assists} assistências`, money: 5_000_000, ...fullback },
    defender && { type: "bestDefender", label: "Melhor zagueiro do mundo", stat: defender.positionalScore, statLabel: `nota ${defender.average.toFixed(1).replace(".", ",")} · ${defender.player.progression?.tackles ?? 0} desarmes · ${defender.player.progression?.cleanSheets ?? 0} jogos sem sofrer gols`, money: 5_000_000, ...defender },
    midfielder && { type: "bestMidfielder", label: "Melhor meio-campista do mundo", stat: midfielder.positionalScore, statLabel: `nota ${midfielder.average.toFixed(1).replace(".", ",")} · ${midfielder.player.assists} assistências · ${midfielder.player.progression?.keyPasses ?? 0} passes decisivos`, money: 5_000_000, ...midfielder },
    forward && { type: "bestForward", label: "Melhor atacante do mundo", stat: forward.positionalScore, statLabel: `nota ${forward.average.toFixed(1).replace(".", ",")} · ${forward.player.goals} gols · ${forward.player.assists} assistências`, money: 5_000_000, ...forward },
    coach && { type: "bestCoach", label: "Melhor técnico do mundo", stat: coach.coachScore, statLabel: `${coach.pointsPerGame.toFixed(2).replace(".", ",")} pontos por jogo · ${coach.titles} título${coach.titles === 1 ? "" : "s"}`, money: 6_000_000, ...coach }
  ].filter(Boolean);
}

function awardWorldHonors(game) {
  const awards = worldAwardWinners(game).map(winner => {
    const { player, club } = winner;
    const overallBefore = player?.overall ?? 0;
    const potentialBefore = player?.potential ?? 0;
    if (player) {
      player.potential = Math.min(99, player.potential + 1);
      player.overall = Math.min(player.potential, player.overall + 1);
      player.value = playerValue(player);
    }
    queuePrizePayment(game, club.id, "premiosIndividuais", winner.money, `${winner.label}: ${player?.name || winner.coachName}`);
    const record = { season: game.season, competitionId: "world-awards", competitionName: "Prêmios mundiais", type: winner.type, label: winner.label, stat: winner.stat, statLabel: winner.statLabel, playerId: player?.id ?? null, playerName: player?.name ?? null, coachName: winner.coachName ?? null, clubId: club.id, clubName: club.name, money: winner.money, overallGain: player ? player.overall - overallBefore : 0, potentialGain: player ? player.potential - potentialBefore : 0 };
    if (player) {
      player.awards ??= [];
      player.awards.push(record);
    }
    const history = club.history.find(entry => entry.season === game.season);
    if (history) history.individualAwardsMoney = (history.individualAwardsMoney ?? 0) + winner.money;
    if (club.id === game.userClubId) game.news.unshift({ id: `world-award-${game.season}-${winner.type}-${player?.id || club.id}`, type: "positive", title: `${player?.name || winner.coachName} venceu: ${winner.label}`, body: `${winner.statLabel}. O prêmio de ${formatMoney(winner.money)} será pago ao clube no início da próxima temporada.` });
    return record;
  });
  game.lastWorldAwards = { season: game.season, awards };
  game.worldAwardHistory ??= [];
  game.worldAwardHistory = [{ season: game.season, awards }, ...game.worldAwardHistory.filter(entry => entry.season !== game.season)].slice(0, 10);
  return awards;
}

function applyPromotionAndRelegation(game) {
  if (!game.leagues) return [];
  const movements = [];
  const previousClubIdsByLeague = Object.fromEntries(game.leagues.map(league => [league.id, [...league.clubIds]]));
  const countries = [...new Set(game.leagues.map(league => league.country))];
  for (const country of countries) {
    const divisions = game.leagues.filter(league => league.country === country && league.clubIds.length > 1).sort((first, second) => Number(first.tier) - Number(second.tier));
    for (let index = 0; index < divisions.length - 1; index++) {
      const upper = divisions[index];
      const lower = divisions[index + 1];
      const places = leagueMovementPlaces(upper, lower);
      if (!places) continue;
      const upperRanking = getSortedTable(game, upper.id);
      const lowerRanking = getSortedTable(game, lower.id);
      const relegated = upperRanking.slice(-places).map(row => row.clubId);
      const promoted = lowerRanking.slice(0, places).map(row => row.clubId);
      movements.push({ country, upperLeagueId: upper.id, upperLeagueName: upper.name, lowerLeagueId: lower.id, lowerLeagueName: lower.name, places, promoted, relegated });
    }
  }
  const compositions = new Map(game.leagues.map(league => [league.id, new Set(league.clubIds)]));
  for (const movement of movements) {
    const upper = compositions.get(movement.upperLeagueId);
    const lower = compositions.get(movement.lowerLeagueId);
    movement.relegated.forEach(id => { upper.delete(id); lower.add(id); });
    movement.promoted.forEach(id => { lower.delete(id); upper.add(id); });
  }
  for (const league of game.leagues) league.clubIds = [...compositions.get(league.id)];
  const previousLeagueId = game.leagueId;
  const nextLeagueId = game.leagues.find(league => league.clubIds.includes(game.userClubId))?.id || game.leagueId;
  game.nextLeagueId = nextLeagueId;
  const ownMovement = movements.find(movement => movement.promoted.includes(game.userClubId) || movement.relegated.includes(game.userClubId));
  if (ownMovement) {
    const promoted = ownMovement.promoted.includes(game.userClubId);
    game.news.unshift({ id: `division-${game.season}-${game.userClubId}`, type: promoted ? "positive" : "negative", title: promoted ? `Acesso para ${ownMovement.upperLeagueName}` : `Rebaixamento para ${ownMovement.lowerLeagueName}`, body: promoted ? `A campanha garantiu a promoção do clube. Na próxima temporada, o desafio será na divisão superior.` : `O clube terminou na zona de rebaixamento e disputará a divisão inferior na próxima temporada.` });
  }
  game.lastSeasonMovements = { season: game.season, previousUserLeagueId: previousLeagueId, currentUserLeagueId: nextLeagueId, movements, previousClubIdsByLeague };
  return movements;
}

function seasonTeamMinimumAppearances(game, league) {
  const rounds = league.schedule?.length ?? game.schedule.length;
  return Math.max(1, Math.ceil(rounds * 0.4));
}

export function seasonTeam(game, leagueId, suppliedClubIds = null) {
  const league = game.leagues?.find(item => item.id === leagueId) || { clubIds: game.clubs.map(club => club.id), schedule: game.schedule };
  const clubIds = suppliedClubIds || league.clubIds;
  const minimumAppearances = seasonTeamMinimumAppearances(game, league);
  const slots = ["GOL", "LAT", "ZAG", "ZAG", "LAT", "VOL", "MC", "MC", "ATA", "ATA", "ATA"];
  const entries = clubIds.flatMap(clubId => {
    const club = getClub(game, clubId);
    return club.squad.filter(player => Math.min(player.appearances ?? 0, player.ratedMatches ?? 0) >= minimumAppearances).map(player => ({
      player,
      club,
      average: player.ratedMatches ? player.ratingTotal / player.ratedMatches : 0
    }));
  });
  const selected = new Set();
  return slots.map(position => {
    const candidates = entries.filter(entry => !selected.has(entry.player.id) && entry.player.position === position);
    const fallback = entries.filter(entry => !selected.has(entry.player.id) && (position === "LAT" || position === "ZAG" ? ["LAT", "ZAG"].includes(entry.player.position) : position === "VOL" || position === "MC" ? ["VOL", "MC"].includes(entry.player.position) : true));
    const entry = [...(candidates.length ? candidates : fallback)].sort((first, second) => second.average - first.average || second.player.ratedMatches - first.player.ratedMatches || second.player.overall - first.player.overall)[0];
    if (!entry) return null;
    selected.add(entry.player.id);
    return { playerId: entry.player.id, playerName: entry.player.name, position, naturalPosition: entry.player.position, clubId: entry.club.id, clubName: entry.club.name, average: entry.average, appearances: entry.player.appearances, goals: entry.player.goals, assists: entry.player.assists ?? 0 };
  }).filter(Boolean);
}

function reportAward(winner) {
  return {
    type: winner.type,
    label: winner.label,
    stat: winner.stat,
    statLabel: winner.statLabel,
    playerId: winner.player.id,
    playerName: winner.player.name,
    clubId: winner.club.id,
    clubName: winner.club.name
  };
}

export function createWorldReport(game, period) {
  const profileId = period === "midyear" ? "cross-year" : "annual";
  const leagues = (game.leagues || []).filter(league => Number(league.tier) === 1 && leagueCalendarProfile(league).id === profileId).map(league => {
    const standings = getSortedTable(game, league.id).map((row, index) => ({ ...row, position: index + 1, clubName: getClub(game, row.clubId).name }));
    return {
      id: league.id,
      type: "league",
      name: league.name,
      country: league.country,
      championId: standings[0]?.clubId || null,
      championName: standings[0]?.clubName || "—",
      standings,
      awards: leagueAwardWinners(game, league.id).map(reportAward),
      team: seasonTeam(game, league.id),
      minimumAppearances: seasonTeamMinimumAppearances(game, league)
    };
  });
  const competitions = (game.competitions?.items || []).filter(competition => competition.finished && (competition.reportPeriod || "endyear") === period).map(competition => ({
    id: competition.id,
    type: "competition",
    name: competition.name,
    championId: competition.championId,
    championName: getClub(game, competition.championId)?.name || "—",
    standings: competition.table ? competitionTableSnapshot(competition.table, game) : [],
    awards: competition.awards || [],
    team: competitionTeam(game, competition),
    minimumAppearances: Math.max(1, Math.ceil(Math.max(0, ...Object.values(competition.playerStats || {}).map(stats => stats.appearances)) * 0.4))
  }));
  const year = game.worldSeason || game.season;
  const ownCalendar = leagueCalendarProfile(game.leagues?.find(league => league.id === game.leagueId));
  const europeanSeason = ownCalendar.id === "annual" ? `${year - 1}/${String(year).slice(-2)}` : `${year}/${String(year + 1).slice(-2)}`;
  const report = {
    id: `${year}-${period}`,
    season: game.season,
    year,
    period,
    label: period === "midyear" ? `Encerramento europeu ${europeanSeason}` : `Encerramento anual ${year}`,
    competitions: [...leagues, ...competitions]
  };
  game.worldReports ??= [];
  game.worldReports = [report, ...game.worldReports.filter(item => item.id !== report.id)].slice(0, 12);
  game.pendingWorldReport = report;
  game.news.unshift({ id: `world-report-${report.id}`, type: "info", title: report.label, body: `${report.competitions.length} competições encerradas estão disponíveis no panorama mundial.` });
  return report;
}

function competitionTableSnapshot(table, game) {
  return [...table].sort((first, second) => second.points - first.points || (second.gf - second.ga) - (first.gf - first.ga) || second.gf - first.gf).map((row, index) => ({ ...row, position: index + 1, clubName: getClub(game, row.clubId)?.name || "Clube" }));
}

function maybeCreateInterimWorldReport(game) {
  if (!game.leagues?.length) return null;
  const ownCalendar = leagueCalendarProfile(game.leagues.find(league => league.id === game.leagueId)).id;
  const period = ownCalendar === "annual" ? "midyear" : "endyear";
  const midpoint = Math.ceil(game.schedule.length * 0.5);
  const reportId = `${game.worldSeason || game.season}-${period}`;
  if (game.week < midpoint || game.worldReports?.some(report => report.id === reportId)) return null;
  return createWorldReport(game, period);
}

function buildSeasonReport(game) {
  const leagueId = game.lastSeasonMovements?.previousUserLeagueId || game.leagueId || "national";
  const league = game.leagues?.find(item => item.id === leagueId);
  const seasonClubIds = game.lastSeasonMovements?.previousClubIdsByLeague?.[leagueId] || league?.clubIds;
  const standings = getSortedTable(game, leagueId).map((row, index) => ({ ...row, position: index + 1, clubName: getClub(game, row.clubId).name }));
  const awards = game.lastSeasonPlayerAwards?.leagues.find(item => item.leagueId === leagueId)?.awards || [];
  const worldAwards = game.lastWorldAwards?.season === game.season ? game.lastWorldAwards.awards : [];
  const movement = game.lastSeasonMovements?.movements.find(item => item.upperLeagueId === leagueId || item.lowerLeagueId === leagueId);
  const promoted = movement?.promoted.map(id => ({ clubId: id, clubName: getClub(game, id).name, from: movement.lowerLeagueName, to: movement.upperLeagueName })) || [];
  const relegated = movement?.relegated.map(id => ({ clubId: id, clubName: getClub(game, id).name, from: movement.upperLeagueName, to: movement.lowerLeagueName })) || [];
  const userRow = standings.find(row => row.clubId === game.userClubId);
  game.seasonReport = {
    season: game.season,
    label: seasonLabel(game, leagueId),
    leagueId,
    leagueName: league?.name || "Liga nacional",
    standings,
    awards,
    worldAwards,
    teamOfSeason: seasonTeam(game, leagueId, seasonClubIds),
    teamOfSeasonMinimumAppearances: seasonTeamMinimumAppearances(game, league || { schedule: game.schedule }),
    promoted,
    relegated,
    club: {
      name: getUserClub(game).name,
      position: userRow?.position ?? 0,
      points: userRow?.points ?? 0,
      wins: userRow?.wins ?? 0,
      draws: userRow?.draws ?? 0,
      losses: userRow?.losses ?? 0,
      goalsFor: userRow?.gf ?? 0,
      goalsAgainst: userRow?.ga ?? 0,
      fanbase: {
        supporters: getUserClub(game).fanbase.supporters,
        start: getUserClub(game).fanbase.seasonStart,
        change: getUserClub(game).fanbase.lastSeasonChange
      },
      finance: seasonFinanceSummary(game, game.userClubId),
      playerChanges: playerValueChanges(game, game.userClubId)
    }
  };
  game.seasonReports ??= [];
  game.seasonReports = [game.seasonReport, ...game.seasonReports.filter(report => report.season !== game.season)].slice(0, 10);
}

function finishSeason(game) {
  const ranking = getSortedTable(game);
  const champion = getClub(game, ranking[0].clubId);
  const awards = awardSeasonPrizes(game);
  game.clubs.forEach(club => {
    const leagueId = game.leagues?.find(l => l.clubIds.includes(club.id))?.id;
    const clubRanking = getSortedTable(game, leagueId);
    const award = awards.get(club.id);
    if (clubRanking.length > 1) club.history.push({ season: game.season, leagueId, leagueName: award?.leagueName, prizeMoney: award?.prize ?? 0, position: clubRanking.findIndex(row => row.clubId === club.id) + 1, ...clubRanking.find(row => row.clubId === club.id) });
    club.squad.forEach(player => { archivePlayerSeason(player, game.season, seasonLabel(game, leagueId), club.name); agePlayer(player, game.season); });
  });
  awardIndividualHonors(game);
  awardWorldHonors(game);
  const ownCalendar = leagueCalendarProfile(game.leagues?.find(league => league.id === game.leagueId));
  createWorldReport(game, ownCalendar.id === "cross-year" ? "midyear" : "endyear");
  settleFanSeason(game);
  finishSponsorshipSeason(game);
  game.news.unshift({ id: `champion-${game.season}`, type: champion.id === game.userClubId ? "positive" : "info", title: `${champion.name} é campeão!`, body: "A temporada terminou. Um novo calendário já está pronto." });
  game.finished = true;
  game.market.forEach(player=>{ archivePlayerSeason(player, game.season, seasonLabel(game), player.previousClub || "Sem clube"); agePlayer(player, game.season); if(player.freeAgentOrigin) player.askingPrice=freeAgentFee(player); });
  ageYouthAcademy(game);
  returnExpiredLoans(game);
  const movements = applyPromotionAndRelegation(game);
  applyDivisionFanImpact(game, movements);
  buildSeasonReport(game);
  if (game.outgoingOffers?.length) {
    for (const offer of game.outgoingOffers) game.news.unshift({ id: `outgoing-season-end-${offer.id}`, type: "negative", title: `Negociação por ${offer.playerName} encerrada`, body: "O fim da temporada encerrou as conversas entre os clubes." });
    game.outgoingOffers = [];
  }
  if(game.managementVersion) expireContracts(game);
}

export function advanceWeek(game) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida em andamento primeiro." };
  if (game.finished) return { ok: false, message: "A temporada terminou. Inicie a próxima temporada." };
  const random = mulberry32(game.rngState);
  game.rngState += 997;
  const fixtures = game.schedule[game.week];
  const results = fixtures.map(match => simulateMatch(game, match, random));
  return applyRound(game, results, random);
}

function applyRound(game, results, random) {
  results.forEach(result => updateTable(game, result));
  processFinances(game, results);
  updateMorale(game, results, random);
  processFanRound(game, results);
  developSquads(game, results);
  updateAvailability(game, results, random);
  game.lastRound = results;
  game.week += 1;
  processStadiumRound(game);
  advanceYouthAcademy(game);
  if (game.leagues) {
    const own = game.leagues.find(l => l.id === game.leagueId);
    own.week = game.week; own.lastRound = results;
    // Different league sizes progress together and finish in the same career season.
    for (const league of game.leagues) {
      if (league === own) continue;
      const ownProfile = leagueCalendarProfile(own);
      const leagueProfile = leagueCalendarProfile(league);
      const progress = game.week / game.schedule.length;
      const oppositeCalendar = ownProfile.id !== leagueProfile.id;
      const targetProgress = oppositeCalendar ? Math.min(1, 0.5 + progress) : progress;
      const target = Math.floor(targetProgress * league.schedule.length);
      const context = { ...game, table: league.table, clubs: game.clubs.filter(c => league.clubIds.includes(c.id)) };
      while (league.week < target) {
        const otherResults = league.schedule[league.week].map(f => simulateMatch(context, f, random));
        otherResults.forEach(r => updateTable(context, r));
        processFinances(context, otherResults); updateMorale(context, otherResults, random); processFanRound(game, otherResults); developSquads(context, otherResults);
        updateAvailability(context, otherResults, random);
        league.lastRound = otherResults; league.week++;
      }
    }
    processParallelCalendar(game, random);
    maybeCreateInterimWorldReport(game);
  }
  buildRoundNews(game, results);
  if (game.week >= game.schedule.length) finishSeason(game);
  else if(game.managementVersion>=2) {
    recruitFreeAgents(game);
    processTransferActivity(game);
  }
  return { ok: true, results };
}

export function injuryFromRoll(severityRoll, durationRoll) {
  if (severityRoll < 0.55) return { label: "Lesão leve", matches: 1 };
  if (severityRoll < 0.9) return { label: "Lesão moderada", matches: 2 + Math.floor(durationRoll * 2) };
  return { label: "Lesão grave", matches: 4 + Math.floor(durationRoll * 3) };
}

function updateAvailability(game, results, random) {
  const clubs = new Set(results.flatMap(result => [result.homeId, result.awayId]));
  for (const clubId of clubs) {
    const club = getClub(game, clubId);
    club.squad.forEach(player => {
      player.suspensionMatches = Math.max(0, (player.suspensionMatches || 0) - 1);
      player.injuryMatches = Math.max(0, (player.injuryMatches || 0) - 1);
      if (!player.suspensionMatches) player.suspensionReason = null;
      if (!player.injuryMatches) player.injuryLabel = null;
    });
  }
  for (const result of results) {
    for (const [clubId, reports] of Object.entries(result.playerReports || {})) {
      const club = getClub(game, clubId);
      for (const stats of reports) {
        const player = club.squad.find(item => item.id === stats.id);
        player.yellowCardAccumulation = (player.yellowCardAccumulation || 0) + stats.yellows;
        if (player.yellowCardAccumulation >= 3) {
          player.yellowCardAccumulation %= 3;
          player.suspensionMatches = 1;
          player.suspensionReason = "yellow";
          if (clubId === game.userClubId) game.news?.unshift({ id: `yellow-suspension-${game.season}-${game.week}-${player.id}`, type: "negative", title: `${player.name} está suspenso`, body: "O atleta completou três cartões amarelos e não joga a próxima partida." });
        }
        if (stats.red) {
          player.suspensionMatches = 1;
          player.suspensionReason = "red";
          if (clubId === game.userClubId) game.news?.unshift({ id: `red-suspension-${game.season}-${game.week}-${player.id}`, type: "negative", title: `${player.name} está suspenso`, body: "O cartão vermelho deixa o atleta fora da próxima partida." });
        }
        if (stats.minutes > 0 && !player.injuryMatches && random() < 0.012 * medicalInjuryRisk(club)) {
          const injury = injuryFromRoll(random(), random());
          player.injuryMatches = Math.max(1, injury.matches - medicalRecoveryReduction(club));
          player.injuryLabel = injury.label;
          if (clubId === game.userClubId) game.news?.unshift({ id: `injury-${game.season}-${game.week}-${player.id}`, type: "negative", title: `${player.name} se lesionou`, body: `${injury.label}: previsão de retorno em ${player.injuryMatches} ${player.injuryMatches === 1 ? "partida" : "partidas"}.` });
        }
      }
    }
  }
}

export function finishLiveRound(game) {
  const match = game.activeMatch;
  if (!match || match.phase !== "finished" || match.season !== game.season || match.week !== game.week || match.pendingPenalty) return { ok: false, message: "A partida ainda não terminou." };
  const played = [match, ...(game.liveRound || [])];
  if (played.some(item => item.phase !== "finished" || item.pendingPenalty)) return { ok: false, message: "Aguarde o encerramento de todos os jogos da rodada." };
  const reports = played.map(item => matchReport(game, item));
  for (const report of reports) {
    for (const [clubId, players] of Object.entries(report.playerReports)) {
      const club = getClub(game, clubId);
      for (const stats of players) {
        const player = club.squad.find(item => item.id === stats.id);
        if (stats.minutes > 0) player.appearances++;
        player.goals += stats.goals;
        player.assists = (player.assists ?? 0) + stats.assists;
        player.yellowCards = (player.yellowCards ?? 0) + stats.yellows;
        player.redCards = (player.redCards ?? 0) + Number(stats.red);
        recordPlayerRating(player, stats.rating);
      }
    }
  }
  const random = mulberry32(match.rngState);
  game.rngState = match.rngState + 997;
  if (match.competitionId) {
    const competition = ensureParallelCompetitions(game).items.find(item => item.id === match.competitionId);
    const fixtures = competition?.currentFixtures || [];
    const results = fixtures.map(fixture => reports.find(report => report.homeId === fixture.homeId) || simulateMatch(game, { ...fixture, competitionId: match.competitionId }, random));
    delete game.activeMatch;
    delete game.liveRound;
    applyCompetitionResults(game, results, random);
    completeCompetitionRound(game, match.competitionId, results);
    processParallelCalendar(game, random);
    return { ok: true, results, competitionId: match.competitionId };
  }
  const results = game.schedule[game.week].map(fixture => reports.find(report => report.homeId === fixture.homeId) || simulateMatch(game, fixture, random));
  delete game.activeMatch;
  delete game.liveRound;
  return applyRound(game, results, random);
}

export function startNextSeason(game) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida em andamento primeiro." };
  if (!game.finished) return { ok: false, message: "A temporada atual ainda não terminou." };
  delete game.pendingWorldReport;
  returnExpiredLoans(game);
  const random = mulberry32(game.rngState + game.season);
  game.season += 1;
  game.week = 0;
  game.finished = false;
  if (game.leagues) {
    game.worldSeason++;
    game.leagueId = game.nextLeagueId || game.leagueId;
    delete game.nextLeagueId;
    for (const league of game.leagues) {
      league.week = 0; league.lastRound = [];
      league.table = freshTable(league.clubIds.map(id => ({ id })));
      league.schedule = createSchedule(league.clubIds);
    }
    bindUserLeague(game);
  } else {
    game.table = freshTable(game.clubs);
    game.schedule = createSchedule(game.clubs.map(club => club.id));
    if(!game.managementVersion) game.market = generateMarket(random, game.season);
  }
  game.lastRound = [];
  [...game.clubs.flatMap(club=>club.squad), ...game.market].forEach(player => { player.goals = 0; player.assists = 0; player.yellowCards = 0; player.yellowCardAccumulation = 0; player.redCards = 0; player.suspensionMatches = 0; player.suspensionReason = null; player.injuryMatches = 0; player.injuryLabel = null; player.appearances = 0; player.ratingTotal = 0; player.ratedMatches = 0; });
  game.news.unshift({ id: `season-${game.season}`, type: "info", title: `Temporada ${game.season}`, body: "Os clubes voltam a campo com objetivos renovados." });
  ensureSeasonTracking(game);
  startFanSeason(game);
  startSponsorshipSeason(game);
  payPendingPrizes(game);
  const competitions = ensureParallelCompetitions(game);
  for (const competition of competitions.items.filter(item => item.qualification.length && item.participants.includes(game.userClubId))) {
    const body = competition.id === "club-world-cup" ? "O clube garantiu uma das 32 vagas pelo título continental, pelo ranking acumulado de quatro anos ou pela vaga do país-sede." : competition.id === "intercontinental" ? "O título continental garantiu a participação no torneio anual entre os campeões das seis confederações." : "A colocação no campeonato nacional garantiu a vaga para esta temporada.";
    game.news.unshift({ id: `qualified-${game.season}-${competition.id}`, type: "positive", title: `Classificado para a ${competition.name}`, body });
  }
  return { ok: true };
}

export function buyPlayer(game, playerId) {
  if (game.activeMatch) return { ok: false, message: "Transferências ficam fechadas durante a partida." };
  const club = getUserClub(game);
  const index = game.market.findIndex(player => player.id === playerId);
  if (index < 0) return { ok: false, message: "Atleta não está mais disponível." };
  const player = game.market[index];
  if (club.budget < player.askingPrice) return { ok: false, message: "Orçamento insuficiente para esta contratação." };
  if (squadSlots(game, club.id) >= (game.leagues ? 40 : 24)) return { ok: false, message: `O elenco atingiu o limite de ${game.leagues ? 40 : 24} atletas.` };
  club.budget -= player.askingPrice;
  recordSeasonFinance(game, club.id, "transferencias", player.askingPrice, "expense");
  delete player.askingPrice;
  player.contractEndSeason=game.season+2;
  delete player.freeAgentOrigin;
  delete player.previousClub;
  delete player.previousClubId;
  delete player.freeSinceSeason;
  delete player.freeSinceWeek;
  club.squad.push(player);
  recordPlayerArrival(game, club, player);
  game.market.splice(index, 1);
  game.news.unshift({ id: `buy-${player.id}`, type: "positive", title: `${player.name} foi contratado`, body: `O novo ${player.position} já está integrado ao elenco.` });
  return { ok: true, message: "Contratação concluída." };
}

export function getTransferTerms(game, sellerId, playerId) {
  const seller = getClub(game, sellerId);
  const player = seller?.squad.find(item => item.id === playerId);
  if (!player || seller.id === game.userClubId) return null;
  if (seller.externalCompetitionClub) return { role: "Convidado internacional", available: false, askingPrice: null, reasons: ["Este representante participa apenas das competições mundiais."] };
  const ranked = [...seller.squad].sort((a, b) => b.overall - a.overall);
  const keyPlayer = ranked.slice(0, 3).some(item => item.id === player.id);
  const starter = getLineup(seller).some(item => item.id === player.id);
  const role = keyPlayer ? "Peça-chave" : starter ? "Titular" : "Reserva";
  if (player.loan) return { role, available: false, askingPrice: null, reasons: ["O atleta está emprestado e não pode ser vendido ou repassado."] };
  const replacements = seller.squad.filter(item => item.position === player.position && item.id !== player.id);
  if (seller.squad.length <= 14 || (player.position === "GOL" && !replacements.length)) {
    return { role, available: false, askingPrice: null, reasons: [seller.squad.length <= 14 ? "O clube precisa manter ao menos 14 atletas." : "O clube não vende seu único goleiro."] };
  }
  let multiplier = keyPlayer ? 1.75 : starter ? 1.28 : 0.94;
  const reasons = [keyPlayer ? "É um dos principais jogadores; a diretoria exige uma oferta excepcional." : starter ? "É titular e o clube exige compensação pela perda." : "O clube está aberto a negociar este reserva."];
  const bestReplacement = Math.max(0, ...replacements.map(item => item.overall));
  if (!replacements.length || (starter && player.overall - bestReplacement >= 5)) {
    multiplier += 0.4;
    reasons.push("Falta uma reposição de nível semelhante nesta posição.");
  }
  if (player.age <= 23 && player.potential - player.overall >= 6) {
    multiplier += 0.25;
    reasons.push("O clube valoriza o potencial de evolução deste jovem.");
  }
  if (seller.squad.length <= 15) {
    multiplier += 0.2;
    reasons.push("O elenco está curto e há pouca margem para vender.");
  }
  if (seller.budget >= 5_000_000) {
    multiplier += 0.15;
    reasons.push("As contas estão equilibradas; o clube não precisa vender.");
  }
  const contractYears = Math.max(0, (player.contractEndSeason ?? game.season) - game.season);
  if (contractYears === 0) {
    multiplier -= 0.28;
    reasons.push("O contrato termina nesta temporada, reduzindo o poder de negociação do clube.");
  } else if (contractYears === 1) {
    multiplier -= 0.1;
    reasons.push("O vínculo relativamente curto deixa o clube mais aberto a propostas.");
  } else if (contractYears >= 3) {
    multiplier += 0.1;
    reasons.push("O contrato longo fortalece a posição do clube na negociação.");
  }
  const average = player.ratedMatches > 0 ? player.ratingTotal / player.ratedMatches : null;
  if (player.ratedMatches >= 3 && average < 6) {
    multiplier -= 0.14;
    reasons.push("A temporada abaixo do esperado facilita uma saída.");
  } else if (player.ratedMatches >= 3 && average >= 7) {
    multiplier += 0.12;
    reasons.push("O bom desempenho na temporada aumentou a valorização do atleta.");
  }
  if (player.form <= 55) {
    multiplier -= 0.08;
    reasons.push("A má fase torna a diretoria mais flexível.");
  } else if (player.form >= 78) {
    multiplier += 0.07;
    reasons.push("A ótima fase elevou a exigência financeira.");
  }
  const table = getSortedTable(game, game.leagues?.find(l => l.clubIds.includes(sellerId))?.id);
  const row = table.find(item => item.clubId === sellerId);
  if (!game.finished && game.week >= 4 && starter && row && table[0].points - row.points <= 6) {
    multiplier += 0.25;
    reasons.push("A disputa pelo título aumenta a resistência à saída de titulares.");
  }
  multiplier = Math.max(0.55, multiplier);
  const askingPrice = Math.ceil(player.value * multiplier / 1000) * 1000;
  const negotiationMargin = keyPlayer ? 0.9 : starter ? 0.82 : 0.72;
  return { role, available: true, askingPrice, minimumPrice: Math.ceil(askingPrice * negotiationMargin / 1000) * 1000, reasons };
}

export function getClubListing(game, sellerId, playerId) {
  const terms = getTransferTerms(game, sellerId, playerId);
  if (!terms?.available || terms.role !== "Reserva") return null;
  const club = getClub(game, sellerId);
  const player = club.squad.find(item => item.id === playerId);
  // Clubs retain young prospects but sell reserves outside their development plans.
  if (player.age <= 24 && player.potential > player.overall && club.budget >= 0) {
    if (game.finished) return null;
    const remaining = game.schedule.length - game.week;
    return { type: "loan", price: Math.max(1000, Math.ceil(player.value * 0.08 * remaining / game.schedule.length / 1000) * 1000), endSeason: game.season, remaining, reason: "O clube quer dar experiência a este jovem sem perder seus direitos." };
  }
  return { type: "fixed", price: Math.ceil(player.value * (club.budget < 0 ? 0.8 : 0.95) / 1000) * 1000, reason: club.budget < 0 ? "O clube precisa de receita e colocou este reserva à venda." : "Fora dos planos para o time titular, este atleta está à venda por preço fixo." };
}

function squadSlots(game, clubId) {
  return getClub(game, clubId).squad.length + game.clubs.flatMap(club => club.squad).filter(player => player.loan?.ownerClubId === clubId && player.loan.borrowerClubId !== clubId).length;
}

function recordDeal(game, seller, player, amount, result, exchangePlayer = null) {
  game.negotiations = [{ season: game.season, week: game.week, sellerId: seller.id, playerId: player.id, playerName: player.name, clubName: seller.name, amount, exchangePlayerId: exchangePlayer?.id ?? null, exchangePlayerName: exchangePlayer?.name ?? null, exchangeCredit: result.exchangeCredit ?? 0, status: result.status, counterOffer: result.counterOffer ?? null, message: result.message }, ...(game.negotiations || [])].slice(0, 20);
}

function canTransferOut(club, player) {
  if (!player || player.loan || club.squad.length <= 14) return false;
  return player.position !== "GOL" || club.squad.filter(item => item.position === "GOL" && !item.loan).length > 1;
}

export function getExchangePlayerCredit(player) {
  return player ? Math.max(0, Math.floor(player.value * 0.75 / 1000) * 1000) : 0;
}

function incomingOfferBuyerLimit(offer, player) {
  return Math.ceil(Math.max(offer.amount * 1.25, player.value * 1.2) / 1000) * 1000;
}

function canIncludeIncomingExchange(game, buyer, player, exchangePlayer, buyerLimit) {
  if (!exchangePlayer || !canTransferOut(buyer, exchangePlayer)) return false;
  if (exchangePlayer.overall > player.overall + 2) return false;
  if (getExchangePlayerCredit(exchangePlayer) > buyerLimit * 0.85) return false;
  return canCompleteExchange(game, buyer, exchangePlayer, player);
}

export function incomingExchangeCandidates(game, offerId) {
  const offer = game.incomingOffers?.find(item => item.id === offerId);
  const buyer = offer && getClub(game, offer.buyerId);
  const player = offer && getUserClub(game).squad.find(item => item.id === offer.playerId);
  if (!offer || !buyer || !player) return [];
  const buyerLimit = incomingOfferBuyerLimit(offer, player);
  return buyer.squad.filter(exchangePlayer => canIncludeIncomingExchange(game, buyer, player, exchangePlayer, buyerLimit));
}

function canCompleteExchange(game, club, outgoingPlayer, incomingPlayer = null) {
  if (!outgoingPlayer || outgoingPlayer.loan || incomingPlayer?.loan) return false;
  if (club.squad.length - 1 + (incomingPlayer ? 1 : 0) < 14) return false;
  const keepers = club.squad.filter(item => item.position === "GOL" && !item.loan).length
    - (outgoingPlayer.position === "GOL" ? 1 : 0)
    + (incomingPlayer?.position === "GOL" ? 1 : 0);
  if (keepers < 1) return false;
  const finalSlots = squadSlots(game, club.id) - 1 + (incomingPlayer ? 1 : 0);
  return finalSlots <= (game.leagues ? 40 : 24);
}

function prepareTransferredPlayer(game, club, player) {
  player.contractEndSeason = game.season + 2;
  delete player.releaseClause;
  ensureReleaseClause(game, club, player);
}

function completeClubTransfer(game, seller, buyer, player, amount, exchangePlayer = null) {
  if (!Number.isSafeInteger(amount) || amount < 0 || (!amount && !exchangePlayer)) return false;
  if (buyer.budget < amount || !canCompleteExchange(game, seller, player, exchangePlayer)) return false;
  if (exchangePlayer && !canCompleteExchange(game, buyer, exchangePlayer, player)) return false;
  if (!exchangePlayer && squadSlots(game, buyer.id) >= (game.leagues ? 40 : 24)) return false;
  seller.budget += amount;
  buyer.budget -= amount;
  if (amount) {
    recordSeasonFinance(game, seller.id, "transferencias", amount, "income");
    recordSeasonFinance(game, buyer.id, "transferencias", amount, "expense");
  }
  recordPlayerDeparture(game, seller, player);
  if (exchangePlayer) recordPlayerDeparture(game, buyer, exchangePlayer);
  seller.squad.splice(seller.squad.indexOf(player), 1);
  if (exchangePlayer) buyer.squad.splice(buyer.squad.indexOf(exchangePlayer), 1);
  buyer.squad.push(player);
  if (exchangePlayer) seller.squad.push(exchangePlayer);
  recordPlayerArrival(game, buyer, player);
  if (exchangePlayer) recordPlayerArrival(game, seller, exchangePlayer);
  prepareTransferredPlayer(game, buyer, player);
  if (exchangePlayer) prepareTransferredPlayer(game, seller, exchangePlayer);
  if (seller.lineup) ensureLineup(seller);
  if (buyer.lineup) ensureLineup(buyer);
  return true;
}

function receivedOfferRecord(game, offer, status) {
  const buyer = getClub(game, offer.buyerId);
  game.receivedOfferHistory = [{ ...offer, buyerName: buyer?.name || "Clube", status }, ...(game.receivedOfferHistory || [])].slice(0, 20);
}

export function registerIncomingOffer(game, buyerId, playerId, amount) {
  ensureCareerManagement(game);
  if (game.activeMatch) return { ok: false, message: "Propostas não podem ser processadas durante uma partida." };
  const seller = getUserClub(game);
  const buyer = getClub(game, buyerId);
  const player = seller.squad.find(item => item.id === playerId);
  amount = Math.round(Number(amount) / 1000) * 1000;
  if (!buyer || buyer.id === seller.id || !player || !Number.isSafeInteger(amount) || amount <= 0) return { ok: false, message: "Proposta inválida." };
  if (!canTransferOut(seller, player)) return { ok: false, message: "O elenco não permite a saída deste atleta." };
  if (buyer.budget < amount || squadSlots(game, buyer.id) >= (game.leagues ? 40 : 24)) return { ok: false, message: "O clube interessado não consegue concluir a transferência." };
  if (game.incomingOffers.some(offer => offer.playerId === playerId)) return { ok: false, message: "Já existe uma proposta pendente por este atleta." };
  const offer = { id: `incoming-${game.season}-${game.week}-${buyer.id}-${player.id}`, buyerId: buyer.id, playerId: player.id, playerName: player.name, amount, season: game.season, week: game.week, expiresWeek: game.week + 2 };
  if (player.releaseClause && amount >= player.releaseClause) {
    const clause = player.releaseClause;
    if (!completeClubTransfer(game, seller, buyer, player, clause)) return { ok: false, message: "A transferência não pôde ser concluída." };
    offer.amount = clause;
    receivedOfferRecord(game, offer, "clause");
    game.transferDeals = [{ ...offer, sellerId: seller.id, sellerName: seller.name, buyerName: buyer.name, status: "clause" }, ...(game.transferDeals || [])].slice(0, 50);
    game.news.unshift({ id: offer.id, type: "negative", title: `${buyer.name} pagou a multa de ${player.name}`, body: `${formatMoney(clause)} entraram no caixa, e a transferência foi concluída automaticamente conforme o contrato.` });
    game.news = game.news.slice(0, 200);
    return { ok: true, status: "clause", message: `${buyer.name} pagou a multa rescisória de ${formatMoney(clause)}.` };
  }
  game.incomingOffers.unshift(offer);
  game.news.unshift({ id: offer.id, type: "info", title: `${buyer.name} quer contratar ${player.name}`, body: `A proposta de ${formatMoney(amount)} fica disponível por duas rodadas.` });
  game.news = game.news.slice(0, 200);
  return { ok: true, status: "pending", offer, message: `Proposta de ${formatMoney(amount)} recebida.` };
}

export function acceptIncomingOffer(game, offerId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de responder à proposta." };
  ensureCareerManagement(game);
  const index = game.incomingOffers.findIndex(offer => offer.id === offerId);
  if (index < 0) return { ok: false, message: "Esta proposta não está mais disponível." };
  const offer = game.incomingOffers[index];
  const seller = getUserClub(game);
  const buyer = getClub(game, offer.buyerId);
  const player = seller.squad.find(item => item.id === offer.playerId);
  if (offer.expiresWeek < game.week || !buyer || !player || !completeClubTransfer(game, seller, buyer, player, offer.amount)) {
    game.incomingOffers.splice(index, 1);
    return { ok: false, message: "A proposta expirou ou não pode mais ser concluída." };
  }
  game.incomingOffers.splice(index, 1);
  receivedOfferRecord(game, offer, "accepted");
  game.transferDeals = [{ ...offer, sellerId: seller.id, sellerName: seller.name, buyerName: buyer.name, status: "accepted" }, ...(game.transferDeals || [])].slice(0, 50);
  game.news.unshift({ id: `accepted-${offer.id}`, type: "positive", title: `${player.name} foi vendido ao ${buyer.name}`, body: `A diretoria aceitou ${formatMoney(offer.amount)} pela transferência.` });
  game.news = game.news.slice(0, 200);
  return { ok: true, message: `${player.name} foi vendido por ${formatMoney(offer.amount)}.` };
}

export function counterIncomingOffer(game, offerId, amount, exchangePlayerId = null) {
  if (game.activeMatch) return { ok: false, status: "invalid", message: "Conclua a partida antes de negociar a proposta." };
  ensureCareerManagement(game);
  const index = game.incomingOffers.findIndex(offer => offer.id === offerId);
  if (index < 0) return { ok: false, status: "invalid", message: "Esta proposta não está mais disponível." };
  const offer = game.incomingOffers[index];
  const seller = getUserClub(game);
  const buyer = getClub(game, offer.buyerId);
  const player = seller.squad.find(item => item.id === offer.playerId);
  amount = Number(amount);
  const exchangePlayer = exchangePlayerId ? buyer?.squad.find(item => item.id === exchangePlayerId) : null;
  if (!buyer || !player || offer.expiresWeek < game.week) return { ok: false, status: "invalid", message: "A proposta expirou ou os clubes não podem mais negociar." };
  if (!Number.isSafeInteger(amount) || amount < 0 || (!amount && !exchangePlayerId)) return { ok: false, status: "invalid", message: "Informe dinheiro, um atleta em troca ou os dois." };
  if (exchangePlayerId && !exchangePlayer) return { ok: false, status: "invalid", message: "O atleta pedido não está mais disponível no clube comprador." };
  if (amount > buyer.budget) return { ok: false, status: "invalid", message: `${buyer.name} não possui caixa para pagar esse valor.` };
  if (!canCompleteExchange(game, seller, player, exchangePlayer) || exchangePlayer && !canCompleteExchange(game, buyer, exchangePlayer, player)) {
    return { ok: false, status: "invalid", message: "A troca deixaria um dos clubes sem elenco mínimo ou sem goleiro." };
  }
  const exchangeCredit = getExchangePlayerCredit(exchangePlayer);
  const packageValue = amount + exchangeCredit;
  const buyerLimit = incomingOfferBuyerLimit(offer, player);
  if (exchangePlayer && !canIncludeIncomingExchange(game, buyer, player, exchangePlayer, buyerLimit)) {
    const counterOffer = Math.min(buyer.budget, buyerLimit);
    return { ok: false, status: "counter", counterOffer, exchangeCredit: 0, clearExchange: true, message: `${buyer.name} não aceita incluir ${exchangePlayer.name} nessa negociação e limita sua contraproposta a ${formatMoney(counterOffer)} em dinheiro. A proposta original continua disponível.` };
  }
  if (packageValue > buyerLimit) {
    const counterOffer = Math.max(0, buyerLimit - exchangeCredit);
    return { ok: false, status: "counter", counterOffer, exchangeCredit, message: `${buyer.name} recusou o pacote e aceita chegar a ${formatMoney(counterOffer)}${exchangePlayer ? ` mais ${exchangePlayer.name}` : ""}. A proposta original continua disponível.` };
  }
  if (!completeClubTransfer(game, seller, buyer, player, amount, exchangePlayer)) return { ok: false, status: "invalid", message: "A contraproposta não pôde ser concluída." };
  game.incomingOffers.splice(index, 1);
  const negotiatedOffer = { ...offer, amount, exchangePlayerId: exchangePlayer?.id ?? null, exchangePlayerName: exchangePlayer?.name ?? null, exchangeCredit };
  receivedOfferRecord(game, negotiatedOffer, "counter-accepted");
  game.transferDeals = [{ ...negotiatedOffer, sellerId: seller.id, sellerName: seller.name, buyerName: buyer.name, status: "counter-accepted" }, ...(game.transferDeals || [])].slice(0, 50);
  const exchangeText = exchangePlayer ? ` e recebeu ${exchangePlayer.name}` : "";
  game.news.unshift({ id: `counter-${offer.id}`, type: "positive", title: `Contraproposta aceita por ${buyer.name}`, body: `${player.name} foi negociado por ${formatMoney(amount)}${exchangeText}.` });
  game.news = game.news.slice(0, 200);
  return { ok: true, status: "accepted", exchangeCredit, message: `${buyer.name} aceitou: ${formatMoney(amount)}${exchangeText} por ${player.name}.` };
}

export function rejectIncomingOffer(game, offerId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de responder à proposta." };
  ensureCareerManagement(game);
  const index = game.incomingOffers.findIndex(offer => offer.id === offerId);
  if (index < 0) return { ok: false, message: "Esta proposta não está mais disponível." };
  const [offer] = game.incomingOffers.splice(index, 1);
  receivedOfferRecord(game, offer, "rejected");
  return { ok: true, message: `A proposta por ${offer.playerName} foi recusada.` };
}

function expireIncomingOffers(game) {
  for (const offer of [...game.incomingOffers]) {
    if (offer.expiresWeek >= game.week) continue;
    game.incomingOffers.splice(game.incomingOffers.indexOf(offer), 1);
    receivedOfferRecord(game, offer, "expired");
  }
}

function generateIncomingInterest(game) {
  if (game.incomingOffers.length >= 3 || game.finished) return;
  const seller = getUserClub(game);
  const sellerAverage = clubAverage(seller);
  const eligible = seller.squad.filter(player => canTransferOut(seller, player) && academyGraduateCanBeSold(game, player)).map(player => {
    const potentialBonus = Math.max(0, player.potential - player.overall) * 0.2;
    const formBonus = (player.form - 65) * 0.08;
    const relativeAppeal = player.overall - sellerAverage + potentialBonus + formBonus;
    const absoluteAppeal = (player.overall - 76) * 0.55 + potentialBonus + formBonus * 0.5;
    return { player, appeal: Math.max(relativeAppeal, absoluteAppeal) };
  }).filter(item => item.appeal >= 4 || item.player.overall >= 80).sort((first, second) => second.appeal - first.appeal || second.player.value - first.player.value);
  if (!eligible.length) return;
  const interestChance = Math.min(0.38, 0.08 + Math.max(0, eligible[0].appeal) * 0.018);
  const key = `${game.seed}:${game.season}:${game.week}:incoming`;
  if (transferRoll(key) >= interestChance) return;
  const player = eligible[Math.min(eligible.length - 1, Math.floor(transferRoll(`${key}:player`) * Math.min(eligible.length, 4)))].player;
  const buyers = game.clubs.filter(club => !club.externalCompetitionClub && club.id !== seller.id && club.budget > player.value && squadSlots(game, club.id) < (game.leagues ? 40 : 24))
    .filter(club => {
      const buyerAverage = clubAverage(club);
      const peers = club.squad.filter(item => item.position === player.position);
      const bestPeer = Math.max(0, ...peers.map(item => item.overall));
      const competitiveClub = buyerAverage >= sellerAverage - 5;
      const eliteOpportunity = player.overall >= 86 && buyerAverage >= player.overall - 10;
      return (competitiveClub || eliteOpportunity) && (!peers.length || player.overall >= bestPeer - 2);
    })
    .sort((first, second) => clubAverage(second) - clubAverage(first) || second.budget - first.budget || transferRoll(`${key}:${first.id}`) - transferRoll(`${key}:${second.id}`));
  const buyer = buyers[0];
  if (!buyer) return;
  const prestigeGap = Math.max(0, clubAverage(buyer) - sellerAverage);
  let amount = Math.ceil(player.value * (1.08 + Math.min(0.35, prestigeGap * 0.025 + transferRoll(`${key}:amount`) * 0.15)) / 1000) * 1000;
  if (player.releaseClause && buyer.budget >= player.releaseClause && (amount >= player.releaseClause || prestigeGap >= 7 && player.overall >= clubAverage(buyer))) amount = player.releaseClause;
  if (buyer.budget >= amount) registerIncomingOffer(game, buyer.id, player.id, amount);
}

function simulateAiClubTransfer(game) {
  const key = `${game.seed}:${game.season}:${game.week}:ai-transfer`;
  if (game.finished || transferRoll(key) >= 0.42) return;
  const limit = game.leagues ? 40 : 24;
  const buyers = game.clubs.filter(club => !club.externalCompetitionClub && club.id !== game.userClubId && club.budget > 500_000 && squadSlots(game, club.id) < limit)
    .sort((first, second) => transferRoll(`${key}:${first.id}:buyer`) - transferRoll(`${key}:${second.id}:buyer`)).slice(0, 20);
  const sellers = game.clubs.filter(club => !club.externalCompetitionClub && club.id !== game.userClubId && club.squad.length > 14)
    .sort((first, second) => transferRoll(`${key}:${first.id}:seller`) - transferRoll(`${key}:${second.id}:seller`)).slice(0, 30);
  for (const buyer of buyers) {
    const buyerAverage = clubAverage(buyer);
    for (const seller of sellers) {
      if (seller.id === buyer.id) continue;
      const sellerStarters = new Set([...seller.squad].sort((a, b) => b.overall - a.overall).slice(0, 11).map(player => player.id));
      const candidates = seller.squad.filter(player => canTransferOut(seller, player) && !sellerStarters.has(player.id) && player.value <= buyer.budget * 0.55).filter(player => {
        const peers = buyer.squad.filter(item => item.position === player.position);
        return !peers.length || player.overall >= Math.min(...peers.map(item => item.overall)) + 2;
      }).sort((first, second) => second.overall - first.overall || first.value - second.value);
      const player = candidates[0];
      if (!player || player.overall > buyerAverage + 10) continue;
      const amount = Math.ceil(player.value * (0.92 + transferRoll(`${key}:${buyer.id}:${player.id}:amount`) * 0.18) / 1000) * 1000;
      if (!completeClubTransfer(game, seller, buyer, player, amount)) continue;
      game.transferDeals = [{ id: `ai-${game.season}-${game.week}-${player.id}`, season: game.season, week: game.week, sellerId: seller.id, sellerName: seller.name, buyerId: buyer.id, buyerName: buyer.name, playerId: player.id, playerName: player.name, amount, status: "ai" }, ...(game.transferDeals || [])].slice(0, 50);
      return;
    }
  }
}

export function processTransferActivity(game) {
  ensureCareerManagement(game);
  resolveOutgoingOffers(game);
  expireIncomingOffers(game);
  generateIncomingInterest(game);
  simulateAiClubTransfer(game);
}

export function acceptClubListing(game, sellerId, playerId, type, quotedPrice) {
  if (game.activeMatch) return { ok: false, message: "Transferências ficam fechadas durante a partida." };
  const listing = getClubListing(game, sellerId, playerId);
  if (!listing || listing.type !== type || listing.price !== quotedPrice) return { ok: false, message: "O anúncio mudou ou não está mais disponível. Consulte o mercado novamente." };
  const buyer = getUserClub(game);
  const seller = getClub(game, sellerId);
  if (squadSlots(game, buyer.id) >= (game.leagues ? 40 : 24)) return { ok: false, message: `O elenco atingiu o limite de ${game.leagues ? 40 : 24} atletas.` };
  if (buyer.budget < listing.price) return { ok: false, message: "Seu caixa não cobre esta contratação." };
  const index = seller.squad.findIndex(player => player.id === playerId);
  const player = seller.squad[index];
  buyer.budget -= listing.price;
  seller.budget += listing.price;
  recordSeasonFinance(game, buyer.id, type === "loan" ? "emprestimos" : "transferencias", listing.price, "expense");
  recordSeasonFinance(game, seller.id, type === "loan" ? "emprestimos" : "transferencias", listing.price, "income");
  if (type !== "loan") recordPlayerDeparture(game, seller, player);
  seller.squad.splice(index, 1);
  buyer.squad.push(player);
  if (type !== "loan") recordPlayerArrival(game, buyer, player);
  if(type!=="loan") player.contractEndSeason=game.season+2;
  if (type === "loan") player.loan = { ownerClubId: seller.id, borrowerClubId: buyer.id, endSeason: listing.endSeason, fee: listing.price };
  const message = type === "loan" ? `${player.name} chega por empréstimo até o fim da temporada ${listing.endSeason}. Seu clube paga 100% do salário por rodada.` : `${player.name} foi comprado de ${seller.name} por ${formatMoney(listing.price)}.`;
  const result = { ok: true, status: type === "loan" ? "loaned" : "purchased", message };
  game.news.unshift({ id: `listing-${game.season}-${game.week}-${player.id}`, type: "positive", title: type === "loan" ? `${player.name} chega por empréstimo` : `${player.name} foi contratado`, body: message });
  game.news = game.news.slice(0, 200);
  recordDeal(game, seller, player, listing.price, result);
  return result;
}

export function loanOutPlayer(game, playerId) {
  if (game.activeMatch) return { ok: false, message: "Empréstimos ficam fechados durante a partida." };
  if (game.finished) return { ok: false, message: "Inicie a próxima temporada antes de negociar um empréstimo." };
  ensureCareerManagement(game);
  const owner = getUserClub(game);
  const player = owner.squad.find(item => item.id === playerId);
  if (!player) return { ok: false, message: "Atleta não encontrado no elenco." };
  if (!canTransferOut(owner, player)) return { ok: false, message: "O elenco não permite este empréstimo agora." };
  const limit = game.leagues ? 40 : 24;
  const ownerAverage = clubAverage(owner);
  const candidates = game.clubs.filter(club => !club.externalCompetitionClub && club.id !== owner.id && squadSlots(game, club.id) < limit).map(club => {
    const peers = getLineup(club).filter(item => item.position === player.position && !item.loan);
    const competition = peers.length ? Math.min(...peers.map(item => item.overall)) : clubAverage(club);
    const smallerClub = club.reputation < owner.reputation || clubAverage(club) < ownerAverage - 1;
    const playingChance = player.overall >= competition - 3;
    const developmentFit = Math.max(0, player.potential - player.overall);
    return { club, competition, smallerClub, playingChance, score: (playingChance ? 100 : 0) + (smallerClub ? 30 : 0) + Math.min(10, developmentFit) - Math.abs(player.overall - competition) };
  }).filter(entry => entry.playingChance).sort((first, second) => second.score - first.score || first.club.reputation - second.club.reputation);
  const destination = candidates.find(entry => entry.smallerClub)?.club || candidates[0]?.club;
  if (!destination) return { ok: false, message: "Nenhum clube oferece espaço adequado para este atleta no momento." };
  owner.squad.splice(owner.squad.indexOf(player), 1);
  destination.squad.push(player);
  player.loan = {
    ownerClubId: owner.id,
    borrowerClubId: destination.id,
    endSeason: game.season,
    fee: 0,
    developmentLoan: true,
    startOverall: player.overall,
    startAppearances: player.appearances ?? 0
  };
  if (owner.lineup) ensureLineup(owner);
  game.news.unshift({ id: `loan-out-${game.season}-${game.week}-${player.id}`, type: "info", title: `${player.name} foi emprestado`, body: `${destination.name} receberá o atleta até o fim da temporada, terá espaço para utilizá-lo e pagará seu salário durante o período.` });
  game.news = game.news.slice(0, 200);
  return { ok: true, message: `${player.name} foi emprestado ao ${destination.name} até o fim da temporada.` };
}

export function loanOutAcademyGraduate(game, playerId) {
  return loanOutPlayer(game, playerId);
}

function returnExpiredLoans(game) {
  for (const borrower of game.clubs) {
    for (const player of [...borrower.squad]) {
      if (!player.loan || player.loan.endSeason > game.season) continue;
      const owner = getClub(game, player.loan.ownerClubId);
      const loan = player.loan;
      const loanAppearances = Math.max(0, (player.appearances ?? 0) - (loan.startAppearances ?? 0));
      const experienceBonus = loan.developmentLoan ? Math.min(player.potential - player.overall, loanAppearances >= 18 ? 2 : loanAppearances >= 8 ? 1 : 0) : 0;
      if (experienceBonus > 0) {
        player.overall += experienceBonus;
        if (player.progression?.season === game.season) player.progression.overallGained = (player.progression.overallGained ?? 0) + experienceBonus;
        player.value = playerValue(player);
      }
      borrower.squad.splice(borrower.squad.indexOf(player), 1);
      owner.squad.push(player);
      delete player.loan;
      if (borrower.id === game.userClubId || owner.id === game.userClubId) {
        const evolution = loan.developmentLoan ? ` Disputou ${loanAppearances} jogos no período e retorna com geral ${player.overall}${player.overall > loan.startOverall ? ` (+${player.overall - loan.startOverall})` : ""}.` : "";
        game.news.unshift({ id: `loan-return-${game.season}-${player.id}`, type: experienceBonus > 0 ? "positive" : "info", title: `Empréstimo de ${player.name} encerrado`, body: `O atleta retornou ao ${owner.name}, mantendo a evolução adquirida.${evolution}` });
      }
    }
  }
  game.news = game.news.slice(0, 200);
}

export function searchTransferMarket(game, filters = {}) {
  if (marketFilterError(filters)) return [];
  const { query = "", clubId = "all", position = "all", positions = [], country = "all", leagueId = "all", sort = "overall", dealType = "all", availableOnly = false, affordableOnly = false } = filters;
  const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const needle = normalize(query.trim());
  const inRange = (value, low, high) => (low === undefined || low === '' || low === null || value >= Number(low)) && (high === undefined || high === '' || high === null || value <= Number(high));
  const leagueClubs = leagueId === 'all' ? null : new Set(game.leagues?.find(l => l.id === leagueId)?.clubIds || []);
  const entries = game.clubs.filter(club => !club.externalCompetitionClub && club.id !== game.userClubId).flatMap(club => club.squad.map(player => ({ player, club })));
  entries.push(...game.market.map(player => ({ player, club: null })));
  const price = entry => entry.listing?.price ?? entry.player.askingPrice ?? entry.terms?.askingPrice ?? entry.player.value;
  const results = entries.filter(({ player, club }) =>
    (clubId === "all" || (clubId === "market" ? !club : club?.id === clubId)) &&
    (country === 'all' || club?.country === country) && (!leagueClubs || leagueClubs.has(club?.id)) &&
    (positions.length ? positions.includes(player.position) : position === "all" || player.position === position) &&
    (!needle || normalize(`${player.name} ${club?.name || "Sem clube"}`).includes(needle)) &&
    ['Age', 'Overall', 'Potential', 'Value'].every(key => inRange(player[key.toLowerCase()], filters[`min${key}`], filters[`max${key}`])) &&
    inRange(player.salary, null, filters.maxSalary) && inRange(player.potential - player.overall, filters.minGrowth, null)
  ).map(entry => ({ ...entry, terms: entry.club ? getTransferTerms(game, entry.club.id, entry.player.id) : null, listing: entry.club ? getClubListing(game, entry.club.id, entry.player.id) : null }))
    .filter(entry => {
      const { club, listing, terms } = entry;
      const available = !club || terms?.available;
      return (!availableOnly || available) && (!affordableOnly || (available && price(entry) <= getUserClub(game).budget)) &&
        (dealType === "all" || (dealType === "free" ? !club : dealType === "negotiation" ? club && !listing && available : dealType === "fixed" ? !club || listing?.type === "fixed" : listing?.type === "loan"));
    });
  const comparisons = {
    name: (a,b) => a.player.name.localeCompare(b.player.name, 'pt-BR'),
    position: (a,b) => ['GOL','ZAG','LAT','VOL','MC','ATA'].indexOf(a.player.position) - ['GOL','ZAG','LAT','VOL','MC','ATA'].indexOf(b.player.position),
    overall: (a,b) => b.player.overall - a.player.overall || b.player.potential - a.player.potential,
    potential: (a,b) => b.player.potential - a.player.potential,
    growth: (a,b) => (b.player.potential-b.player.overall) - (a.player.potential-a.player.overall),
    age: (a,b) => a.player.age - b.player.age,
    value: (a,b) => a.player.value - b.player.value,
    valueDesc: (a,b) => b.player.value - a.player.value,
    price: (a,b) => price(a) - price(b),
    salary: (a,b) => a.player.salary - b.player.salary
  };
  const defaultDirection = ['overall', 'potential', 'growth', 'valueDesc'].includes(sort) ? 'desc' : 'asc';
  const factor = filters.direction && filters.direction !== defaultDirection ? -1 : 1;
  return results.sort((a,b) => factor * (comparisons[sort] || comparisons.overall)(a,b) || a.player.name.localeCompare(b.player.name, 'pt-BR') || a.player.id.localeCompare(b.player.id));
}

function requestedExchangeCandidate(game, seller, offer, gap) {
  const buyer = getUserClub(game);
  const candidates = buyer.squad.filter(player => canTransferOut(buyer, player) && player.id !== offer.exchangePlayerId && player.value <= gap * 1.8)
    .map(player => ({ player, credit: getExchangePlayerCredit(player), depth: seller.squad.filter(item => item.position === player.position).length }))
    .filter(item => item.credit > 0 && item.credit <= gap * 1.35)
    .sort((first, second) => first.depth - second.depth || Math.abs(gap - first.credit) - Math.abs(gap - second.credit));
  if (!candidates.length || transferRoll(`${offer.id}:${offer.attempt}:exchange`) >= 0.38) return null;
  return candidates[0].player;
}

function finalizeOutgoingTransfer(game, offer, seller, player, exchangePlayer, amount, terms) {
  const buyer = getUserClub(game);
  if (!completeClubTransfer(game, seller, buyer, player, amount, exchangePlayer)) return false;
  if (terms.role === "Peça-chave") seller.fanMorale = clamp(seller.fanMorale - 5, 0, 100);
  buyer.fanMorale = clamp(buyer.fanMorale + (terms.role === "Peça-chave" ? 4 : 1), 0, 100);
  const exchangeText = exchangePlayer ? ` e ${exchangePlayer.name}` : "";
  const result = { ok: true, status: "accepted", exchangeCredit: getExchangePlayerCredit(exchangePlayer), message: `${seller.name} aceitou ${formatMoney(amount)}${exchangeText}. ${player.name} já integra seu elenco.` };
  offer.status = "accepted";
  recordDeal(game, seller, player, amount, result, exchangePlayer);
  game.transferDeals = [{ ...offer, amount, exchangePlayerId: exchangePlayer?.id ?? null, exchangePlayerName: exchangePlayer?.name ?? null, sellerName: seller.name, buyerId: buyer.id, buyerName: buyer.name, status: "accepted" }, ...(game.transferDeals || [])].slice(0, 50);
  game.news.unshift({ id: `outgoing-accepted-${offer.id}`, type: "positive", title: `${seller.name} aceitou sua proposta`, body: `${player.name} foi contratado por ${formatMoney(amount)}${exchangeText}.` });
  return result;
}

function resolveOutgoingOffers(game) {
  for (const offer of [...game.outgoingOffers]) {
    if (offer.status === "counter" && offer.expiresWeek < game.week) {
      offer.status = "expired";
      game.outgoingOffers.splice(game.outgoingOffers.indexOf(offer), 1);
      game.news.unshift({ id: `outgoing-expired-${offer.id}`, type: "negative", title: `Negociação por ${offer.playerName} expirou`, body: `${offer.clubName} retirou a contraproposta após três rodadas sem resposta.` });
      continue;
    }
    if (offer.status !== "pending" || offer.responseWeek > game.week) continue;
    const seller = getClub(game, offer.sellerId);
    const buyer = getUserClub(game);
    const player = seller?.squad.find(item => item.id === offer.playerId);
    const exchangePlayer = offer.exchangePlayerId ? buyer.squad.find(item => item.id === offer.exchangePlayerId) : null;
    const terms = seller && player ? getTransferTerms(game, seller.id, player.id) : null;
    const remove = () => game.outgoingOffers.splice(game.outgoingOffers.indexOf(offer), 1);
    if (!terms?.available || !player || offer.amount > buyer.budget || offer.exchangePlayerId && !exchangePlayer) {
      offer.status = "rejected";
      remove();
      const result = { status: "rejected", message: `${seller?.name || "O clube"} encerrou a negociação porque as condições mudaram.` };
      if (seller && player) recordDeal(game, seller, player, offer.amount, result, exchangePlayer);
      game.news.unshift({ id: `outgoing-ended-${offer.id}`, type: "negative", title: `Negociação por ${offer.playerName} encerrada`, body: result.message });
      continue;
    }
    const exchangeCredit = getExchangePlayerCredit(exchangePlayer);
    const packageValue = offer.amount + exchangeCredit;
    const concession = Math.min(0.09, Math.max(0, offer.attempt - 1) * 0.025);
    const flexibleMinimum = Math.ceil(terms.minimumPrice * (1 - concession) / 1000) * 1000;
    const acceptanceVariation = 0.98 + transferRoll(`${offer.id}:${offer.attempt}:accept`) * 0.035;
    const acceptanceValue = Math.ceil(flexibleMinimum * acceptanceVariation / 1000) * 1000;
    if (packageValue >= acceptanceValue) {
      if (finalizeOutgoingTransfer(game, offer, seller, player, exchangePlayer, offer.amount, terms)) remove();
      continue;
    }
    if (packageValue < flexibleMinimum * (offer.attempt > 1 ? 0.58 : 0.48)) {
      offer.status = "rejected";
      remove();
      const result = { status: "rejected", exchangeCredit, message: `${seller.name} considerou a proposta muito distante de um acordo e encerrou a conversa.` };
      recordDeal(game, seller, player, offer.amount, result, exchangePlayer);
      game.news.unshift({ id: `outgoing-rejected-${offer.id}`, type: "negative", title: `${seller.name} recusou sua proposta`, body: result.message });
      continue;
    }
    const distanceShare = Math.max(0.28, 0.58 - offer.attempt * 0.09);
    const desiredPackage = Math.ceil(Math.max(flexibleMinimum, packageValue + (terms.askingPrice - packageValue) * distanceShare) / 1000) * 1000;
    const requestedPlayer = requestedExchangeCandidate(game, seller, offer, Math.max(1, desiredPackage - packageValue));
    const requestedCredit = getExchangePlayerCredit(requestedPlayer);
    offer.status = "counter";
    offer.counterAmount = Math.max(0, desiredPackage - requestedCredit);
    offer.requestedExchangePlayerId = requestedPlayer?.id ?? null;
    offer.requestedExchangePlayerName = requestedPlayer?.name ?? null;
    offer.expiresWeek = game.week + 3;
    const playerRequest = requestedPlayer ? ` mais ${requestedPlayer.name}` : "";
    const result = { status: "counter", counterOffer: offer.counterAmount, exchangeCredit: requestedCredit, message: `${seller.name} respondeu com ${formatMoney(offer.counterAmount)}${playerRequest}. Você pode aceitar, reduzir o valor ou oferecer outro atleta.` };
    recordDeal(game, seller, player, offer.amount, result, exchangePlayer);
    game.news.unshift({ id: `outgoing-counter-${offer.id}-${offer.attempt}`, offerId: offer.id, type: "info", title: `${seller.name} enviou uma contraproposta`, body: result.message });
  }
  game.news = game.news.slice(0, 200);
}

export function cancelOutgoingOffer(game, offerId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de encerrar a negociação." };
  ensureCareerManagement(game);
  const index = game.outgoingOffers.findIndex(offer => offer.id === offerId);
  if (index < 0) return { ok: false, message: "Esta negociação não está mais ativa." };
  const [offer] = game.outgoingOffers.splice(index, 1);
  return { ok: true, message: `Negociação por ${offer.playerName} encerrada.` };
}

export function acceptOutgoingCounter(game, offerId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de responder à contraproposta." };
  ensureCareerManagement(game);
  const index = game.outgoingOffers.findIndex(offer => offer.id === offerId && offer.status === "counter");
  if (index < 0) return { ok: false, message: "Esta contraproposta não está mais disponível." };
  const offer = game.outgoingOffers[index];
  const seller = getClub(game, offer.sellerId);
  const buyer = getUserClub(game);
  const player = seller?.squad.find(item => item.id === offer.playerId);
  const exchangePlayer = offer.requestedExchangePlayerId ? buyer.squad.find(item => item.id === offer.requestedExchangePlayerId) : null;
  const terms = seller && player ? getTransferTerms(game, seller.id, player.id) : null;
  if (!seller || !player || !terms?.available) return { ok: false, message: "As condições mudaram e o clube retirou a contraproposta." };
  if (!Number.isSafeInteger(offer.counterAmount) || offer.counterAmount < 0 || offer.counterAmount > buyer.budget) return { ok: false, message: "Seu caixa não cobre esta contraproposta." };
  if (offer.requestedExchangePlayerId && !exchangePlayer) return { ok: false, message: "O jogador solicitado não está mais disponível no seu elenco." };
  if (!exchangePlayer && squadSlots(game, buyer.id) >= (game.leagues ? 40 : 24)) return { ok: false, message: "Seu elenco está cheio. Renegocie incluindo um atleta na troca." };
  if (exchangePlayer && (!canCompleteExchange(game, buyer, exchangePlayer, player) || !canCompleteExchange(game, seller, player, exchangePlayer))) return { ok: false, message: "A troca deixaria um dos clubes sem elenco mínimo ou sem goleiro." };
  const result = finalizeOutgoingTransfer(game, offer, seller, player, exchangePlayer, offer.counterAmount, terms);
  if (!result) return { ok: false, message: "A transferência não pôde ser concluída com este pacote." };
  game.outgoingOffers.splice(index, 1);
  return result;
}

export function makeTransferOffer(game, sellerId, playerId, amount, exchangePlayerId = null) {
  if (game.activeMatch) return { ok: false, status: "invalid", message: "Transferências ficam fechadas durante a partida." };
  const buyer = getUserClub(game);
  const seller = getClub(game, sellerId);
  const terms = getTransferTerms(game, sellerId, playerId);
  if (!terms) return { ok: false, status: "invalid", message: "Este atleta não está disponível neste clube." };
  const exchangePlayer = exchangePlayerId ? buyer.squad.find(item => item.id === exchangePlayerId) : null;
  const existing = (game.outgoingOffers || []).find(offer => offer.sellerId === sellerId && offer.playerId === playerId);
  if (existing?.status === "pending") return { ok: false, status: "invalid", message: `${seller.name} ainda está analisando sua proposta. Aguarde a resposta.` };
  if (!Number.isSafeInteger(amount) || amount < 0 || (!amount && !exchangePlayerId)) return { ok: false, status: "invalid", message: "Informe dinheiro, um atleta em troca ou os dois." };
  if (exchangePlayerId && !exchangePlayer) return { ok: false, status: "invalid", message: "O atleta oferecido não está disponível no seu elenco." };
  if (!exchangePlayer && squadSlots(game, buyer.id) >= (game.leagues ? 40 : 24)) return { ok: false, status: "invalid", message: `O elenco atingiu o limite de ${game.leagues ? 40 : 24} atletas. Inclua um jogador na troca para liberar uma vaga.` };
  if (amount > buyer.budget) return { ok: false, status: "invalid", message: "Seu caixa não cobre esta proposta." };
  if (getClubListing(game, sellerId, playerId)?.type === "loan") return { ok: false, status: "invalid", message: "O clube disponibilizou este atleta somente por empréstimo." };
  const player = seller.squad.find(item => item.id === playerId);
  if (exchangePlayer && (!canCompleteExchange(game, buyer, exchangePlayer, player) || !canCompleteExchange(game, seller, player, exchangePlayer))) return { ok: false, status: "invalid", message: "A troca deixaria um dos clubes sem elenco mínimo ou sem goleiro." };
  if (!terms.available) {
    const result = { ok: false, status: "rejected", message: `${seller.name} recusou: ${terms.reasons[0]}` };
    recordDeal(game, seller, player, amount, result, exchangePlayer);
    return result;
  }
  const attempt = (existing?.attempt ?? 0) + 1;
  const id = existing?.id || `outgoing-${game.season}-${game.week}-${seller.id}-${player.id}`;
  const responseWeek = game.week + 1 + Number(transferRoll(`${id}:${attempt}:delay`) > 0.68);
  const offer = existing || { id, sellerId: seller.id, playerId: player.id, playerName: player.name, clubName: seller.name, season: game.season };
  Object.assign(offer, { amount, exchangePlayerId: exchangePlayer?.id ?? null, exchangePlayerName: exchangePlayer?.name ?? null, exchangeCredit: getExchangePlayerCredit(exchangePlayer), status: "pending", attempt, submittedWeek: game.week, responseWeek, expiresWeek: responseWeek + 3, counterAmount: null, requestedExchangePlayerId: null, requestedExchangePlayerName: null });
  game.outgoingOffers ??= [];
  if (!existing) game.outgoingOffers.unshift(offer);
  const wait = responseWeek - game.week;
  const result = { ok: true, status: "pending", responseWeek, message: `Proposta enviada ao ${seller.name}. A diretoria responderá em ${wait} ${wait === 1 ? "rodada" : "rodadas"}.` };
  recordDeal(game, seller, player, amount, result, exchangePlayer);
  game.news.unshift({ id: `${id}-sent-${attempt}`, type: "info", title: `Proposta enviada por ${player.name}`, body: `${seller.name} analisará o pacote de ${formatMoney(amount)}${exchangePlayer ? ` mais ${exchangePlayer.name}` : ""} e responderá em até ${wait} ${wait === 1 ? "rodada" : "rodadas"}.` });
  game.news = game.news.slice(0, 200);
  return result;
}

export function sellPlayer(game, playerId) {
  if (game.activeMatch) return { ok: false, message: "Transferências ficam fechadas durante a partida." };
  const club = getUserClub(game);
  if (club.squad.find(player => player.id === playerId)?.loan) return { ok: false, message: "Este atleta está emprestado; os direitos pertencem ao clube de origem." };
  if (club.squad.filter(player => !player.loan).length <= 14) return { ok: false, message: "Mantenha ao menos 14 atletas próprios para o retorno dos emprestados." };
  if (club.squad.length <= 14) return { ok: false, message: "Você precisa manter ao menos 14 atletas." };
  const index = club.squad.findIndex(player => player.id === playerId);
  if (index < 0) return { ok: false, message: "Atleta não encontrado." };
  const player = club.squad[index];
  if (player.position === "GOL" && club.squad.filter(item => item.position === "GOL" && !item.loan).length === 1) {
    return { ok: false, message: "Você precisa manter ao menos um goleiro." };
  }
  const professionalAppearances = academyGraduateAppearances(game, player);
  if (!academyGraduateCanBeSold(game, player)) {
    return { ok: false, message: `${player.name} poderá ser vendido quando completar 18 anos ou alcançar 5 jogos profissionais, inclusive por empréstimo.` };
  }
  const academyGraduateRate = player.academyGraduate
    ? Math.min(0.88, 0.1 + Math.max(0, professionalAppearances - 5) * 0.052)
    : 0.88;
  const fee = Math.round(player.value * academyGraduateRate / 1000) * 1000;
  club.budget += fee;
  recordSeasonFinance(game, club.id, "transferencias", fee, "income");
  recordPlayerDeparture(game, club, player);
  club.squad.splice(index, 1);
  const academyNote = player.academyGraduate && academyGraduateRate < 0.88 ? " O valor foi reduzido porque o atleta ainda tem pouca experiência profissional." : "";
  game.news.unshift({ id: `sell-${player.id}`, type: "info", title: `${player.name} foi negociado`, body: `A venda rendeu ${formatMoney(fee)} ao clube.${academyNote}` });
  return { ok: true, message: `Venda concluída por ${formatMoney(fee)}.` };
}

export function upgradeStadium(game) {
  return startStadiumProject(game, "expand:stands");
}

export function stadiumUpgradeCost(club) {
  return stadiumExpansionQuote(club, "stands").cost;
}

export function setTactic(game, tactic) {
  if (!["defensivo", "equilibrado", "ofensivo"].includes(tactic)) return { ok: false, message: "Tática inválida." };
  getUserClub(game).tactic = tactic;
  return { ok: true };
}

export function setMarkingIntensity(game, intensity) {
  if (!MARKING_STYLES[intensity]) return { ok: false, message: "Intensidade de marcação inválida." };
  getUserClub(game).markingIntensity = intensity;
  return { ok: true, message: `Marcação ${MARKING_STYLES[intensity].label.toLocaleLowerCase("pt-BR")} selecionada.` };
}

export function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
