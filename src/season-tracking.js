function playerSnapshot(player, clubId) {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    clubId,
    overall: player.overall,
    potential: player.potential,
    value: player.value ?? 0
  };
}

export function ensureSeasonTracking(game) {
  const clubIds = game.clubs.map(club => club.id).sort();
  if (game.seasonTracking?.season === game.season && clubIds.length === game.seasonTracking.clubIds?.length && clubIds.every((id, index) => id === game.seasonTracking.clubIds[index])) return game.seasonTracking;
  game.seasonTracking = {
    season: game.season,
    clubIds,
    clubs: Object.fromEntries(game.clubs.map(club => [club.id, {
      startingBudget: club.budget,
      income: {},
      expenses: {}
    }])),
    players: Object.fromEntries(game.clubs.flatMap(club => club.squad.map(player => [player.id, playerSnapshot(player, club.id)])))
  };
  return game.seasonTracking;
}

export function recordSeasonFinance(game, clubId, category, amount, direction) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const tracking = ensureSeasonTracking(game);
  tracking.clubs[clubId] ??= { startingBudget: game.clubs.find(club => club.id === clubId)?.budget ?? 0, income: {}, expenses: {} };
  const group = direction === "income" ? tracking.clubs[clubId].income : tracking.clubs[clubId].expenses;
  group[category] = (group[category] ?? 0) + amount;
}

export function seasonFinanceSummary(game, clubId) {
  const tracking = ensureSeasonTracking(game);
  const club = game.clubs.find(item => item.id === clubId);
  const ledger = tracking.clubs[clubId] || { startingBudget: club?.budget ?? 0, income: {}, expenses: {} };
  const totalIncome = Object.values(ledger.income).reduce((total, value) => total + value, 0);
  const totalExpenses = Object.values(ledger.expenses).reduce((total, value) => total + value, 0);
  const endingBudget = club?.budget ?? ledger.startingBudget;
  const net = endingBudget - ledger.startingBudget;
  const other = net - (totalIncome - totalExpenses);
  return { ...ledger, endingBudget, totalIncome, totalExpenses, net, other };
}

export function playerValueChanges(game, clubId) {
  const tracking = ensureSeasonTracking(game);
  const club = game.clubs.find(item => item.id === clubId);
  if (!club) return [];
  return club.squad.map(player => {
    const start = tracking.players[player.id];
    if (!start) return null;
    return {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      startOverall: start.overall,
      endOverall: player.overall,
      overallChange: player.overall - start.overall,
      startValue: start.value,
      endValue: player.value ?? 0,
      valueChange: (player.value ?? 0) - start.value
    };
  }).filter(Boolean).sort((first, second) => second.valueChange - first.valueChange || second.overallChange - first.overallChange || first.playerName.localeCompare(second.playerName, "pt-BR"));
}
