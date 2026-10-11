const CONFEDERATION_COUNTRIES = {
  UEFA: new Set(["DEU", "ENG", "ESP", "FRA", "ITA", "NLD", "PRT", "RUS", "TUR"]),
  CONMEBOL: new Set(["ARG", "BRA", "COL", "PRY", "URY"]),
  AFC: new Set(["JPN", "SAU"]),
  CONCACAF: new Set(["MEX", "USA"]),
  CAF: new Set(["MAR", "EGY", "NGA", "ZAF"]),
  OFC: new Set(["NZL"])
};

export const CLUB_WORLD_CUP_SLOTS = { UEFA: 12, CONMEBOL: 6, AFC: 4, CAF: 4, CONCACAF: 4, OFC: 1, HOST: 1 };

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result ^ result >>> 16) >>> 0;
}

function clubStrength(club) {
  const players = [...(club?.squad || [])].sort((first, second) => second.overall - first.overall).slice(0, 18);
  return players.reduce((total, player) => total + player.overall, 0) / Math.max(1, players.length);
}

function allClubs(game) {
  return [...game.clubs, ...(game.externalClubs || [])];
}

function guestPlayer(player, clubId, index, overallShift) {
  const overall = Math.max(50, Math.min(82, player.overall + overallShift));
  return {
    ...structuredClone(player),
    id: `${clubId}-p-${index + 1}`,
    overall,
    potential: Math.max(overall, Math.min(86, player.potential + overallShift)),
    appearances: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ratingTotal: 0,
    ratedMatches: 0,
    contractEndSeason: 99
  };
}

function ensureGuestClubs(game) {
  const specifications = [
    { id: "world-guest-caf-mar", name: "Casablanca Athletic", shortName: "CAS", country: "MAR", colors: ["#b91c1c", "#ffffff"], shift: -2 },
    { id: "world-guest-caf-egy", name: "Cairo Stars", shortName: "CAI", country: "EGY", colors: ["#dc2626", "#111827"], shift: -3 },
    { id: "world-guest-caf-nga", name: "Lagos United", shortName: "LAG", country: "NGA", colors: ["#15803d", "#ffffff"], shift: -5 },
    { id: "world-guest-caf-zaf", name: "Cape Town Athletic", shortName: "CTA", country: "ZAF", colors: ["#eab308", "#166534"], shift: -6 },
    { id: "world-guest-ofc-nzl", name: "Auckland Athletic", shortName: "AUK", country: "NZL", colors: ["#1d4ed8", "#ffffff"], shift: -11 }
  ];
  game.externalClubs ??= [];
  for (const club of game.clubs.filter(item => item.externalCompetitionClub)) {
    if (!game.externalClubs.some(item => item.id === club.id)) game.externalClubs.push(club);
  }
  game.clubs = game.clubs.filter(club => !club.externalCompetitionClub);
  const templates = game.clubs.filter(club => ["SAU", "JPN", "MEX"].includes(club.country)).sort((first, second) => clubStrength(second) - clubStrength(first));
  for (const [index, specification] of specifications.entries()) {
    if (game.externalClubs.some(club => club.id === specification.id)) continue;
    const template = templates[index % Math.max(1, templates.length)] || game.clubs[0];
    game.externalClubs.push({
      id: specification.id,
      name: specification.name,
      shortName: specification.shortName,
      country: specification.country,
      coach: "Comissão internacional",
      coachCountry: specification.country,
      colors: specification.colors,
      budget: 0,
      reputation: 68,
      fanMorale: 70,
      tactic: "equilibrado",
      markingIntensity: "moderada",
      formation: "4-4-2",
      externalCompetitionClub: true,
      history: [],
      stadium: { name: "Estádio Internacional", capacity: 32000, ticketPrice: 32, level: 1 },
      squad: template.squad.slice(0, 26).map((player, playerIndex) => guestPlayer(player, specification.id, playerIndex, specification.shift))
    });
  }
}

export function confederationForClub(club) {
  return Object.entries(CONFEDERATION_COUNTRIES).find(([, countries]) => countries.has(club?.country))?.[0] || null;
}

function rankingEntry(state, confederation, clubId, season) {
  state.rankings[confederation] ??= {};
  state.rankings[confederation][clubId] ??= { clubId, seasons: {} };
  state.rankings[confederation][clubId].seasons[season] ??= { points: 0, gf: 0, ga: 0, bestStage: 0 };
  return state.rankings[confederation][clubId].seasons[season];
}

function addRanking(game, confederation, clubId, season, points, gf = 0, ga = 0, bestStage = 0) {
  const entry = rankingEntry(game.worldClubCompetitions, confederation, clubId, season);
  entry.points += points;
  entry.gf += gf;
  entry.ga += ga;
  entry.bestStage = Math.max(entry.bestStage, bestStage);
}

function confederationClubs(game, confederation) {
  return allClubs(game).filter(club => CONFEDERATION_COUNTRIES[confederation]?.has(club.country));
}

function bestClub(game, confederation, excluded = new Set()) {
  return confederationClubs(game, confederation).filter(club => !excluded.has(club.id))
    .sort((first, second) => clubStrength(second) - clubStrength(first) || first.name.localeCompare(second.name, "pt-BR"))[0];
}

function seedSeason(game, season) {
  const state = game.worldClubCompetitions;
  if (state.seededSeasons.includes(season)) return;
  for (const confederation of Object.keys(CONFEDERATION_COUNTRIES)) {
    const clubs = confederationClubs(game, confederation).sort((first, second) => clubStrength(second) - clubStrength(first));
    clubs.forEach((club, index) => addRanking(game, confederation, club.id, season, Math.max(1, Math.round((clubStrength(club) - 48) * 1.35) - index), 0, 0, Math.max(0, 5 - index)));
    const champion = clubs[hash(`${game.seed}:${season}:${confederation}`) % Math.max(1, Math.min(clubs.length, 3))] || clubs[0];
    if (champion && !state.champions.some(item => item.season === season && item.confederation === confederation)) state.champions.push({ season, confederation, clubId: champion.id, source: "continental" });
  }
  state.seededSeasons.push(season);
}

function seedProxySeason(game, season) {
  const state = game.worldClubCompetitions;
  state.proxySeededSeasons ??= [];
  if (state.proxySeededSeasons.includes(season)) return;
  for (const confederation of ["AFC", "CAF", "CONCACAF", "OFC"]) {
    const clubs = confederationClubs(game, confederation).sort((first, second) => clubStrength(second) - clubStrength(first));
    clubs.forEach((club, index) => addRanking(game, confederation, club.id, season, Math.max(1, Math.round((clubStrength(club) - 48) * 1.35) - index), 0, 0, Math.max(0, 5 - index)));
    const champion = clubs[hash(`${game.seed}:${season}:${confederation}`) % Math.max(1, Math.min(clubs.length, 3))] || clubs[0];
    if (champion && !state.champions.some(item => item.season === season && item.confederation === confederation)) state.champions.push({ season, confederation, clubId: champion.id, source: "continental" });
  }
  state.proxySeededSeasons.push(season);
}

export function ensureWorldClubCompetitions(game) {
  if (!game.leagues?.length) return null;
  ensureGuestClubs(game);
  if (!game.worldClubCompetitions || game.worldClubCompetitions.version !== 1) {
    game.worldClubCompetitions = { version: 1, rankings: {}, champions: [], seededSeasons: [], proxySeededSeasons: [], history: [] };
  }
  const state = game.worldClubCompetitions;
  state.rankings ??= {};
  state.champions ??= [];
  state.seededSeasons ??= [];
  state.proxySeededSeasons ??= [];
  state.history ??= [];
  seedSeason(game, 2025);
  const previousYear = Math.max(2025, (game.worldSeason || 2026) - 1);
  if (previousYear > 2025) seedProxySeason(game, previousYear);
  return state;
}

export function rankingPointsForResult(confederation, goalsFor, goalsAgainst) {
  if (goalsFor === goalsAgainst) return 1;
  if (goalsFor < goalsAgainst) return 0;
  return confederation === "UEFA" ? 2 : 3;
}

export function stageRankingBonus(confederation, stage) {
  if (confederation !== "UEFA") return 3;
  return stage === "league-entry" ? 4 : stage === "round-of-16" ? 5 : 1;
}

function resultWinner(result) {
  if (result.homeGoals > result.awayGoals) return result.homeId;
  if (result.awayGoals > result.homeGoals) return result.awayId;
  return result.penaltyWinnerId || null;
}

export function recordContinentalRound(game, competition, results) {
  const confederation = competition.id === "champions" ? "UEFA" : competition.id === "libertadores" ? "CONMEBOL" : null;
  if (!confederation) return;
  ensureWorldClubCompetitions(game);
  const year = game.worldSeason || 2025 + game.season;
  for (const result of results) {
    addRanking(game, confederation, result.homeId, year, rankingPointsForResult(confederation, result.homeGoals, result.awayGoals), result.homeGoals, result.awayGoals);
    addRanking(game, confederation, result.awayId, year, rankingPointsForResult(confederation, result.awayGoals, result.homeGoals), result.awayGoals, result.homeGoals);
  }
  if (competition.phase === "league" && competition.roundIndex === 0) {
    for (const clubId of competition.participants) addRanking(game, confederation, clubId, year, stageRankingBonus(confederation, "league-entry"));
  }
  if (["knockout", "playoff"].includes(competition.phase)) {
    const bonus = stageRankingBonus(confederation, competition.knockoutIds?.length === 16 ? "round-of-16" : "later");
    for (const result of results) {
      const clubId = resultWinner(result);
      if (clubId) addRanking(game, confederation, clubId, year, bonus, 0, 0, competition.knockoutIds?.length || 2);
    }
  }
}

export function recordContinentalChampion(game, competition, championId) {
  const confederation = competition.id === "champions" ? "UEFA" : competition.id === "libertadores" ? "CONMEBOL" : null;
  if (!confederation) return;
  ensureWorldClubCompetitions(game);
  const season = game.worldSeason || 2025 + game.season;
  const existing = game.worldClubCompetitions.champions.find(item => item.season === season && item.confederation === confederation);
  if (existing) existing.clubId = championId;
  else game.worldClubCompetitions.champions.push({ season, confederation, clubId: championId, source: competition.id });
}

function rankingSummary(game, confederation, startYear, endYear) {
  ensureWorldClubCompetitions(game);
  return Object.values(game.worldClubCompetitions.rankings[confederation] || {}).map(entry => {
    const seasons = Object.entries(entry.seasons).filter(([season]) => Number(season) >= startYear && Number(season) <= endYear).map(([, values]) => values);
    return {
      clubId: entry.clubId,
      points: seasons.reduce((total, values) => total + values.points, 0),
      goalDifference: seasons.reduce((total, values) => total + values.gf - values.ga, 0),
      goals: seasons.reduce((total, values) => total + values.gf, 0),
      bestStage: Math.max(0, ...seasons.map(values => values.bestStage || 0)),
      recentBestSeason: Math.max(0, ...Object.entries(entry.seasons).filter(([, values]) => values.bestStage > 0).map(([season]) => Number(season)))
    };
  }).sort((first, second) => second.points - first.points || second.bestStage - first.bestStage || second.recentBestSeason - first.recentBestSeason || second.goalDifference - first.goalDifference || second.goals - first.goals || first.clubId.localeCompare(second.clubId));
}

function addWithCountryLimit(game, selected, candidate, champions, limit = 2) {
  if (!candidate || selected.some(item => item.clubId === candidate.clubId)) return false;
  const club = allClubs(game).find(item => item.id === candidate.clubId);
  if (!club) return false;
  const countryCount = selected.filter(item => allClubs(game).find(clubItem => clubItem.id === item.clubId)?.country === club.country).length;
  const championException = champions.has(candidate.clubId);
  if (countryCount >= limit && !championException) return false;
  selected.push(candidate);
  return true;
}

export function selectClubWorldCupParticipants(game, year = game.worldSeason || 2029) {
  ensureWorldClubCompetitions(game);
  const startYear = year - 4;
  const endYear = year - 1;
  for (let season = startYear; season <= endYear; season += 1) season === 2025 ? seedSeason(game, season) : seedProxySeason(game, season);
  const selected = [];
  const qualification = [];
  for (const [confederation, slots] of Object.entries(CLUB_WORLD_CUP_SLOTS).filter(([key]) => key !== "HOST")) {
    const championRows = game.worldClubCompetitions.champions.filter(item => item.confederation === confederation && item.season >= startYear && item.season <= endYear)
      .sort((first, second) => first.season - second.season);
    const championIds = new Set(championRows.map(item => item.clubId));
    const confederationSelection = [];
    for (const champion of championRows) addWithCountryLimit(game, confederationSelection, { clubId: champion.clubId, route: "Campeão continental", season: champion.season, confederation }, championIds);
    const ranking = rankingSummary(game, confederation, startYear, endYear);
    for (const row of ranking) {
      if (confederationSelection.length >= slots) break;
      addWithCountryLimit(game, confederationSelection, { ...row, route: "Ranking de quatro anos", confederation }, championIds);
    }
    for (const club of confederationClubs(game, confederation).sort((first, second) => clubStrength(second) - clubStrength(first))) {
      if (confederationSelection.length >= slots) break;
      addWithCountryLimit(game, confederationSelection, { clubId: club.id, route: "Ranking de quatro anos", confederation }, championIds);
    }
    selected.push(...confederationSelection.slice(0, slots));
    qualification.push({ confederation, slots, champions: confederationSelection.filter(item => item.route === "Campeão continental").length, ranking: Math.max(0, slots - confederationSelection.filter(item => item.route === "Campeão continental").length) });
  }
  const hostCountries = ["USA", "BRA", "ESP", "JPN"];
  const hostCountry = hostCountries[Math.floor((year - 2029) / 4) % hostCountries.length];
  const host = game.clubs.filter(club => club.country === hostCountry && !selected.some(item => item.clubId === club.id)).sort((first, second) => clubStrength(second) - clubStrength(first))[0];
  if (host) selected.push({ clubId: host.id, route: "Clube do país-sede", confederation: "HOST" });
  qualification.push({ confederation: "País-sede", slots: 1, champions: 0, ranking: 0, hostCountry });
  return { participants: selected.slice(0, 32), qualification, cycle: `${startYear}–${endYear}`, hostCountry };
}

function championFor(game, confederation, season) {
  const exact = game.worldClubCompetitions.champions.filter(item => item.confederation === confederation && item.season <= season).sort((first, second) => second.season - first.season)[0];
  return exact?.clubId || bestClub(game, confederation)?.id;
}

export function worldCompetitionDefinitions(game) {
  if (!game.leagues) return [];
  ensureWorldClubCompetitions(game);
  const year = game.worldSeason || 2026;
  const championSeason = year - 1;
  const confederationEntrants = Object.fromEntries(Object.keys(CONFEDERATION_COUNTRIES).map(confederation => [confederation, championFor(game, confederation, championSeason)]));
  if (Object.values(confederationEntrants).some(clubId => !clubId || !allClubs(game).some(club => club.id === clubId))) return [];
  const annual = {
    id: "intercontinental",
    name: "Copa Intercontinental da FIFA",
    format: "intercontinental",
    participantIds: Object.values(confederationEntrants),
    confederationEntrants,
    teams: 6,
    cadenceRounds: 18,
    nextWeekRatio: 0.72,
    championPrize: 100_000_000,
    winPrize: 8_000_000,
    calendarKind: "intercontinental",
    qualification: Object.entries(confederationEntrants).map(([confederation, clubId]) => ({ confederation, clubId, route: "Campeão continental" }))
  };
  if ((year - 2025) % 4 !== 0) return [annual];
  const selection = selectClubWorldCupParticipants(game, year);
  if (selection.participants.length !== 32) return [annual];
  return [annual, {
    id: "club-world-cup",
    name: "Mundial de Clubes da FIFA",
    format: "groups",
    participantIds: selection.participants.map(item => item.clubId),
    qualificationEntries: selection.participants,
    qualification: selection.qualification,
    cycle: selection.cycle,
    hostCountry: selection.hostCountry,
    teams: 32,
    groupLegs: 1,
    cadenceRounds: 18,
    nextWeekRatio: 0.28,
    championPrize: 700_000_000,
    winPrize: 20_000_000,
    calendarKind: "club-world-cup"
  }];
}
