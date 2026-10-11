import { recordSeasonFinance } from "./season-tracking.js";

const EUROPE = new Set(["DEU", "ENG", "ESP", "FRA", "ITA", "NLD", "PRT", "RUS", "TUR"]);
const SOUTH_AMERICA = new Set(["ARG", "BRA", "COL", "PRY", "URY"]);

const DEFINITIONS = [
  { id: "copa-brasil", name: "Copa do Brasil", countries: new Set(["BRA"]), format: "knockout", teams: 64, cadenceRounds: 7, championPrize: 80_000_000, winPrize: 1_500_000 },
  { id: "carabao-cup", name: "Carabao Cup", countries: new Set(["ENG"]), format: "knockout", teams: 32, cadenceRounds: 6, championPrize: 55_000_000, winPrize: 1_200_000 },
  { id: "copa-rei", name: "Copa da Espanha", countries: new Set(["ESP"]), format: "knockout", teams: 32, cadenceRounds: 6, championPrize: 60_000_000, winPrize: 1_300_000 },
  { id: "libertadores", name: "CONMEBOL Libertadores", countries: SOUTH_AMERICA, format: "groups", teams: 32, cadenceRounds: 11, championPrize: 140_000_000, winPrize: 2_500_000 },
  { id: "champions", name: "UEFA Champions League", countries: EUROPE, format: "league", teams: 36, offset: 0, cadenceRounds: 14, championPrize: 240_000_000, winPrize: 4_000_000 },
  { id: "europa-league", name: "UEFA Europa League", countries: EUROPE, format: "league", teams: 36, offset: 4, cadenceRounds: 14, championPrize: 150_000_000, winPrize: 2_800_000 }
];

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result ^ result >>> 16) >>> 0;
}

function clubStrength(club) {
  const players = [...club.squad].sort((first, second) => second.overall - first.overall).slice(0, 11);
  return players.reduce((total, player) => total + player.overall, 0) / Math.max(1, players.length);
}

function qualificationScore(club) {
  const latest = club.history?.at(-1);
  const placement = latest?.position ? Math.max(0, 30 - latest.position) * 2 : 0;
  return clubStrength(club) * 10 + (club.reputation || 50) * 2 + placement;
}

function freshTable(clubIds) {
  return clubIds.map(clubId => ({ clubId, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
}

function sortedTable(table) {
  return [...table].sort((first, second) => second.points - first.points || (second.gf - second.ga) - (first.gf - first.ga) || second.gf - first.gf || first.clubId.localeCompare(second.clubId));
}

function updateTable(table, result) {
  const home = table.find(row => row.clubId === result.homeId);
  const away = table.find(row => row.clubId === result.awayId);
  if (!home || !away) return;
  home.played += 1; away.played += 1;
  home.gf += result.homeGoals; home.ga += result.awayGoals;
  away.gf += result.awayGoals; away.ga += result.homeGoals;
  if (result.homeGoals > result.awayGoals) { home.wins += 1; home.points += 3; away.losses += 1; }
  else if (result.homeGoals < result.awayGoals) { away.wins += 1; away.points += 3; home.losses += 1; }
  else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
}

function roundRobinRounds(ids) {
  const rotation = [...ids];
  if (rotation.length % 2) rotation.push(null);
  const rounds = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const fixtures = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) fixtures.push(round % 2 ? { homeId: second, awayId: first } : { homeId: first, awayId: second });
    }
    rounds.push(fixtures);
    rotation.splice(1, 0, rotation.pop());
  }
  return rounds;
}

function knockoutFixtures(ids, key) {
  const ordered = [...ids].sort((first, second) => hash(`${key}:${first}`) - hash(`${key}:${second}`));
  return Array.from({ length: Math.floor(ordered.length / 2) }, (_, index) => ({ homeId: ordered[index], awayId: ordered[ordered.length - 1 - index] }));
}

function knockoutLabel(size) {
  if (size === 2) return "Final";
  if (size === 4) return "Semifinais";
  if (size === 8) return "Quartas de final";
  if (size === 16) return "Oitavas de final";
  if (size === 32) return "Segunda fase";
  return "Primeira fase";
}

function selectedClubs(game, definition) {
  const candidates = game.clubs.filter(club => definition.countries.has(club.country)).sort((first, second) => qualificationScore(second) - qualificationScore(first) || first.name.localeCompare(second.name, "pt-BR"));
  let selected;
  if (definition.countries.size > 1) {
    const countries = [...definition.countries];
    const basePlaces = Math.floor(definition.teams / countries.length);
    const extraPlaces = definition.teams % countries.length;
    selected = countries.flatMap((country, index) => {
      const places = basePlaces + Number(index < extraPlaces);
      const offset = definition.offset || 0;
      return candidates.filter(club => club.country === country).slice(offset, offset + places);
    });
    if (selected.length < definition.teams) {
      const selectedIds = new Set(selected.map(club => club.id));
      selected.push(...candidates.filter(club => !selectedIds.has(club.id)).slice(0, definition.teams - selected.length));
    }
  } else {
    selected = candidates.slice(definition.offset || 0, (definition.offset || 0) + definition.teams);
  }
  const user = game.clubs.find(club => club.id === game.userClubId);
  if (definition.format === "knockout" && user && definition.countries.has(user.country) && !selected.some(club => club.id === user.id) && selected.length) selected[selected.length - 1] = user;
  return selected.map(club => club.id);
}

function createGroups(participants) {
  const groups = Array.from({ length: 8 }, (_, index) => ({ id: String.fromCharCode(65 + index), clubIds: [], table: [] }));
  participants.forEach((clubId, index) => groups[index % groups.length].clubIds.push(clubId));
  groups.forEach(group => { group.table = freshTable(group.clubIds); });
  const schedules = groups.map(group => {
    const firstLeg = roundRobinRounds(group.clubIds);
    return [...firstLeg, ...firstLeg.map(round => round.map(fixture => ({ homeId: fixture.awayId, awayId: fixture.homeId })))];
  });
  return { groups, rounds: Array.from({ length: 6 }, (_, round) => schedules.flatMap(schedule => schedule[round] || [])) };
}

function createCompetition(game, definition) {
  const participants = selectedClubs(game, definition);
  if (participants.length < 4) return null;
  const cadence = Math.max(1, Math.floor(game.schedule.length / definition.cadenceRounds));
  const competition = { ...definition, countries: [...definition.countries], participants, season: game.season, cadence, nextWeek: 1, roundIndex: 0, history: [], finished: false, championId: null, awaitingUser: false };
  if (definition.format === "groups") {
    const { groups, rounds } = createGroups(participants.slice(0, 32));
    Object.assign(competition, { phase: "groups", groups, phaseRounds: rounds, currentFixtures: rounds[0], roundLabel: "Fase de grupos · rodada 1" });
  } else if (definition.format === "league") {
    const ids = participants.slice(0, 36);
    const rounds = roundRobinRounds(ids).slice(0, 8);
    Object.assign(competition, { phase: "league", table: freshTable(ids), phaseRounds: rounds, currentFixtures: rounds[0], roundLabel: "Fase de liga · rodada 1", directIds: [] });
  } else {
    const size = 2 ** Math.floor(Math.log2(participants.length));
    competition.participants = participants.slice(0, size);
    Object.assign(competition, { phase: "knockout", knockoutIds: competition.participants, currentFixtures: knockoutFixtures(competition.participants, `${game.season}:${definition.id}:0`), roundLabel: knockoutLabel(size) });
  }
  return competition;
}

export function ensureParallelCompetitions(game) {
  if (!game.leagues) {
    game.competitions ??= { version: 1, season: game.season, items: [] };
    return game.competitions;
  }
  if (!game.competitions || game.competitions.version !== 1 || game.competitions.season !== game.season || !game.competitions.items?.length) {
    game.competitions = { version: 1, season: game.season, items: DEFINITIONS.map(definition => createCompetition(game, definition)).filter(Boolean), history: game.competitions?.history || [] };
  }
  game.competitions.history ??= [];
  return game.competitions;
}

function winner(result, competition) {
  if (result.homeGoals !== result.awayGoals) return result.homeGoals > result.awayGoals ? result.homeId : result.awayId;
  const homeRoll = hash(`${competition.id}:${competition.season}:${competition.roundIndex}:${result.homeId}`);
  const awayRoll = hash(`${competition.id}:${competition.season}:${competition.roundIndex}:${result.awayId}`);
  result.penaltyWinnerId = homeRoll >= awayRoll ? result.homeId : result.awayId;
  return result.penaltyWinnerId;
}

function payRoundRewards(game, competition, results) {
  for (const result of results) {
    let winnerId = null;
    if (result.homeGoals !== result.awayGoals) winnerId = result.homeGoals > result.awayGoals ? result.homeId : result.awayId;
    else if (["knockout", "playoff"].includes(competition.phase)) winnerId = winner({ ...result }, competition);
    const club = game.clubs.find(item => item.id === winnerId);
    if (!club) continue;
    club.budget += competition.winPrize;
    recordSeasonFinance(game, club.id, "copas", competition.winPrize, "income");
  }
}

function finishCompetition(game, competition, championId) {
  competition.finished = true;
  competition.championId = championId;
  competition.currentFixtures = [];
  competition.roundLabel = "Encerrada";
  const champion = game.clubs.find(club => club.id === championId);
  if (champion) {
    champion.budget += competition.championPrize;
    recordSeasonFinance(game, champion.id, "copas", competition.championPrize, "income");
  }
  game.competitions.history.unshift({ season: game.season, id: competition.id, name: competition.name, championId, championName: champion?.name || "Clube", prize: competition.championPrize });
  game.competitions.history = game.competitions.history.slice(0, 40);
  game.news.unshift({ id: `competition-champion-${game.season}-${competition.id}`, type: championId === game.userClubId ? "positive" : "info", title: `${champion?.name || "Clube"} venceu a ${competition.name}`, body: championId === game.userClubId ? `O título rendeu ${competition.championPrize.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} ao clube.` : "A competição chegou ao fim." });
}

function startKnockout(competition, ids, key) {
  competition.phase = "knockout";
  competition.knockoutIds = ids;
  competition.roundIndex = 0;
  competition.currentFixtures = knockoutFixtures(ids, key);
  competition.roundLabel = knockoutLabel(ids.length);
}

function advanceStage(game, competition, results) {
  competition.history.push({ phase: competition.phase, label: competition.roundLabel, results: results.map(result => ({ homeId: result.homeId, awayId: result.awayId, homeGoals: result.homeGoals, awayGoals: result.awayGoals, penaltyWinnerId: result.penaltyWinnerId || null })) });
  if (competition.phase === "groups") {
    results.forEach(result => {
      const group = competition.groups.find(item => item.clubIds.includes(result.homeId));
      updateTable(group.table, result);
    });
    competition.roundIndex += 1;
    if (competition.roundIndex < competition.phaseRounds.length) {
      competition.currentFixtures = competition.phaseRounds[competition.roundIndex];
      competition.roundLabel = `Fase de grupos · rodada ${competition.roundIndex + 1}`;
    } else {
      const qualified = competition.groups.flatMap(group => sortedTable(group.table).slice(0, 2).map(row => row.clubId));
      startKnockout(competition, qualified, `${game.season}:${competition.id}:knockout`);
    }
    return;
  }
  if (competition.phase === "league") {
    results.forEach(result => updateTable(competition.table, result));
    competition.roundIndex += 1;
    if (competition.roundIndex < competition.phaseRounds.length) {
      competition.currentFixtures = competition.phaseRounds[competition.roundIndex];
      competition.roundLabel = `Fase de liga · rodada ${competition.roundIndex + 1}`;
    } else {
      const ranking = sortedTable(competition.table);
      competition.directIds = ranking.slice(0, 8).map(row => row.clubId);
      competition.phase = "playoff";
      competition.knockoutIds = ranking.slice(8, 24).map(row => row.clubId);
      competition.roundIndex = 0;
      competition.currentFixtures = knockoutFixtures(competition.knockoutIds, `${game.season}:${competition.id}:playoff`);
      competition.roundLabel = "Play-off eliminatório";
    }
    return;
  }
  const winners = results.map(result => winner(result, competition));
  if (competition.phase === "playoff") {
    startKnockout(competition, [...competition.directIds, ...winners], `${game.season}:${competition.id}:oitavas`);
    return;
  }
  if (winners.length === 1) {
    finishCompetition(game, competition, winners[0]);
    return;
  }
  competition.knockoutIds = winners;
  competition.roundIndex += 1;
  competition.currentFixtures = knockoutFixtures(winners, `${game.season}:${competition.id}:${competition.roundIndex}`);
  competition.roundLabel = knockoutLabel(winners.length);
}

export function completeCompetitionRound(game, competitionId, results) {
  const competition = ensureParallelCompetitions(game).items.find(item => item.id === competitionId);
  if (!competition || competition.finished) return null;
  results.forEach(result => { if (result.homeGoals === result.awayGoals && ["knockout", "playoff"].includes(competition.phase)) winner(result, competition); });
  payRoundRewards(game, competition, results);
  advanceStage(game, competition, results);
  competition.awaitingUser = false;
  competition.nextWeek += competition.cadence;
  return competition;
}

export function processCompetitionCalendar(game, simulateFixtures) {
  const state = ensureParallelCompetitions(game);
  for (const competition of state.items) {
    if (competition.finished || competition.awaitingUser || competition.nextWeek > game.week) continue;
    const userFixture = competition.currentFixtures.find(fixture => fixture.homeId === game.userClubId || fixture.awayId === game.userClubId);
    if (userFixture) {
      competition.awaitingUser = true;
      game.news.unshift({ id: `competition-match-${game.season}-${competition.id}-${competition.phase}-${competition.roundIndex}`, type: "info", title: `Próximo compromisso: ${competition.name}`, body: `${competition.roundLabel}. Prepare a equipe antes de avançar no campeonato.` });
      continue;
    }
    completeCompetitionRound(game, competition.id, simulateFixtures(competition, competition.currentFixtures));
  }
  return state;
}

export function pendingCompetitionFixture(game) {
  const competition = ensureParallelCompetitions(game).items.find(item => item.awaitingUser && !item.finished);
  if (!competition) return null;
  const fixture = competition.currentFixtures.find(item => item.homeId === game.userClubId || item.awayId === game.userClubId);
  return fixture ? { ...fixture, competitionId: competition.id, competitionName: competition.name, competitionRound: competition.roundLabel } : null;
}

export function competitionRoundFixtures(game, competitionId) {
  return ensureParallelCompetitions(game).items.find(item => item.id === competitionId)?.currentFixtures || [];
}

export function parallelCompetition(game, competitionId) {
  return ensureParallelCompetitions(game).items.find(item => item.id === competitionId) || null;
}

export function competitionTable(competition) {
  return competition?.table ? sortedTable(competition.table) : [];
}

export function competitionGroups(competition) {
  return (competition?.groups || []).map(group => ({ ...group, table: sortedTable(group.table) }));
}
