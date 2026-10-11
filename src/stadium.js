import { recordStadiumExpansion } from "./fans.js";
import { recordSeasonFinance } from "./season-tracking.js";

export const STADIUM_SECTORS = [
  { id: "stands", label: "Arquibancada", share: 0.82, priceFactor: 1, referencePrice: 38, minPrice: 10, maxPrice: 180, addedCapacity: 5_000, maxCapacity: 150_000 },
  { id: "premium", label: "Área premium", share: 0.15, priceFactor: 2.4, referencePrice: 95, minPrice: 40, maxPrice: 450, addedCapacity: 1_000, maxCapacity: 30_000 },
  { id: "boxes", label: "Camarotes", share: 0.03, priceFactor: 5.5, referencePrice: 240, minPrice: 100, maxPrice: 1_200, addedCapacity: 200, maxCapacity: 8_000 }
];

export const STADIUM_FACILITIES = [
  { id: "medical", label: "Departamento médico", description: "Reduz o risco e o tempo de recuperação das lesões.", maxLevel: 5, baseCost: 7_000_000, baseRounds: 5 },
  { id: "restaurants", label: "Restaurantes", description: "Gera receita de alimentação nos jogos em casa.", maxLevel: 5, baseCost: 4_500_000, baseRounds: 4 },
  { id: "store", label: "Loja do clube", description: "Vende produtos em dias de jogo e durante toda a temporada.", maxLevel: 5, baseCost: 5_500_000, baseRounds: 4 }
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function userClub(game) {
  return game.clubs.find(club => club.id === game.userClubId);
}

function splitCapacity(stadium) {
  const total = Math.max(1_000, Math.round(stadium.capacity || 10_000));
  const stands = Math.round(total * STADIUM_SECTORS[0].share);
  const premium = Math.round(total * STADIUM_SECTORS[1].share);
  return { stands, premium, boxes: total - stands - premium };
}

function ensureClubStadium(club) {
  const stadium = club.stadium;
  const capacities = splitCapacity(stadium);
  stadium.sectors ??= {};
  STADIUM_SECTORS.forEach(sector => {
    stadium.sectors[sector.id] ??= {
      capacity: capacities[sector.id],
      ticketPrice: Math.round((stadium.ticketPrice || sector.referencePrice) * sector.priceFactor),
      level: 1
    };
    stadium.sectors[sector.id].capacity = Math.max(0, Math.round(stadium.sectors[sector.id].capacity));
    stadium.sectors[sector.id].ticketPrice = clamp(Math.round(stadium.sectors[sector.id].ticketPrice), sector.minPrice, sector.maxPrice);
    stadium.sectors[sector.id].level ??= 1;
  });
  stadium.facilities ??= { medical: { level: 1 }, restaurants: { level: 0 }, store: { level: 0 } };
  STADIUM_FACILITIES.forEach(facility => {
    stadium.facilities[facility.id] ??= { level: facility.id === "medical" ? 1 : 0 };
    stadium.facilities[facility.id].level = clamp(Math.round(stadium.facilities[facility.id].level || 0), 0, facility.maxLevel);
  });
  stadium.capacity = Object.values(stadium.sectors).reduce((total, sector) => total + sector.capacity, 0);
  stadium.ticketPrice = stadium.sectors.stands.ticketPrice;
  stadium.construction ??= null;
  return stadium;
}

export function ensureStadiumOperations(game) {
  game.clubs.forEach(ensureClubStadium);
  return userClub(game)?.stadium;
}

export function stadiumExpansionQuote(club, sectorId = "stands") {
  const stadium = ensureClubStadium(club);
  const definition = STADIUM_SECTORS.find(sector => sector.id === sectorId);
  if (!definition) return null;
  const sector = stadium.sectors[sectorId];
  const atMaximum = sector.capacity + definition.addedCapacity > definition.maxCapacity;
  const multiplier = 1.58 ** Math.max(0, sector.level - 1);
  const baseCost = { stands: 6_000_000, premium: 7_500_000, boxes: 9_000_000 }[sectorId];
  return {
    id: `expand:${sectorId}`,
    type: "expansion",
    sectorId,
    label: `Ampliar ${definition.label.toLocaleLowerCase("pt-BR")}`,
    addedCapacity: definition.addedCapacity,
    targetLevel: sector.level + 1,
    rounds: 4 + Math.floor(sector.level / 2),
    cost: Math.round((baseCost * multiplier + stadium.capacity * 55) / 100_000) * 100_000,
    available: !atMaximum
  };
}

export function stadiumFacilityQuote(club, facilityId) {
  const stadium = ensureClubStadium(club);
  const definition = STADIUM_FACILITIES.find(facility => facility.id === facilityId);
  if (!definition) return null;
  const level = stadium.facilities[facilityId].level;
  return {
    id: `facility:${facilityId}`,
    type: "facility",
    facilityId,
    label: `Melhorar ${definition.label.toLocaleLowerCase("pt-BR")}`,
    targetLevel: level + 1,
    rounds: definition.baseRounds + level,
    cost: Math.round(definition.baseCost * 1.7 ** level / 100_000) * 100_000,
    available: level < definition.maxLevel
  };
}

export function startStadiumProject(game, projectId) {
  const club = userClub(game);
  const stadium = ensureClubStadium(club);
  if (game.activeMatch) return { ok: false, message: "Conclua a partida antes de iniciar uma obra." };
  if (game.finished) return { ok: false, message: "Inicie a próxima temporada antes de começar uma obra." };
  if (stadium.construction) return { ok: false, message: `A obra “${stadium.construction.label}” ainda está em andamento.` };
  const [type, id] = String(projectId).split(":");
  const quote = type === "expand" ? stadiumExpansionQuote(club, id) : type === "facility" ? stadiumFacilityQuote(club, id) : null;
  if (!quote) return { ok: false, message: "Projeto de estádio inválido." };
  if (!quote.available) return { ok: false, message: "Esta estrutura já atingiu o limite de expansão." };
  if (club.budget < quote.cost) return { ok: false, message: "O caixa não cobre esta obra." };
  club.budget -= quote.cost;
  recordSeasonFinance(game, club.id, "estadio", quote.cost, "expense");
  stadium.construction = { ...quote, startedSeason: game.season, startedWeek: game.week, roundsRemaining: quote.rounds };
  game.news.unshift({ id: `stadium-project-${game.season}-${game.week}-${quote.id}`, type: "info", title: `${quote.label} começou`, body: `A obra custou ${quote.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} e deve terminar em ${quote.rounds} rodadas.` });
  return { ok: true, message: `Obra iniciada. Conclusão prevista em ${quote.rounds} rodadas.` };
}

export function processStadiumRound(game) {
  const club = userClub(game);
  const stadium = ensureClubStadium(club);
  const project = stadium.construction;
  if (!project) return null;
  project.roundsRemaining = Math.max(0, project.roundsRemaining - 1);
  if (project.roundsRemaining) return project;
  if (project.type === "expansion") {
    const sector = stadium.sectors[project.sectorId];
    sector.capacity += project.addedCapacity;
    sector.level = project.targetLevel;
    stadium.capacity += project.addedCapacity;
    recordStadiumExpansion(game, club, project.addedCapacity);
  } else {
    stadium.facilities[project.facilityId].level = project.targetLevel;
  }
  game.news.unshift({ id: `stadium-complete-${game.season}-${game.week}-${project.id}`, type: "positive", title: `${project.label} foi concluída`, body: project.type === "expansion" ? `A capacidade do estádio agora é de ${stadium.capacity.toLocaleString("pt-BR")} lugares.` : `A instalação chegou ao nível ${project.targetLevel}.` });
  stadium.construction = null;
  return null;
}

export function setStadiumTicketPrice(game, sectorId, price) {
  const club = userClub(game);
  const stadium = ensureClubStadium(club);
  const definition = STADIUM_SECTORS.find(sector => sector.id === sectorId);
  if (!definition || !Number.isFinite(price)) return { ok: false, message: "Preço inválido." };
  stadium.sectors[sectorId].ticketPrice = clamp(Math.round(price), definition.minPrice, definition.maxPrice);
  if (sectorId === "stands") stadium.ticketPrice = stadium.sectors.stands.ticketPrice;
  return { ok: true, message: `Preço de ${definition.label.toLocaleLowerCase("pt-BR")} atualizado.` };
}

function sectorProjection(club, definition) {
  const stadium = ensureClubStadium(club);
  const sector = stadium.sectors[definition.id];
  const reach = Math.min(1, (club.fanbase?.supporters || stadium.capacity * 20) / Math.max(1, stadium.capacity * 18));
  const engagement = clamp(((club.fanMorale || 50) + (club.reputation || 50)) / 145, 0.45, 1.15);
  const priceEffect = clamp((definition.referencePrice / sector.ticketPrice) ** (definition.id === "stands" ? 0.58 : 0.42), 0.5, 1.2);
  const occupancy = clamp(reach * engagement * priceEffect, 0.3, 1);
  const attendance = Math.round(sector.capacity * occupancy);
  return { id: definition.id, label: definition.label, capacity: sector.capacity, ticketPrice: sector.ticketPrice, occupancy, attendance, income: attendance * sector.ticketPrice };
}

export function stadiumRevenueProjection(game, club = userClub(game), homeMatch = true) {
  ensureClubStadium(club);
  const sectors = STADIUM_SECTORS.map(definition => sectorProjection(club, definition));
  const attendance = homeMatch ? sectors.reduce((total, sector) => total + sector.attendance, 0) : 0;
  const gate = homeMatch ? sectors.reduce((total, sector) => total + sector.income, 0) : 0;
  const restaurantsLevel = club.stadium.facilities.restaurants.level;
  const storeLevel = club.stadium.facilities.store.level;
  const restaurants = homeMatch ? Math.round(attendance * 2.6 * restaurantsLevel) : 0;
  const store = Math.round((homeMatch ? attendance * 1.1 * storeLevel : 0) + (club.fanbase?.supporters || 0) * 0.0015 * storeLevel);
  return { sectors, attendance, gate, restaurants, store, commercial: restaurants + store, total: gate + restaurants + store };
}

export function medicalInjuryRisk(club) {
  const level = ensureClubStadium(club).facilities.medical.level;
  return Math.max(0.6, 1 - level * 0.08);
}

export function medicalRecoveryReduction(club) {
  const level = ensureClubStadium(club).facilities.medical.level;
  return level >= 5 ? 2 : level >= 3 ? 1 : 0;
}
