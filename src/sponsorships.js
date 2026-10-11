import { recordSeasonFinance } from "./season-tracking.js";

export const SPONSOR_SLOTS = [
  { id: "master", label: "Patrocínio master", placement: "Centro da camisa", factor: 1 },
  { id: "back", label: "Patrocínio nas costas", placement: "Parte inferior das costas", factor: 0.55 },
  { id: "sleeve", label: "Patrocínio de manga", placement: "Manga da camisa", factor: 0.35 }
];

const SPONSOR_NAMES = [
  "Nexora", "Vértice", "Aurora", "Pulsar", "Atlas", "Movvi", "Orbe", "Kairo",
  "Lumina", "Avanti", "Tera", "Voltz", "Prisma", "Nobre", "Ritmo", "Croma",
  "Brava", "Elo", "Forte", "Zênite", "Viva", "Nativa", "Atria", "Lince"
];

const OFFER_PROFILES = [
  { id: "safe", label: "Contrato seguro", roundFactor: 1, objective: "topHalf", bonusRounds: 2 },
  { id: "balanced", label: "Contrato equilibrado", roundFactor: 0.88, objective: "topFour", bonusRounds: 5 },
  { id: "ambitious", label: "Contrato ambicioso", roundFactor: 0.72, objective: "champion", bonusRounds: 10 }
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sponsorRoll(key) {
  let result = 2166136261;
  for (const character of String(key)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  result = Math.imul(result ^ result >>> 16, 0x45d9f3b);
  return ((result ^ result >>> 16) >>> 0) / 4294967296;
}

function userClub(game) {
  return game.clubs.find(club => club.id === game.userClubId);
}

function userLeague(game) {
  return game.leagues?.find(league => league.clubIds.includes(game.userClubId));
}

function clubQuality(club) {
  const leadingPlayers = [...club.squad].sort((first, second) => second.overall - first.overall).slice(0, 11);
  return leadingPlayers.reduce((total, player) => total + player.overall, 0) / Math.max(1, leadingPlayers.length);
}

function objectiveTarget(game, objective) {
  const clubs = userLeague(game)?.clubIds.length || game.clubs.length;
  if (objective === "champion") return 1;
  if (objective === "topFour") return Math.min(4, Math.max(1, Math.ceil(clubs * 0.25)));
  return Math.max(1, Math.ceil(clubs / 2));
}

export function sponsorObjectiveLabel(game, objective) {
  const target = objectiveTarget(game, objective);
  if (objective === "champion") return "Ser campeão";
  return `Terminar entre os ${target} primeiros`;
}

function sponsorBasePayment(game) {
  const club = userClub(game);
  const quality = clubQuality(club);
  const latestSeason = club.history?.at(-1);
  const performanceFactor = latestSeason?.position === 1 ? 1.25 : latestSeason?.position <= 4 ? 1.12 : 1;
  const base = 15_000 + club.reputation * 450 + club.fanMorale * 200 + Math.max(0, quality - 45) ** 2 * 180;
  return Math.max(20_000, Math.round(base * performanceFactor / 1000) * 1000);
}

function generateOffers(game) {
  const basePayment = sponsorBasePayment(game);
  const usedNames = new Set();
  return SPONSOR_SLOTS.flatMap((slot, slotIndex) => OFFER_PROFILES.map((profile, profileIndex) => {
    const key = `${game.seed}:${game.season}:${slot.id}:${profile.id}`;
    let nameIndex = Math.floor(sponsorRoll(key) * SPONSOR_NAMES.length);
    while (usedNames.has(SPONSOR_NAMES[nameIndex])) nameIndex = (nameIndex + 1) % SPONSOR_NAMES.length;
    const name = SPONSOR_NAMES[nameIndex];
    usedNames.add(name);
    const variation = 0.92 + sponsorRoll(`${key}:value`) * 0.16;
    const roundPayment = Math.max(5_000, Math.round(basePayment * slot.factor * profile.roundFactor * variation / 1000) * 1000);
    return {
      id: `sponsor-${game.season}-${slotIndex}-${profileIndex}`,
      name,
      slot: slot.id,
      profile: profile.id,
      profileLabel: profile.label,
      roundPayment,
      objective: profile.objective,
      bonus: roundPayment * profile.bonusRounds,
      endSeason: game.season
    };
  }));
}

function syncClubSponsors(game) {
  const club = userClub(game);
  if (club) club.sponsors = { ...(game.sponsorships?.contracts || {}) };
}

export function ensureSponsorships(game) {
  if (!game.sponsorships || game.sponsorships.season !== game.season) {
    game.sponsorships = { season: game.season, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history: game.sponsorships?.history || [] };
  }
  game.sponsorships.offers ??= generateOffers(game);
  game.sponsorships.contracts ??= {};
  game.sponsorships.paidRoundKeys ??= [];
  game.sponsorships.history ??= [];
  syncClubSponsors(game);
  return game.sponsorships;
}

export function signSponsor(game, offerId) {
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de assinar um patrocínio." };
  if (game.finished) return { ok: false, message: "Inicie a próxima temporada para negociar novos patrocínios." };
  const state = ensureSponsorships(game);
  const offer = state.offers.find(item => item.id === offerId);
  if (!offer) return { ok: false, message: "Esta proposta não está mais disponível." };
  if (state.contracts[offer.slot]) return { ok: false, message: "Este espaço da camisa já possui contrato até o fim da temporada." };
  const contract = { ...offer, signedWeek: game.week, totalPaid: 0 };
  state.contracts[offer.slot] = contract;
  state.offers = state.offers.filter(item => item.slot !== offer.slot);
  syncClubSponsors(game);
  const slot = SPONSOR_SLOTS.find(item => item.id === offer.slot);
  game.news.unshift({ id: `sponsor-sign-${game.season}-${offer.slot}`, type: "positive", title: `${offer.name} é o novo ${slot.label.toLocaleLowerCase("pt-BR")}`, body: `O contrato rende ${offer.roundPayment.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} por rodada e pode pagar bônus por desempenho.` });
  return { ok: true, message: `Contrato com ${offer.name} assinado até o fim da temporada.` };
}

export function processSponsorshipRound(game, results) {
  const state = ensureSponsorships(game);
  if (!results.some(result => result.homeId === game.userClubId || result.awayId === game.userClubId)) return 0;
  const key = `${game.season}:${game.week}`;
  if (state.paidRoundKeys.includes(key)) return 0;
  const contracts = Object.values(state.contracts);
  const total = contracts.reduce((sum, contract) => sum + contract.roundPayment, 0);
  if (!total) return 0;
  const club = userClub(game);
  club.budget += total;
  contracts.forEach(contract => { contract.totalPaid += contract.roundPayment; });
  state.paidRoundKeys.push(key);
  recordSeasonFinance(game, club.id, "patrocinios", total, "income");
  return total;
}

function sortedUserLeagueTable(game) {
  const table = userLeague(game)?.table || game.table || [];
  return [...table].sort((first, second) => second.points - first.points || (second.gf - second.ga) - (first.gf - first.ga) || second.gf - first.gf);
}

export function finishSponsorshipSeason(game) {
  const state = ensureSponsorships(game);
  if (state.settledSeason === game.season) return [];
  const position = sortedUserLeagueTable(game).findIndex(row => row.clubId === game.userClubId) + 1;
  const club = userClub(game);
  const records = Object.values(state.contracts).map(contract => {
    const target = objectiveTarget(game, contract.objective);
    const achieved = position > 0 && position <= target;
    if (achieved) {
      club.budget += contract.bonus;
      contract.totalPaid += contract.bonus;
      recordSeasonFinance(game, club.id, "patrocinios", contract.bonus, "income");
    }
    game.news.unshift({ id: `sponsor-result-${game.season}-${contract.slot}`, type: achieved ? "positive" : "info", title: achieved ? `Bônus da ${contract.name} conquistado` : `Contrato com ${contract.name} encerrado`, body: achieved ? `A meta foi alcançada e o clube recebeu ${contract.bonus.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.` : `A meta “${sponsorObjectiveLabel(game, contract.objective)}” não foi alcançada; não houve bônus.` });
    return { ...contract, achieved, position, season: game.season };
  });
  state.history.unshift(...records);
  state.history = state.history.slice(0, 30);
  state.settledSeason = game.season;
  return records;
}

export function startSponsorshipSeason(game) {
  const history = game.sponsorships?.history || [];
  game.sponsorships = { season: game.season, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history };
  syncClubSponsors(game);
  game.news.unshift({ id: `sponsor-market-${game.season}`, type: "info", title: "Novas propostas de patrocínio", body: "Empresas apresentaram contratos para os espaços master, costas e manga da camisa." });
  return game.sponsorships;
}
