import { playerValue } from "./player-balance.js";
import { recordSeasonFinance } from "./season-tracking.js";

export const SCOUT_REGIONS = [
  { id: "bra", name: "Brasil", countries: ["BRA"], first: ["Caio", "Davi", "Enzo", "João", "Lucas", "Matheus", "Rafael", "Vitor"], last: ["Almeida", "Barbosa", "Costa", "Lima", "Oliveira", "Rocha", "Santos", "Silva"] },
  { id: "sam", name: "América do Sul", countries: ["ARG", "COL", "PRY", "URY"], first: ["Agustín", "Facundo", "Joaquín", "Mateo", "Santiago", "Thiago"], last: ["Benítez", "Cabrera", "Gómez", "Martínez", "Pereira", "Suárez"] },
  { id: "eur", name: "Europa", countries: ["DEU", "ENG", "ESP", "FRA", "ITA", "NLD", "PRT", "TUR"], first: ["Adam", "Hugo", "Liam", "Luca", "Noah", "Theo"], last: ["Costa", "Dubois", "Jansen", "Müller", "Rossi", "Smith"] },
  { id: "afr", name: "África", countries: ["MAR", "NGA", "SEN", "GHA", "CIV", "CMR"], first: ["Amadou", "Ibrahim", "Ismaël", "Moussa", "Samuel", "Yannick"], last: ["Diallo", "Konaté", "Mensah", "Ndoye", "Okafor", "Traoré"] },
  { id: "nam", name: "América do Norte e Central", countries: ["USA", "MEX", "CAN", "CRC"], first: ["Alex", "Diego", "Ethan", "Luis", "Mateo", "Tyler"], last: ["Brown", "García", "Johnson", "Martínez", "Miller", "Wilson"] },
  { id: "asi", name: "Ásia e Oceania", countries: ["JPN", "KOR", "AUS", "NZL"], first: ["Haruto", "Kai", "Min-jun", "Ren", "Takumi", "Yuto"], last: ["Ito", "Kim", "Nakamura", "Sato", "Suzuki", "Tanaka"] }
];

const POSITIONS = ["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"];
const SCOUT_MARKET_SIZE = 7;
const SCOUT_MARKET_INTERVAL = 4;
const SCOUT_SALARIES = [0, 5000, 10000, 22000, 45000, 90000];
const SCOUT_SIGNING_FEES = [0, 75000, 200000, 600000, 1600000, 4500000];
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function randomFor(value) {
  let state = hash(value);
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function drawScoutExperience(random) {
  const roll = random();
  if (roll < 0.38) return 1;
  if (roll < 0.68) return 2;
  if (roll < 0.87) return 3;
  if (roll < 0.97) return 4;
  return 5;
}

function scoutBatch(game, academy, count) {
  const cycle = academy.scoutMarketCycle++;
  const random = randomFor(`${game.seed}:${cycle}:scout-market`);
  const unavailableNames = new Set([...academy.scouts, ...academy.candidateScouts].map(scout => scout.name));
  const scouts = [];
  for (let index = 0, attempts = 0; scouts.length < count && attempts < count * 20; attempts++) {
    const region = pick(random, SCOUT_REGIONS);
    const name = `${pick(random, region.first)} ${pick(random, region.last)}`;
    if (unavailableNames.has(name)) continue;
    unavailableNames.add(name);
    const experience = drawScoutExperience(random);
    const feeVariation = 0.9 + random() * 0.2;
    scouts.push({
      id: `scout-${hash(`${game.seed}:${cycle}:${index++}:${name}`)}`,
      name,
      experience,
      specialty: region.id,
      salary: Math.round(SCOUT_SALARIES[experience] * feeVariation / 1000) * 1000,
      signingFee: Math.round(SCOUT_SIGNING_FEES[experience] * feeVariation / 1000) * 1000,
      availableUntil: academy.scoutMarketTime + SCOUT_MARKET_INTERVAL + Math.floor(random() * 5)
    });
  }
  return scouts;
}

export function ensureYouthAcademy(game) {
  game.academy ??= {};
  game.academy.scouts ??= [];
  game.academy.prospects ??= [];
  game.academy.nextProspectId ??= 1;
  game.academy.scoutMarketTime ??= 0;
  game.academy.scoutMarketCycle ??= 0;
  game.academy.lastScoutMarketRefresh ??= 0;
  if ((game.academy.version ?? 0) < 3) {
    game.academy.candidateScouts = [];
    game.academy.candidateScouts.push(...scoutBatch(game, game.academy, SCOUT_MARKET_SIZE));
  }
  game.academy.candidateScouts ??= [];
  game.academy.version = 3;
  return game.academy;
}

export function scoutMarketRoundsRemaining(game) {
  const academy = ensureYouthAcademy(game);
  return Math.max(0, SCOUT_MARKET_INTERVAL - (academy.scoutMarketTime - academy.lastScoutMarketRefresh));
}

export function refreshScoutMarket(game, force = false) {
  const academy = ensureYouthAcademy(game);
  if (!force && scoutMarketRoundsRemaining(game) > 0) return false;
  const expired = academy.candidateScouts.filter(scout => scout.availableUntil <= academy.scoutMarketTime);
  if (!expired.length && academy.candidateScouts.length) {
    const departing = [...academy.candidateScouts].sort((a, b) => a.availableUntil - b.availableUntil || a.id.localeCompare(b.id))[0];
    academy.candidateScouts = academy.candidateScouts.filter(scout => scout.id !== departing.id);
  } else {
    const expiredIds = new Set(expired.map(scout => scout.id));
    academy.candidateScouts = academy.candidateScouts.filter(scout => !expiredIds.has(scout.id));
  }
  const vacancies = Math.max(0, SCOUT_MARKET_SIZE - academy.candidateScouts.length);
  academy.candidateScouts.push(...scoutBatch(game, academy, vacancies));
  academy.candidateScouts.sort((a, b) => a.experience - b.experience || a.name.localeCompare(b.name, "pt-BR"));
  academy.lastScoutMarketRefresh = academy.scoutMarketTime;
  return true;
}

export function scoutExperienceLabel(experience) {
  return ["", "Iniciante", "Regional", "Experiente", "Especialista", "Elite"][experience] || "Olheiro";
}

export function scoutMissionRounds(experience) {
  return Math.max(2, 7 - experience);
}

export function scoutContractCost(scout) {
  return scout.signingFee + scout.salary * scoutMissionRounds(scout.experience);
}

export function hireScout(game, scoutId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de alterar a equipe de olheiros." };
  const academy = ensureYouthAcademy(game);
  if (academy.scouts.length >= 3) return { ok: false, message: "A categoria de base comporta no máximo três olheiros." };
  const index = academy.candidateScouts.findIndex(scout => scout.id === scoutId);
  if (index < 0) return { ok: false, message: "Este olheiro não está mais disponível." };
  const scout = academy.candidateScouts[index];
  const club = game.clubs.find(item => item.id === game.userClubId);
  if (club.budget < scout.signingFee) return { ok: false, message: "Caixa insuficiente para pagar as luvas do olheiro." };
  club.budget -= scout.signingFee;
  recordSeasonFinance(game, club.id, "olheiros", scout.signingFee, "expense");
  academy.candidateScouts.splice(index, 1);
  academy.scouts.push({ ...scout, mission: null });
  return { ok: true, message: `${scout.name} foi contratado para a categoria de base.` };
}

export function dismissScout(game, scoutId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de alterar a equipe de olheiros." };
  const academy = ensureYouthAcademy(game);
  const index = academy.scouts.findIndex(scout => scout.id === scoutId);
  if (index < 0) return { ok: false, message: "Olheiro não encontrado." };
  const [scout] = academy.scouts.splice(index, 1);
  return { ok: true, message: `${scout.name} deixou a equipe e não retorna imediatamente ao mercado.` };
}

export function startScouting(game, scoutId, regionId) {
  if (game.activeMatch) return { ok: false, message: "Inicie a busca fora de uma partida em andamento." };
  const academy = ensureYouthAcademy(game);
  const scout = academy.scouts.find(item => item.id === scoutId);
  const region = SCOUT_REGIONS.find(item => item.id === regionId);
  if (!scout || !region) return { ok: false, message: "Escolha um olheiro e uma região válidos." };
  if (scout.mission) return { ok: false, message: "Este olheiro já está em uma missão." };
  const rounds = scoutMissionRounds(scout.experience);
  scout.mission = { regionId, roundsRemaining: rounds, totalRounds: rounds, season: game.season, week: game.week };
  return { ok: true, message: `${scout.name} começou a observar talentos em ${region.name}.` };
}

function createProspect(game, scout, region, sequence) {
  const academy = ensureYouthAcademy(game);
  const random = randomFor(`${game.seed}:${game.season}:${game.week}:${scout.id}:${region.id}:${sequence}:${academy.nextProspectId}`);
  const club = game.clubs.find(item => item.id === game.userClubId);
  const age = 15 + Math.floor(random() * 4);
  const overall = clamp(Math.round(37 + (club.reputation ?? 60) * 0.13 + scout.experience * 1.7 + random() * 10), 42, 69);
  const regionBonus = scout.specialty === region.id ? 2 : 0;
  const potential = clamp(Math.max(overall + 4, Math.round(58 + scout.experience * 4 + regionBonus + random() * 16)), overall, 94);
  const country = pick(random, region.countries);
  const id = `academy-${game.season}-${academy.nextProspectId++}-${hash(`${scout.id}:${sequence}`)}`;
  const player = {
    id,
    name: `${pick(random, region.first)} ${pick(random, region.last)}`,
    position: pick(random, POSITIONS),
    country,
    age,
    overall,
    potential,
    form: 65,
    morale: 75,
    salary: Math.round((overall ** 2 * 1.25) / 100) * 100,
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
    development: 0,
    academy: { discoveredSeason: game.season, discoveredWeek: game.week, regionId: region.id, scoutId: scout.id, scoutExperience: scout.experience },
    source: { country, position: "BASE", star: false, starter: false }
  };
  player.value = playerValue(player);
  return player;
}

function finishMission(game, scout) {
  const academy = ensureYouthAcademy(game);
  const region = SCOUT_REGIONS.find(item => item.id === scout.mission.regionId);
  const random = randomFor(`${game.seed}:${game.season}:${game.week}:${scout.id}:quantity`);
  const quantity = Math.min(4, Math.ceil(scout.experience / 2) + Number(random() < 0.35 + scout.experience * 0.05));
  const space = Math.max(0, 18 - academy.prospects.length);
  const prospects = Array.from({ length: Math.min(quantity, space) }, (_, index) => createProspect(game, scout, region, index));
  academy.prospects.push(...prospects);
  scout.mission = null;
  academy.scouts = academy.scouts.filter(item => item.id !== scout.id);
  game.news.unshift({
    id: `academy-${game.season}-${game.week}-${scout.id}`,
    type: prospects.length ? "positive" : "info",
    title: prospects.length ? `${scout.name} encontrou ${prospects.length} talento${prospects.length === 1 ? "" : "s"}` : "A base está lotada",
    body: prospects.length ? `A observação em ${region.name} foi concluída. Analise os jovens na Categoria de base. O contrato temporário do olheiro foi encerrado.` : "Libere ou promova atletas antes de receber novos relatórios. O contrato temporário do olheiro foi encerrado."
  });
  game.news = game.news.slice(0, 200);
}

export function advanceYouthAcademy(game) {
  const academy = ensureYouthAcademy(game);
  const club = game.clubs.find(item => item.id === game.userClubId);
  const scoutPayroll = academy.scouts.reduce((total, scout) => total + scout.salary, 0);
  club.budget -= scoutPayroll;
  recordSeasonFinance(game, club.id, "olheiros", scoutPayroll, "expense");
  academy.scoutMarketTime += 1;
  refreshScoutMarket(game);
  const completed = [];
  for (const scout of academy.scouts) {
    if (!scout.mission) continue;
    scout.mission.roundsRemaining -= 1;
    if (scout.mission.roundsRemaining <= 0) completed.push(scout);
  }
  completed.forEach(scout => finishMission(game, scout));
}

export function academyPotentialRange(prospect) {
  const precision = Math.max(2, 7 - (prospect.academy?.scoutExperience ?? 1));
  return [clamp(prospect.potential - precision, prospect.overall, 94), clamp(prospect.potential + precision, prospect.overall, 94)];
}

export function sortYouthProspects(prospects, key = "potential", direction = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  return [...prospects].sort((first, second) => {
    const firstValue = key === "name" || key === "position" ? first[key] || "" : first[key] ?? 0;
    const secondValue = key === "name" || key === "position" ? second[key] || "" : second[key] ?? 0;
    const comparison = typeof firstValue === "string" ? firstValue.localeCompare(secondValue, "pt-BR") : firstValue - secondValue;
    return comparison * factor || first.name.localeCompare(second.name, "pt-BR") || first.id.localeCompare(second.id);
  });
}

export function promoteProspect(game, prospectId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de promover um atleta." };
  const academy = ensureYouthAcademy(game);
  const index = academy.prospects.findIndex(player => player.id === prospectId);
  if (index < 0) return { ok: false, message: "Talento não encontrado na categoria de base." };
  const player = academy.prospects[index];
  if (player.age < 16) return { ok: false, message: "O atleta precisa completar 16 anos para assinar contrato profissional." };
  const club = game.clubs.find(item => item.id === game.userClubId);
  const limit = game.leagues ? 40 : 24;
  if (club.squad.length >= limit) return { ok: false, message: `O elenco principal atingiu o limite de ${limit} atletas.` };
  academy.prospects.splice(index, 1);
  player.contractEndSeason = game.season + 3;
  player.academyGraduate = { ...player.academy, promotedSeason: game.season, promotedWeek: game.week };
  delete player.academy;
  club.squad.push(player);
  return { ok: true, message: `${player.name} assinou o primeiro contrato profissional.` };
}

export function releaseProspect(game, prospectId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de dispensar um atleta." };
  const academy = ensureYouthAcademy(game);
  const index = academy.prospects.findIndex(player => player.id === prospectId);
  if (index < 0) return { ok: false, message: "Talento não encontrado na categoria de base." };
  const [player] = academy.prospects.splice(index, 1);
  return { ok: true, message: `${player.name} foi dispensado da categoria de base.` };
}

export function ageYouthAcademy(game) {
  const academy = ensureYouthAcademy(game);
  const released = [];
  for (const player of academy.prospects) {
    player.age += 1;
    const random = randomFor(`${game.seed}:${game.season}:${player.id}:training`);
    player.overall = Math.min(player.potential, player.overall + 1 + Math.floor(random() * (player.age <= 18 ? 3 : 2)));
    player.value = playerValue(player);
    if (player.age > 20) released.push(player);
  }
  academy.prospects = academy.prospects.filter(player => player.age <= 20);
  if (released.length) {
    game.news.unshift({ id: `academy-release-${game.season}`, type: "info", title: `${released.length} atleta${released.length === 1 ? " deixou" : "s deixaram"} a base`, body: "Jogadores acima da idade da categoria foram liberados ao fim da temporada." });
    game.news = game.news.slice(0, 200);
  }
}
