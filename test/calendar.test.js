import test from "node:test";
import assert from "node:assert/strict";
import { formatCalendarDate, leagueCalendarDescription, leagueCalendarProfile, leagueRoundDate } from "../src/calendar.js";

function game(league) {
  return { worldSeason: 2026, leagueId: league.id, week: 0, schedule: league.schedule, leagues: [league] };
}

test("annual championships run from January to December of the same year", () => {
  const league = { id: "bra-1", country: "BRA", season: "2026", schedule: Array.from({ length: 38 }, () => []) };
  const context = game(league);
  assert.equal(leagueCalendarProfile(league).id, "annual");
  assert.equal(leagueRoundDate(context, league.id, 0).getUTCFullYear(), 2026);
  assert.equal(leagueRoundDate(context, league.id, 0).getUTCMonth(), 0);
  assert.equal(leagueRoundDate(context, league.id, 37).getUTCFullYear(), 2026);
  assert.equal(leagueRoundDate(context, league.id, 37).getUTCMonth(), 11);
  assert.match(leagueCalendarDescription(league), /janeiro a dezembro/);
});

test("European championships start in August and finish in May of the following year", () => {
  const league = { id: "eng-1", country: "ENG", season: "2026/27", schedule: Array.from({ length: 38 }, () => []) };
  const context = game(league);
  const first = leagueRoundDate(context, league.id, 0);
  const last = leagueRoundDate(context, league.id, 37);
  assert.equal(leagueCalendarProfile(league).id, "cross-year");
  assert.equal(first.getUTCFullYear(), 2026);
  assert.equal(first.getUTCMonth(), 7);
  assert.equal(last.getUTCFullYear(), 2027);
  assert.equal(last.getUTCMonth(), 4);
  assert.match(formatCalendarDate(last), /2027/);
  assert.match(leagueCalendarDescription(league), /agosto a maio/);
});
