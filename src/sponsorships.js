import { recordSeasonFinance } from "./season-tracking.js";
import { fanbaseProfile } from "./fans.js";

export const SPONSOR_SLOTS = [
  { id: "master", label: "Patrocínio master", placement: "Centro da camisa", factor: 1 },
  { id: "back", label: "Patrocínio nas costas", placement: "Parte inferior das costas", factor: 0.55 },
  { id: "sleeve", label: "Patrocínio de manga", placement: "Manga da camisa", factor: 0.35 }
];

export const SPONSOR_BRANDS = [
  { name: "Emirates", category: "Companhia aérea", minScore: 75 },
  { name: "Qatar Airways", category: "Companhia aérea", minScore: 72 },
  { name: "Etihad Airways", category: "Companhia aérea", minScore: 68 },
  { name: "Turkish Airlines", category: "Companhia aérea", minScore: 60 },
  { name: "LATAM Airlines", category: "Companhia aérea", minScore: 52 },
  { name: "Iberia", category: "Companhia aérea", minScore: 50 },
  { name: "GOL Linhas Aéreas", category: "Companhia aérea", minScore: 45 },
  { name: "Azul", category: "Companhia aérea", minScore: 45 },
  { name: "Spotify", category: "Tecnologia", minScore: 65 },
  { name: "Microsoft", category: "Tecnologia", minScore: 78 },
  { name: "Google", category: "Tecnologia", minScore: 80 },
  { name: "Amazon", category: "Tecnologia", minScore: 75 },
  { name: "Samsung", category: "Tecnologia", minScore: 65 },
  { name: "Sony", category: "Tecnologia", minScore: 65 },
  { name: "PlayStation", category: "Tecnologia", minScore: 60 },
  { name: "Snapdragon", category: "Tecnologia", minScore: 60 },
  { name: "HP", category: "Tecnologia", minScore: 55 },
  { name: "Lenovo", category: "Tecnologia", minScore: 50 },
  { name: "Motorola", category: "Tecnologia", minScore: 50 },
  { name: "TCL", category: "Tecnologia", minScore: 45 },
  { name: "Coca-Cola", category: "Bebidas", minScore: 60 },
  { name: "Pepsi", category: "Bebidas", minScore: 58 },
  { name: "Heineken", category: "Bebidas", minScore: 58 },
  { name: "Budweiser", category: "Bebidas", minScore: 58 },
  { name: "Carlsberg", category: "Bebidas", minScore: 52 },
  { name: "Amstel", category: "Bebidas", minScore: 48 },
  { name: "Brahma", category: "Bebidas", minScore: 45 },
  { name: "Red Bull", category: "Bebidas", minScore: 65 },
  { name: "Monster Energy", category: "Bebidas", minScore: 55 },
  { name: "BMW", category: "Automóveis", minScore: 70 },
  { name: "Audi", category: "Automóveis", minScore: 68 },
  { name: "Mercedes-Benz", category: "Automóveis", minScore: 72 },
  { name: "Toyota", category: "Automóveis", minScore: 60 },
  { name: "Hyundai", category: "Automóveis", minScore: 55 },
  { name: "Volkswagen", category: "Automóveis", minScore: 55 },
  { name: "BYD", category: "Automóveis", minScore: 55 },
  { name: "Chevrolet", category: "Automóveis", minScore: 50 },
  { name: "Ford", category: "Automóveis", minScore: 50 },
  { name: "Jeep", category: "Automóveis", minScore: 48 },
  { name: "Nissan", category: "Automóveis", minScore: 48 },
  { name: "Renault", category: "Automóveis", minScore: 45 },
  { name: "Fiat", category: "Automóveis", minScore: 45 },
  { name: "Visa", category: "Serviços financeiros", minScore: 65 },
  { name: "Mastercard", category: "Serviços financeiros", minScore: 65 },
  { name: "American Express", category: "Serviços financeiros", minScore: 65 },
  { name: "Standard Chartered", category: "Banco", minScore: 60 },
  { name: "Barclays", category: "Banco", minScore: 58 },
  { name: "Santander", category: "Banco", minScore: 55 },
  { name: "Itaú", category: "Banco", minScore: 50 },
  { name: "Nubank", category: "Banco", minScore: 50 },
  { name: "Banco do Brasil", category: "Banco", minScore: 45 },
  { name: "Caixa", category: "Banco", minScore: 45 },
  { name: "Mercado Pago", category: "Serviços financeiros", minScore: 45 },
  { name: "PicPay", category: "Serviços financeiros", minScore: 40 },
  { name: "Inter", category: "Banco", minScore: 40 }
];

const LEGACY_SPONSOR_NAMES = new Set([
  "Nexora", "Vértice", "Aurora", "Pulsar", "Atlas", "Movvi", "Orbe", "Kairo",
  "Lumina", "Avanti", "Tera", "Voltz", "Prisma", "Nobre", "Ritmo", "Croma",
  "Brava", "Elo", "Forte", "Zênite", "Viva", "Nativa", "Atria", "Lince"
]);

const OFFER_PROFILES = [
  { id: "season", label: "Pagamento por temporada", paymentSchedule: "season", roundFactor: 0.94, objective: "topHalf", fanTarget: 70, bonusRounds: 2 },
  { id: "weekly", label: "Pagamento semanal", paymentSchedule: "weekly", roundFactor: 1, objective: "topFour", fanTarget: 80, bonusRounds: 5 },
  { id: "turn", label: "Pagamento por turno", paymentSchedule: "turn", roundFactor: 1.04, objective: "champion", fanTarget: 90, bonusRounds: 10 }
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

function clubDepth(club) {
  const leadingPlayers = [...club.squad].sort((first, second) => second.overall - first.overall).slice(0, 18);
  return leadingPlayers.reduce((total, player) => total + player.overall, 0) / Math.max(1, leadingPlayers.length);
}

function leagueClubs(game) {
  const ids = userLeague(game)?.clubIds;
  return ids?.length ? ids.map(id => game.clubs.find(club => club.id === id)).filter(Boolean) : game.clubs;
}

export function sponsorshipCommercialProfile(game) {
  const club = userClub(game);
  const competitors = leagueClubs(game);
  const squadQuality = clubQuality(club);
  const depthQuality = clubDepth(club);
  const strength = squadQuality * 0.72 + depthQuality * 0.28;
  const leagueStrengths = competitors.map(item => clubQuality(item));
  const leagueAverage = leagueStrengths.reduce((total, value) => total + value, 0) / Math.max(1, leagueStrengths.length);
  const table = [...(userLeague(game)?.table || game.table || [])].sort((first, second) => second.points - first.points || (second.gf - second.ga) - (first.gf - first.ga));
  const row = table.find(item => item.clubId === club.id);
  const position = Math.max(1, table.findIndex(item => item.clubId === club.id) + 1);
  const tableMomentum = row?.played ? ((table.length - position) / Math.max(1, table.length - 1) - 0.5) * 20 : 0;
  const titlePotential = clamp(Math.round(50 + (strength - leagueAverage) * 6 + tableMomentum), 5, 95);
  const fanbase = fanbaseProfile(club);
  const supporters = fanbase.supporters;
  const supporterScore = clamp(Math.round(25 + Math.log10(Math.max(1, supporters) / 50_000) * 24), 20, 100);
  const latestSeason = club.history?.at(-1);
  const recentPerformance = latestSeason?.position === 1 ? 1.15 : latestSeason?.position <= 4 ? 1.08 : latestSeason?.position ? 0.98 : 1;
  const rawPayment = 15_000
    + Math.max(0, squadQuality - 45) ** 2 * 120
    + Math.max(0, depthQuality - 45) ** 2 * 50
    + titlePotential * 500
    + club.reputation * 250
    + club.fanMorale * 150
    + club.stadium.capacity * 1.5
    + supporters * 0.018;
  return {
    squadQuality: Math.round(squadQuality),
    depthQuality: Math.round(depthQuality),
    titlePotential,
    stadiumCapacity: club.stadium.capacity,
    supporters,
    estimatedSupporters: supporters,
    supporterGrowth: fanbase.seasonChange,
    fanMorale: club.fanMorale,
    commercialScore: clamp(Math.round(
      squadQuality * 0.2
      + depthQuality * 0.1
      + titlePotential * 0.25
      + Math.min(100, club.stadium.capacity / 700) * 0.15
      + supporterScore * 0.2
      + club.fanMorale * 0.1
    ), 35, 95),
    basePayment: Math.max(20_000, Math.round(rawPayment * recentPerformance / 1000) * 1000)
  };
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

export function sponsorGoalLabel(game, goal) {
  if (goal.type === "fanMorale") return `Encerrar a temporada com moral da torcida em ${goal.target} ou mais`;
  return sponsorObjectiveLabel(game, goal.objective);
}

export function sponsorPaymentLabel(game, contract) {
  const fixedValue = contract.fixedValue ?? contract.roundPayment * Math.max(0, game.schedule.length - (contract.signedWeek ?? game.week));
  if (contract.paymentSchedule === "season") return `${fixedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} na assinatura`;
  if (contract.paymentSchedule === "turn") {
    const installments = contract.turnPayments?.length || (game.week < Math.ceil(game.schedule.length / 2) ? 2 : 1);
    return `${installments} ${installments === 1 ? "parcela" : "parcelas"} por turno · total ${fixedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`;
  }
  return `${contract.roundPayment.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} por semana (rodada)`;
}

function sponsorBasePayment(game) {
  return sponsorshipCommercialProfile(game).basePayment;
}

function selectSponsorBrand(game, key, usedNames = new Set()) {
  const score = sponsorshipCommercialProfile(game).commercialScore;
  const eligible = SPONSOR_BRANDS.filter(brand => brand.minScore <= Math.max(45, score));
  const preferred = eligible.filter(brand => brand.minScore >= Math.max(40, score - 30));
  const pool = preferred.length >= 9 ? preferred : eligible;
  let index = Math.floor(sponsorRoll(key) * pool.length);
  for (let attempts = 0; attempts < pool.length && usedNames.has(pool[index].name); attempts += 1) index = (index + 1) % pool.length;
  return pool[index];
}

function generateOffers(game) {
  const basePayment = sponsorBasePayment(game);
  const usedNames = new Set();
  return SPONSOR_SLOTS.flatMap((slot, slotIndex) => OFFER_PROFILES.map((profile, profileIndex) => {
    const key = `${game.seed}:${game.season}:${Math.floor(game.week / 4)}:${slot.id}:${profile.id}`;
    const brand = selectSponsorBrand(game, key, usedNames);
    usedNames.add(brand.name);
    const variation = 0.92 + sponsorRoll(`${key}:value`) * 0.16;
    const roundPayment = Math.max(5_000, Math.round(basePayment * slot.factor * profile.roundFactor * variation / 1000) * 1000);
    const totalBonus = roundPayment * profile.bonusRounds;
    const positionBonus = Math.round(totalBonus * 0.65 / 1000) * 1000;
    return {
      id: `sponsor-${game.season}-${slotIndex}-${profileIndex}`,
      name: brand.name,
      brandCategory: brand.category,
      slot: slot.id,
      profile: profile.id,
      profileLabel: profile.label,
      paymentSchedule: profile.paymentSchedule,
      roundPayment,
      objective: profile.objective,
      goals: [
        { id: "position", type: "position", objective: profile.objective, bonus: positionBonus },
        { id: "fanMorale", type: "fanMorale", target: profile.fanTarget, bonus: totalBonus - positionBonus }
      ],
      bonus: totalBonus,
      endSeason: game.season
    };
  }));
}

function normalizeContractGoals(contract) {
  contract.paymentSchedule ??= "weekly";
  contract.goals ??= [{ id: "position", type: "position", objective: contract.objective || "topHalf", bonus: contract.bonus || 0 }];
  contract.bonus = contract.goals.reduce((total, goal) => total + goal.bonus, 0);
  contract.fixedPaid ??= contract.paymentSchedule === "weekly" ? contract.totalPaid || 0 : 0;
  contract.totalPaid ??= 0;
  contract.paymentHistory ??= [];
  return contract;
}

function migrateLegacySponsorBrands(game) {
  const usedNames = new Set();
  Object.values(game.sponsorships?.contracts || {}).forEach((contract, index) => {
    if (LEGACY_SPONSOR_NAMES.has(contract.name)) {
      const previousName = contract.name;
      const brand = selectSponsorBrand(game, `${game.seed}:${game.season}:legacy:${contract.slot}:${index}`, usedNames);
      contract.name = brand.name;
      contract.brandCategory = brand.category;
      game.news = (game.news || []).map(item => ({
        ...item,
        title: item.title?.replaceAll(previousName, brand.name),
        body: item.body?.replaceAll(previousName, brand.name)
      }));
    }
    usedNames.add(contract.name);
  });
}

function syncClubSponsors(game) {
  const club = userClub(game);
  if (club) club.sponsors = { ...(game.sponsorships?.contracts || {}) };
}

export function ensureSponsorships(game) {
  const offerCycle = Math.floor(game.week / 4);
  if (!game.sponsorships || game.sponsorships.season !== game.season) {
    game.sponsorships = { version: 4, season: game.season, offerCycle, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history: game.sponsorships?.history || [] };
  } else if (game.sponsorships.version !== 4) {
    Object.values(game.sponsorships.contracts || {}).forEach(normalizeContractGoals);
    migrateLegacySponsorBrands(game);
    const occupiedSlots = new Set(Object.keys(game.sponsorships.contracts || {}));
    game.sponsorships.offers = generateOffers(game).filter(offer => !occupiedSlots.has(offer.slot));
    game.sponsorships.version = 4;
    game.sponsorships.offerCycle = offerCycle;
  } else if (game.sponsorships.offerCycle !== offerCycle) {
    const occupiedSlots = new Set(Object.keys(game.sponsorships.contracts || {}));
    game.sponsorships.offers = generateOffers(game).filter(offer => !occupiedSlots.has(offer.slot));
    game.sponsorships.offerCycle = offerCycle;
  }
  game.sponsorships.offers ??= generateOffers(game);
  game.sponsorships.contracts ??= {};
  Object.values(game.sponsorships.contracts).forEach(normalizeContractGoals);
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
  const remainingRounds = Math.max(0, game.schedule.length - game.week);
  const fixedValue = offer.roundPayment * remainingRounds;
  const milestones = [Math.ceil(game.schedule.length / 2), game.schedule.length].filter(round => round > game.week);
  const turnPayments = offer.paymentSchedule === "turn" ? milestones.map((round, index) => ({
    round,
    amount: index === milestones.length - 1 ? fixedValue - Math.floor(fixedValue / milestones.length) * index : Math.floor(fixedValue / milestones.length),
    paid: false
  })) : [];
  const contract = normalizeContractGoals({ ...offer, signedWeek: game.week, fixedValue, fixedPaid: 0, totalPaid: 0, turnPayments });
  state.contracts[offer.slot] = contract;
  state.offers = state.offers.filter(item => item.slot !== offer.slot);
  if (contract.paymentSchedule === "season") creditSponsorPayment(game, contract, fixedValue, "season");
  syncClubSponsors(game);
  const slot = SPONSOR_SLOTS.find(item => item.id === offer.slot);
  game.news.unshift({ id: `sponsor-sign-${game.season}-${offer.slot}`, type: "positive", title: `${offer.name} é o novo ${slot.label.toLocaleLowerCase("pt-BR")}`, body: `O contrato rende ${offer.roundPayment.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} por rodada e pode pagar bônus por desempenho.` });
  return { ok: true, message: `Contrato com ${offer.name} assinado até o fim da temporada.${contract.paymentSchedule === "season" ? ` ${fixedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} foram creditados.` : ""}` };
}

function creditSponsorPayment(game, contract, amount, type) {
  if (amount <= 0) return 0;
  const club = userClub(game);
  club.budget += amount;
  contract.fixedPaid += amount;
  contract.totalPaid += amount;
  contract.paymentHistory.push({ season: game.season, week: game.week, type, amount });
  recordSeasonFinance(game, club.id, "patrocinios", amount, "income");
  return amount;
}

export function processSponsorshipRound(game, results) {
  if (!userClub(game)) return 0;
  const state = ensureSponsorships(game);
  const played = results.some(result => result.homeId === game.userClubId || result.awayId === game.userClubId);
  const key = `${game.season}:${game.week}`;
  if (state.paidRoundKeys.includes(key)) return 0;
  const contracts = Object.values(state.contracts);
  const completedRound = game.week + 1;
  const total = contracts.reduce((sum, contract) => {
    if (contract.paymentSchedule === "weekly") return sum + (played ? creditSponsorPayment(game, contract, contract.roundPayment, "weekly") : 0);
    if (contract.paymentSchedule === "turn") {
      const payment = contract.turnPayments.find(item => item.round === completedRound && !item.paid);
      if (!payment) return sum;
      payment.paid = true;
      return sum + creditSponsorPayment(game, contract, payment.amount, "turn");
    }
    return sum;
  }, 0);
  if (!total) return 0;
  state.paidRoundKeys.push(key);
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
  const row = sortedUserLeagueTable(game).find(item => item.clubId === game.userClubId);
  const records = Object.values(state.contracts).map(contract => {
    const goalResults = contract.goals.map(goal => {
      const achieved = goal.type === "fanMorale"
        ? club.fanMorale >= goal.target
        : position > 0 && position <= objectiveTarget(game, goal.objective);
      if (achieved) {
        club.budget += goal.bonus;
        contract.totalPaid += goal.bonus;
        recordSeasonFinance(game, club.id, "patrocinios", goal.bonus, "income");
      }
      return { ...goal, achieved, label: sponsorGoalLabel(game, goal) };
    });
    const bonusPaid = goalResults.filter(goal => goal.achieved).reduce((total, goal) => total + goal.bonus, 0);
    const achieved = goalResults.every(goal => goal.achieved);
    game.news.unshift({ id: `sponsor-result-${game.season}-${contract.slot}`, type: bonusPaid ? "positive" : "info", title: bonusPaid ? `Metas da ${contract.name} renderam bônus` : `Contrato com ${contract.name} encerrado`, body: bonusPaid ? `${goalResults.filter(goal => goal.achieved).length} de ${goalResults.length} metas foram alcançadas. O clube recebeu ${bonusPaid.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.` : "Nenhuma meta extra foi alcançada; não houve bônus." });
    return { ...contract, achieved, bonusPaid, goalResults, position, wins: row?.wins || 0, season: game.season };
  });
  state.history.unshift(...records);
  state.history = state.history.slice(0, 30);
  state.settledSeason = game.season;
  return records;
}

export function startSponsorshipSeason(game) {
  const history = game.sponsorships?.history || [];
  game.sponsorships = { version: 4, season: game.season, offerCycle: 0, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history };
  syncClubSponsors(game);
  game.news.unshift({ id: `sponsor-market-${game.season}`, type: "info", title: "Novas propostas de patrocínio", body: "Empresas apresentaram contratos para os espaços master, costas e manga da camisa." });
  return game.sponsorships;
}
