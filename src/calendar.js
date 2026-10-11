const EUROPEAN_COUNTRIES = new Set(["DEU", "ENG", "ESP", "FRA", "ITA", "NLD", "PRT", "RUS", "TUR"]);

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function nextSunday(date) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + (7 - copy.getUTCDay()) % 7);
  return copy;
}

export function leagueCalendarProfile(league) {
  const crossYear = league?.season?.includes("/") || EUROPEAN_COUNTRIES.has(league?.country);
  return crossYear
    ? { id: "cross-year", startMonth: 8, endMonth: 5, label: "agosto a maio" }
    : { id: "annual", startMonth: 1, endMonth: 12, label: "janeiro a dezembro" };
}

export function leagueRoundDate(game, leagueId = game.leagueId, roundIndex) {
  const league = game.leagues?.find(item => item.id === leagueId);
  const profile = leagueCalendarProfile(league);
  const startYear = game.worldSeason || 2026;
  const start = profile.id === "cross-year" ? utcDate(startYear, 8, 8) : utcDate(startYear, 1, 18);
  const end = profile.id === "cross-year" ? utcDate(startYear + 1, 5, 24) : utcDate(startYear, 12, 6);
  const rounds = Math.max(1, league?.schedule?.length || game.schedule?.length || 1);
  const index = Math.max(0, Math.min(rounds - 1, roundIndex ?? league?.week ?? game.week ?? 0));
  const progress = rounds === 1 ? 0 : index / (rounds - 1);
  return nextSunday(new Date(start.getTime() + (end.getTime() - start.getTime()) * progress));
}

export function competitionRoundDate(game, competition) {
  if (competition?.calendarKind === "club-world-cup") {
    const date = utcDate(game.worldSeason || 2029, 6, 14);
    date.setUTCDate(date.getUTCDate() + (competition.roundIndex || 0) * 5);
    return date;
  }
  if (competition?.calendarKind === "intercontinental") {
    const date = utcDate(game.worldSeason || 2026, 12, 9);
    date.setUTCDate(date.getUTCDate() + (competition.roundIndex || 0) * 4);
    return date;
  }
  const leagueDate = leagueRoundDate(game, game.leagueId, game.week);
  if (!competition) return leagueDate;
  const date = new Date(leagueDate);
  date.setUTCDate(date.getUTCDate() - 4);
  return date;
}

export function formatCalendarDate(date, options = {}) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: options.short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date).replace(" de ", " ").replace(" de ", " ");
}

export function leagueCalendarDescription(league) {
  const profile = leagueCalendarProfile(league);
  return profile.id === "cross-year" ? "Calendário europeu · agosto a maio" : "Calendário anual · janeiro a dezembro";
}
