import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub } from "../src/core.js";
import { startMatch, takePenalty, advanceMatchMinute } from "../src/match.js";
import { renderPenaltyDialog } from "../src/penalty-view.js";

function fixture() {
  const game = createGame(42); startMatch(game);
  game.activeMatch.phase = "penalty";
  game.activeMatch.minute = 23;
  game.activeMatch.pendingPenalty = { clubId: game.userClubId };
  return game;
}

test("penalty popup lists only eligible players and preselects the assigned taker", () => {
  const game = fixture(); const team = game.activeMatch.teams[game.userClubId];
  const expelled = team.onField.find(id => id !== team.takerId);
  team.onField = team.onField.filter(id => id !== expelled); team.sentOff.push(expelled);
  const html = renderPenaltyDialog(game);
  assert.equal((html.match(/type="radio"/g) || []).length, team.onField.length);
  for (const id of [...team.bench, expelled]) assert.ok(!html.includes(`value="${id}"`));
  assert.ok(html.includes(`value="${team.takerId}" checked`));
  assert.ok(html.includes("Energia"));
  assert.ok(!html.includes("data-formation"));
});

test("choosing and kicking is one operation that records the chosen taker exactly once", () => {
  const game = fixture(); const match = game.activeMatch; const team = match.teams[game.userClubId];
  const chosen = team.onField.find(id => id !== team.takerId);
  assert.equal(takePenalty(game, chosen).ok, true);
  const kick = match.events.find(event => event.type === "goal" || event.type === "penalty-miss");
  assert.equal(kick.scorerId || kick.playerId, chosen);
  assert.equal(team.takerId, chosen);
  assert.equal(renderPenaltyDialog(game), "");
  const after = JSON.stringify(game);
  assert.equal(takePenalty(game, chosen).ok, false);
  assert.equal(JSON.stringify(game), after);
});

test("invalid and reserve selections leave the pending penalty unchanged", () => {
  const game = fixture(); const team = game.activeMatch.teams[game.userClubId];
  const before = JSON.stringify(game);
  for (const id of [null, "unknown", team.bench[0]]) {
    assert.equal(takePenalty(game, id).ok, false);
    assert.equal(JSON.stringify(game), before);
  }
  const saved = JSON.parse(before);
  assert.ok(renderPenaltyDialog(saved).includes(getUserClub(game).name));
});


test("scored and missed penalties resume the match clock automatically", () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const game = fixture();
    const match = game.activeMatch;
    match.rngState = seed;
    assert.equal(takePenalty(game).ok, true);
    outcomes.add(match.events.find(event => ["goal", "penalty-miss"].includes(event.type)).type);
    assert.equal(match.phase, "playing");
    assert.equal(match.pendingPenalty, null);
    assert.equal(advanceMatchMinute(game).ok, true);
    assert.equal(match.minute, 24);
  }
  assert.deepEqual([...outcomes].sort(), ["goal", "penalty-miss"]);
});
