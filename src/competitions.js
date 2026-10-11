import { recordSeasonFinance } from "./season-tracking.js";
import { playerValue } from "./player-balance.js";
import { ensureWorldClubCompetitions, recordContinentalChampion, recordContinentalRound, worldCompetitionDefinitions } from "./world-club-competitions.js";

const EUROPE = new Set(["DEU", "ENG", "ESP", "FRA", "ITA", "NLD", "PRT", "RUS", "TUR"]);
const SOUTH_AMERICA = new Set(["ARG", "BRA", "COL", "PRY", "URY"]);
const LIBERTADORES_SLOTS = { BRA: 8, ARG: 7, COL: 4, PRY: 4, URY: 9 };
const SUDAMERICANA_SLOTS = { BRA: 10, ARG: 8, COL: 4, PRY: 4, URY: 6 };
const CHAMPIONS_SLOTS = { ENG: 5, ESP: 5, DEU: 4, ITA: 4, FRA: 4, NLD: 4, PRT: 4, TUR: 3, RUS: 3 };
const EUROPA_SLOTS = { ENG: 4, ESP: 4, DEU: 4, ITA: 4, FRA: 4, NLD: 4, PRT: 4, TUR: 4, RUS: 4 };

const DEFINITIONS = [
  { id: "copa-brasil", name: "Copa do Brasil", countries: new Set(["BRA"]), format: "knockout", teams: 64, cadenceRounds: 7, championPrize: 80_000_000, winPrize: 1_500_000 },
  { id: "carabao-cup", name: "Carabao Cup", countries: new Set(["ENG"]), format: "knockout", teams: 32, cadenceRounds: 6, championPrize: 55_000_000, winPrize: 1_200_000 },
  { id: "copa-rei", name: "Copa da Espanha", countries: new Set(["ESP"]), format: "knockout", teams: 32, cadenceRounds: 6, championPrize: 60_000_000, winPrize: 1_300_000 },
  { id: "libertadores", name: "CONMEBOL Libertadores", countries: SOUTH_AMERICA, format: "groups", teams: 32, slots: LIBERTADORES_SLOTS, cadenceRounds: 11, championPrize: 140_000_000, winPrize: 2_500_000 },
  { id: "sul-americana", name: "CONMEBOL Sul-Americana", countries: SOUTH_AMERICA, format: "groups", teams: 32, slots: SUDAMERICANA_SLOTS, previousSlots: LIBERTADORES_SLOTS, cadenceRounds: 11, championPrize: 85_000_000, winPrize: 1_800_000 },
  { id: "champions", name: "UEFA Champions League", countries: EUROPE, format: "league", teams: 36, slots: CHAMPIONS_SLOTS, cadenceRounds: 14, championPrize: 240_000_000, winPrize: 4_000_000 },
  { id: "europa-league", name: "UEFA Europa League", countries: EUROPE, format: "league", teams: 36, slots: EUROPA_SLOTS, previousSlots: CHAMPIONS_SLOTS, cadenceRounds: 14, championPrize: 150_000_000, winPrize: 2_800_000 }
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

function findClub(game, clubId) {
  return game.clubs.find(club => club.id === clubId) || game.externalClubs?.find(club => club.id === clubId);
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

function nationalRanking(game, country) {
  const topLeague = game.leagues?.filter(league => league.country === country).sort((first, second) => Number(first.tier) - Number(second.tier))[0];
  if (!topLeague) return [];
  const completed = game.clubs.map(club => {
    const history = [...(club.history || [])].reverse().find(entry => entry.season === game.season - 1 && entry.leagueId === topLeague.id && Number.isFinite(entry.position));
    return history ? { club, position: history.position, sportingMerit: true } : null;
  }).filter(Boolean).sort((first, second) => first.position - second.position);
  if (completed.length === topLeague.clubIds.length) return completed;
  return topLeague.clubIds.map(clubId => game.clubs.find(club => club.id === clubId)).filter(Boolean)
    .sort((first, second) => qualificationScore(second) - qualificationScore(first) || first.name.localeCompare(second.name, "pt-BR"))
    .map((club, index) => ({ club, position: index + 1, sportingMerit: false }));
}

function selectedClubs(game, definition) {
  if (definition.participantIds) return { participants: [...definition.participantIds], qualification: definition.qualification || [] };
  const candidates = game.clubs.filter(club => definition.countries.has(club.country)).sort((first, second) => qualificationScore(second) - qualificationScore(first) || first.name.localeCompare(second.name, "pt-BR"));
  let selected;
  let qualification = [];
  if (definition.slots) {
    selected = Object.entries(definition.slots).flatMap(([country, places]) => {
      const offset = definition.previousSlots?.[country] || 0;
      const qualified = nationalRanking(game, country).slice(offset, offset + places);
      qualification.push({ country, places, fromPosition: offset + 1, toPosition: offset + qualified.length, sportingMerit: qualified.every(item => item.sportingMerit) });
      return qualified.map(item => item.club);
    });
  } else if (definition.countries.size > 1) {
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
  return { participants: selected.map(club => club.id), qualification };
}

function createGroups(participants, legs = 2) {
  const groups = Array.from({ length: 8 }, (_, index) => ({ id: String.fromCharCode(65 + index), clubIds: [], table: [] }));
  participants.forEach((clubId, index) => groups[index % groups.length].clubIds.push(clubId));
  groups.forEach(group => { group.table = freshTable(group.clubIds); });
  const schedules = groups.map(group => {
    const firstLeg = roundRobinRounds(group.clubIds);
    return legs === 1 ? firstLeg : [...firstLeg, ...firstLeg.map(round => round.map(fixture => ({ homeId: fixture.awayId, awayId: fixture.homeId })))];
  });
  return { groups, rounds: Array.from({ length: 3 * legs }, (_, round) => schedules.flatMap(schedule => schedule[round] || [])) };
}

function createIntercontinental(game, competition) {
  const entrants = competition.confederationEntrants;
  const afcStarts = (game.worldSeason || 2026) % 2 === 0;
  const firstAsiaAfrica = afcStarts ? entrants.AFC : entrants.CAF;
  const remainingAsiaAfrica = afcStarts ? entrants.CAF : entrants.AFC;
  const conmebolHosts = (game.worldSeason || 2026) % 2 === 0;
  competition.phase = "intercontinental-opening";
  competition.roundIndex = 0;
  competition.bracket = { uefaId: entrants.UEFA, remainingAsiaAfrica, asiaAfricaWinner: null, americasWinner: null };
  competition.currentFixtures = [
    { homeId: firstAsiaAfrica, awayId: entrants.OFC, bracketKey: "asia-africa-opening" },
    { homeId: conmebolHosts ? entrants.CONMEBOL : entrants.CONCACAF, awayId: conmebolHosts ? entrants.CONCACAF : entrants.CONMEBOL, bracketKey: "americas" }
  ];
  competition.roundLabel = "Eliminatórias continentais";
}

function createCompetition(game, definition) {
  const selection = selectedClubs(game, definition);
  const participants = selection.participants;
  if (participants.length < 4) return null;
  const cadence = Math.max(1, Math.floor(game.schedule.length / definition.cadenceRounds));
  const competition = { ...definition, countries: definition.countries ? [...definition.countries] : [], participants, qualification: selection.qualification, season: game.season, cadence, nextWeek: definition.nextWeekRatio ? Math.max(1, Math.floor(game.schedule.length * definition.nextWeekRatio)) : 1, roundIndex: 0, history: [], playerStats: {}, awards: [], finished: false, championId: null, awaitingUser: false };
  if (definition.format === "groups") {
    const { groups, rounds } = createGroups(participants.slice(0, 32), definition.groupLegs || 2);
    Object.assign(competition, { phase: "groups", groups, phaseRounds: rounds, currentFixtures: rounds[0], roundLabel: "Fase de grupos · rodada 1" });
  } else if (definition.format === "league") {
    const ids = participants.slice(0, 36);
    const rounds = roundRobinRounds(ids).slice(0, 8);
    Object.assign(competition, { phase: "league", table: freshTable(ids), phaseRounds: rounds, currentFixtures: rounds[0], roundLabel: "Fase de liga · rodada 1", directIds: [] });
  } else if (definition.format === "intercontinental") {
    createIntercontinental(game, competition);
  } else {
    const size = 2 ** Math.floor(Math.log2(participants.length));
    competition.participants = participants.slice(0, size);
    Object.assign(competition, { phase: "knockout", knockoutIds: competition.participants, currentFixtures: knockoutFixtures(competition.participants, `${game.season}:${definition.id}:0`), roundLabel: knockoutLabel(size) });
  }
  return competition;
}

export function ensureParallelCompetitions(game) {
  if (!game.leagues?.length) {
    game.competitions ??= { version: 2, season: game.season, items: [] };
    return game.competitions;
  }
  ensureWorldClubCompetitions(game);
  if (!game.competitions || game.competitions.version !== 3 || game.competitions.season !== game.season || !game.competitions.items?.length) {
    const definitions = [...DEFINITIONS, ...worldCompetitionDefinitions(game)];
    game.competitions = { version: 3, season: game.season, items: definitions.map(definition => createCompetition(game, definition)).filter(Boolean), history: game.competitions?.history || [] };
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
    const club = findClub(game, winnerId);
    if (!club) continue;
    club.budget += competition.winPrize;
    recordSeasonFinance(game, club.id, "copas", competition.winPrize, "income");
  }
}

function recordCompetitionStats(competition, results) {
  competition.playerStats ??= {};
  for (const result of results) for (const [clubId, reports] of Object.entries(result.playerReports || {})) {
    for (const report of reports) {
      if (!(report.minutes > 0)) continue;
      const stats = competition.playerStats[report.id] ??= { playerId: report.id, clubId, appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ratingTotal: 0, ratedMatches: 0 };
      stats.clubId = clubId;
      stats.appearances += 1;
      stats.goals += report.goals ?? 0;
      stats.assists += report.assists ?? 0;
      stats.yellowCards += report.yellows ?? 0;
      stats.redCards += Number(report.red || 0);
      if (Number.isFinite(report.rating)) {
        stats.ratingTotal = Math.round((stats.ratingTotal + report.rating) * 10) / 10;
        stats.ratedMatches += 1;
      }
    }
  }
}

function competitionAwardWinners(game, competition) {
  const entries = Object.values(competition.playerStats || {}).map(stats => {
    const club = findClub(game, stats.clubId);
    const player = club?.squad.find(item => item.id === stats.playerId);
    return player && club ? { stats, player, club, average: stats.ratedMatches ? stats.ratingTotal / stats.ratedMatches : 0 } : null;
  }).filter(Boolean);
  if (!entries.length) return [];
  const byName = (first, second) => first.player.name.localeCompare(second.player.name, "pt-BR");
  const scorer = [...entries].sort((first, second) => second.stats.goals - first.stats.goals || second.stats.assists - first.stats.assists || second.average - first.average || byName(first, second))[0];
  const assister = [...entries].sort((first, second) => second.stats.assists - first.stats.assists || second.stats.goals - first.stats.goals || second.average - first.average || byName(first, second))[0];
  const maximumAppearances = Math.max(...entries.map(entry => entry.stats.appearances));
  const minimumAppearances = Math.max(1, Math.min(maximumAppearances, Math.max(2, Math.ceil(maximumAppearances * 0.4))));
  const eligible = entries.filter(entry => entry.stats.ratedMatches >= minimumAppearances);
  const best = [...(eligible.length ? eligible : entries.filter(entry => entry.stats.ratedMatches > 0))].sort((first, second) => second.average - first.average || second.stats.appearances - first.stats.appearances || second.stats.goals - first.stats.goals || byName(first, second))[0];
  return [
    scorer && { type: "topScorer", label: "Artilheiro da competição", stat: scorer.stats.goals, statLabel: `${scorer.stats.goals} gols`, moneyRate: 0.03, ...scorer },
    assister && { type: "topAssister", label: "Líder de assistências", stat: assister.stats.assists, statLabel: `${assister.stats.assists} assistências`, moneyRate: 0.025, ...assister },
    best && { type: "bestPlayer", label: "Melhor jogador da competição", stat: best.average, statLabel: `nota média ${best.average.toFixed(1).replace(".", ",")}`, moneyRate: 0.04, ...best }
  ].filter(Boolean);
}

function awardCompetitionHonors(game, competition) {
  competition.awards = competitionAwardWinners(game, competition).map(winner => {
    const { player, club } = winner;
    const money = Math.max(100_000, Math.round(competition.championPrize * winner.moneyRate / 1000) * 1000);
    const overallBefore = player.overall;
    const potentialBefore = player.potential;
    player.potential = Math.min(99, player.potential + 1);
    player.overall = Math.min(player.potential, player.overall + 1);
    player.value = playerValue(player);
    club.budget = (club.budget ?? 0) + money;
    if (game.clubs.some(item => item.id === club.id)) recordSeasonFinance(game, club.id, "premiosIndividuais", money, "income");
    const record = { season: game.season, competitionId: competition.id, competitionName: competition.name, type: winner.type, label: winner.label, stat: winner.stat, statLabel: winner.statLabel, playerId: player.id, playerName: player.name, clubId: club.id, clubName: club.name, money, overallGain: player.overall - overallBefore, potentialGain: player.potential - potentialBefore };
    player.awards ??= [];
    player.awards.push(record);
    if (club.id === game.userClubId) game.news.unshift({ id: `competition-award-${game.season}-${competition.id}-${winner.type}-${player.id}`, type: "positive", title: `${player.name}: ${winner.label}`, body: `${winner.statLabel} na ${competition.name}. O clube recebeu ${money.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.` });
    return record;
  });
  return competition.awards;
}

function finishCompetition(game, competition, championId) {
  competition.finished = true;
  competition.championId = championId;
  competition.currentFixtures = [];
  competition.roundLabel = "Encerrada";
  const champion = findClub(game, championId);
  if (champion) {
    champion.budget += competition.championPrize;
    recordSeasonFinance(game, champion.id, "copas", competition.championPrize, "income");
  }
  const awards = awardCompetitionHonors(game, competition);
  game.competitions.history.unshift({ season: game.season, id: competition.id, name: competition.name, championId, championName: champion?.name || "Clube", prize: competition.championPrize, awards });
  game.competitions.history = game.competitions.history.slice(0, 40);
  recordContinentalChampion(game, competition, championId);
  if (["intercontinental", "club-world-cup"].includes(competition.id)) game.worldClubCompetitions.history.unshift({ year: game.worldSeason, competitionId: competition.id, championId, championName: champion?.name || "Clube" });
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
  if (competition.phase === "intercontinental-opening") {
    const asiaAfrica = results.find(result => competition.currentFixtures.find(fixture => fixture.homeId === result.homeId && fixture.bracketKey === "asia-africa-opening"));
    const americas = results.find(result => competition.currentFixtures.find(fixture => fixture.homeId === result.homeId && fixture.bracketKey === "americas"));
    competition.bracket.asiaAfricaWinner = winner(asiaAfrica, competition);
    competition.bracket.americasWinner = winner(americas, competition);
    competition.phase = "intercontinental-playoff";
    competition.roundIndex += 1;
    competition.currentFixtures = [{ homeId: competition.bracket.asiaAfricaWinner, awayId: competition.bracket.remainingAsiaAfrica, bracketKey: "asia-africa-final" }];
    competition.roundLabel = "Copa África–Ásia–Pacífico";
    return;
  }
  if (competition.phase === "intercontinental-playoff") {
    competition.bracket.asiaAfricaWinner = winner(results[0], competition);
    competition.phase = "intercontinental-challenger";
    competition.roundIndex += 1;
    competition.currentFixtures = [{ homeId: competition.bracket.asiaAfricaWinner, awayId: competition.bracket.americasWinner, bracketKey: "challenger" }];
    competition.roundLabel = "Copa Challenger";
    return;
  }
  if (competition.phase === "intercontinental-challenger") {
    competition.phase = "intercontinental-final";
    competition.roundIndex += 1;
    competition.currentFixtures = [{ homeId: winner(results[0], competition), awayId: competition.bracket.uefaId, bracketKey: "final" }];
    competition.roundLabel = "Final";
    return;
  }
  if (competition.phase === "intercontinental-final") {
    finishCompetition(game, competition, winner(results[0], competition));
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
  results.forEach(result => { if (result.homeGoals === result.awayGoals && (["knockout", "playoff"].includes(competition.phase) || competition.phase.startsWith("intercontinental"))) winner(result, competition); });
  recordCompetitionStats(competition, results);
  recordContinentalRound(game, competition, results);
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
  return fixture ? { ...fixture, competitionId: competition.id, competitionName: competition.name, competitionRound: competition.roundLabel, calendarKind: competition.calendarKind, roundIndex: competition.roundIndex } : null;
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
