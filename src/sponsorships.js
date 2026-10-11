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
    const totalBonus = roundPayment * profile.bonusRounds;
    const positionBonus = Math.round(totalBonus * 0.65 / 1000) * 1000;
    return {
      id: `sponsor-${game.season}-${slotIndex}-${profileIndex}`,
      name,
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

function syncClubSponsors(game) {
  const club = userClub(game);
  if (club) club.sponsors = { ...(game.sponsorships?.contracts || {}) };
}

export function ensureSponsorships(game) {
  if (!game.sponsorships || game.sponsorships.season !== game.season) {
    game.sponsorships = { version: 2, season: game.season, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history: game.sponsorships?.history || [] };
  } else if (game.sponsorships.version !== 2) {
    Object.values(game.sponsorships.contracts || {}).forEach(normalizeContractGoals);
    const occupiedSlots = new Set(Object.keys(game.sponsorships.contracts || {}));
    game.sponsorships.offers = generateOffers(game).filter(offer => !occupiedSlots.has(offer.slot));
    game.sponsorships.version = 2;
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
  game.sponsorships = { version: 2, season: game.season, offers: generateOffers(game), contracts: {}, paidRoundKeys: [], history };
  syncClubSponsors(game);
  game.news.unshift({ id: `sponsor-market-${game.season}`, type: "info", title: "Novas propostas de patrocínio", body: "Empresas apresentaram contratos para os espaços master, costas e manga da camisa." });
  return game.sponsorships;
}
