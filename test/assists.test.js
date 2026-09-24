import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getLineup, advanceWeek, startNextSeason } from "../src/core.js";

test("assists belong to another starter on the scoring team and match goal events", () => {
  const game = createGame(42);
  const counts = new Map();
  let assisted = 0;
  let unassisted = 0;
  assert.ok([...game.clubs.flatMap(club => club.squad), ...game.market].every(player => player.assists === 0));
  while (!game.finished) {
    const lineups = new Map(game.clubs.map(club => [club.id, getLineup(club).map(player => player.id)]));
    const { results } = advanceWeek(game);
    for (const match of results) {
      const goals = match.events.filter(event => !event.type || event.type === "goal");
      assert.equal(goals.length, match.homeGoals + match.awayGoals);
      for (const event of goals) {
        if (!event.assisterId) {
          unassisted++;
          assert.equal(event.assister, null);
          continue;
        }
        assisted++;
        assert.notEqual(event.assisterId, event.scorerId);
        assert.ok(lineups.get(event.clubId).includes(event.assisterId));
        counts.set(event.assisterId, (counts.get(event.assisterId) || 0) + 1);
      }
    }
    for (const player of game.clubs.flatMap(club => club.squad)) assert.equal(player.assists, counts.get(player.id) || 0);
  }
  assert.ok(assisted > 0);
  assert.ok(unassisted > 0);
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(restored.clubs.flatMap(club => club.squad).reduce((sum, player) => sum + player.assists, 0), assisted);
  startNextSeason(restored);
  assert.ok(restored.clubs.every(club => club.squad.every(player => player.assists === 0)));
});

test("legacy players without assist counters can receive assists without NaN", () => {
  const game = createGame(42);
  for (const player of game.clubs.flatMap(club => club.squad)) delete player.assists;
  advanceWeek(game);
  const assisted = game.clubs.flatMap(club => club.squad).filter(player => player.assists !== undefined);
  assert.ok(assisted.length > 0);
  assert.ok(assisted.every(player => Number.isInteger(player.assists) && player.assists > 0));
});
