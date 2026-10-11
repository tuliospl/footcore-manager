function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clubQuality(club, excludedPlayerId = null) {
  const players = club.squad.filter(player => player.id !== excludedPlayerId).sort((first, second) => second.overall - first.overall).slice(0, 11);
  return players.reduce((total, player) => total + player.overall, 0) / Math.max(1, players.length);
}

function initialSupporters(club) {
  const quality = clubQuality(club);
  const reputationReach = (club.reputation || 50) ** 2 * 420;
  const stadiumReach = (club.stadium?.capacity || 10_000) * 8;
  const squadReach = Math.max(0, quality - 55) ** 2 * 3_000;
  return Math.max(10_000, Math.round((reputationReach + stadiumReach + squadReach) / 1000) * 1000);
}

function ensureClubFanbase(club, season) {
  if (!club.fanbase) {
    const supporters = initialSupporters(club);
    club.fanbase = { supporters, seasonStart: supporters, seasonChange: 0, lastSeasonChange: 0, history: [], events: [] };
  }
  club.fanbase.supporters = Math.max(1_000, Math.round(club.fanbase.supporters || initialSupporters(club)));
  club.fanbase.seasonStart ??= club.fanbase.supporters;
  club.fanbase.seasonChange ??= club.fanbase.supporters - club.fanbase.seasonStart;
  club.fanbase.lastSeasonChange ??= 0;
  club.fanbase.history ??= [];
  club.fanbase.events ??= [];
  club.fanbase.season ??= season;
  return club.fanbase;
}

export function ensureFanbases(game) {
  [...game.clubs, ...(game.externalClubs || [])].forEach(club => ensureClubFanbase(club, game.season));
  return game.clubs.map(club => club.fanbase);
}

function changeSupporters(club, season, amount, reason) {
  const fanbase = ensureClubFanbase(club, season);
  const previous = fanbase.supporters;
  fanbase.supporters = Math.max(1_000, Math.round(previous + amount));
  const change = fanbase.supporters - previous;
  fanbase.seasonChange += change;
  if (change) {
    fanbase.events.unshift({ season, reason, change, supporters: fanbase.supporters });
    fanbase.events = fanbase.events.slice(0, 16);
  }
  return change;
}

export function processFanRound(game, results) {
  ensureFanbases(game);
  for (const result of results) {
    const home = game.clubs.find(club => club.id === result.homeId) || game.externalClubs?.find(club => club.id === result.homeId);
    const away = game.clubs.find(club => club.id === result.awayId) || game.externalClubs?.find(club => club.id === result.awayId);
    if (!home || !away) continue;
    const draw = result.homeGoals === result.awayGoals;
    const homeWon = result.homeGoals > result.awayGoals;
    for (const [club, opponent, won] of [[home, away, homeWon], [away, home, !homeWon && !draw]]) {
      const baseRate = draw ? 0.0001 : won ? 0.00065 : -0.00032;
      const opponentFactor = clamp(1 + ((opponent.reputation || 50) - (club.reputation || 50)) / 120, 0.75, 1.35);
      const engagementRate = ((club.fanMorale || 50) - 65) / 250_000;
      const rate = baseRate * opponentFactor + engagementRate;
      changeSupporters(club, game.season, club.fanbase.supporters * rate, draw ? "empate" : won ? "vitória" : "derrota");
    }
  }
}

export function recordPlayerArrival(game, club, player) {
  ensureClubFanbase(club, game.season);
  const qualityBefore = clubQuality(club, player.id);
  const qualityDifference = player.overall - qualityBefore;
  const impactRate = clamp(Math.max(0, qualityDifference - 1) * 0.0012 + Math.max(0, player.overall - 84) * 0.001, 0, 0.02);
  if (!impactRate) return 0;
  return changeSupporters(club, game.season, club.fanbase.supporters * impactRate, `contratação de ${player.name}`);
}

export function recordPlayerDeparture(game, club, player) {
  ensureClubFanbase(club, game.season);
  const qualityWithoutPlayer = clubQuality(club, player.id);
  const importance = player.overall - qualityWithoutPlayer;
  const impactRate = clamp(Math.max(0, importance - 2) * 0.0008 + Math.max(0, player.overall - 87) * 0.0005, 0, 0.012);
  if (!impactRate) return 0;
  return changeSupporters(club, game.season, -club.fanbase.supporters * impactRate, `saída de ${player.name}`);
}

export function recordStadiumExpansion(game, club, addedCapacity) {
  ensureClubFanbase(club, game.season);
  const gain = Math.min(club.fanbase.supporters * 0.006, addedCapacity * 3);
  return changeSupporters(club, game.season, gain, "ampliação do estádio");
}

export function settleFanSeason(game) {
  ensureFanbases(game);
  const leagues = game.leagues || [{ id: "national", clubIds: game.clubs.map(club => club.id), table: game.table }];
  for (const league of leagues) {
    const table = [...(league.table || [])].sort((first, second) => second.points - first.points || (second.gf - second.ga) - (first.gf - first.ga) || second.gf - first.gf);
    table.forEach((row, index) => {
      const club = game.clubs.find(item => item.id === row.clubId);
      if (!club) return;
      const position = index + 1;
      const topQuarter = Math.max(2, Math.ceil(table.length * 0.25));
      const bottomQuarter = Math.floor(table.length * 0.75);
      const rate = position === 1 ? 0.07 : position <= topQuarter ? 0.025 : position <= Math.ceil(table.length / 2) ? 0.008 : index >= bottomQuarter ? -0.02 : -0.004;
      changeSupporters(club, game.season, club.fanbase.supporters * rate, position === 1 ? "título da liga" : "campanha na liga");
      club.reputation = clamp((club.reputation || 50) + (position === 1 ? 4 : position <= topQuarter ? 2 : index >= bottomQuarter ? -2 : 0), 20, 100);
      club.fanbase.lastSeasonChange = club.fanbase.seasonChange;
      club.fanbase.history.unshift({ season: game.season, supporters: club.fanbase.supporters, change: club.fanbase.seasonChange, position });
      club.fanbase.history = club.fanbase.history.slice(0, 12);
    });
  }
}

export function applyDivisionFanImpact(game, movements) {
  for (const movement of movements || []) {
    movement.promoted.forEach(clubId => {
      const club = game.clubs.find(item => item.id === clubId);
      if (club) changeSupporters(club, game.season, club.fanbase.supporters * 0.04, "acesso de divisão");
    });
    movement.relegated.forEach(clubId => {
      const club = game.clubs.find(item => item.id === clubId);
      if (club) changeSupporters(club, game.season, -club.fanbase.supporters * 0.05, "rebaixamento");
    });
  }
  for (const club of game.clubs) {
    club.fanbase.lastSeasonChange = club.fanbase.seasonChange;
    const record = club.fanbase.history.find(item => item.season === game.season);
    if (record) {
      record.supporters = club.fanbase.supporters;
      record.change = club.fanbase.seasonChange;
    }
  }
}

export function startFanSeason(game) {
  ensureFanbases(game);
  for (const club of game.clubs) {
    club.fanbase.season = game.season;
    club.fanbase.seasonStart = club.fanbase.supporters;
    club.fanbase.seasonChange = 0;
  }
}

export function fanbaseProfile(club) {
  const fanbase = ensureClubFanbase(club, club.fanbase?.season || 1);
  return {
    supporters: fanbase.supporters,
    seasonChange: fanbase.seasonChange,
    lastSeasonChange: fanbase.lastSeasonChange,
    growthPercent: fanbase.seasonStart ? fanbase.seasonChange / fanbase.seasonStart * 100 : 0
  };
}
