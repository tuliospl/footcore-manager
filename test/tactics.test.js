import test from "node:test";
import assert from "node:assert/strict";
import { createGame, getUserClub, getLineup } from "../src/core.js";
import { FORMATIONS, formationPositions, positionalRating } from "../src/tactics.js";
import { startMatch, ensureMatchTactics, matchPlayerRating, matchStrength, setMatchFormation, moveMatchPlayer, resumeMatch, pauseMatch } from "../src/match.js";

function setup() {
  const game = createGame(42);
  startMatch(game);
  return { game, club: getUserClub(game), team: game.activeMatch.teams[game.userClubId] };
}

test("formations automatically keep the same eleven and prefer their natural positions", () => {
  const { game, club, team } = setup();
  const original = [...team.onField].sort();
  for (const formation of Object.keys(FORMATIONS)) {
    assert.equal(setMatchFormation(game, formation).ok, true);
    assert.equal(team.slots.length, 11);
    assert.deepEqual([...team.slots].sort(), original);
    assert.equal(club.squad.find(p => p.id === team.slots[0]).position, "GOL");
    assert.equal(team.substitutions, 0);
    assert.equal(club.formation, formation);
  }
  setMatchFormation(game, "4-4-2");
  for (const player of getLineup(club)) assert.equal(matchPlayerRating(game, club.id, player).outOfPosition, false);
  const saved = JSON.stringify(game);
  assert.equal(setMatchFormation(game, "unknown").ok, false);
  assert.equal(JSON.stringify(game), saved);
  resumeMatch(game);
  assert.equal(setMatchFormation(game, "4-3-3").ok, false);
});

test("moving attackers into defence visibly and actually reduces match strength without changing base ratings", () => {
  const { game, club, team } = setup();
  const positions = formationPositions(team.formation);
  const attacker = club.squad.find(p => p.id === team.slots[positions.indexOf("ATA")]);
  const before = matchStrength(game, club.id);
  const base = attacker.overall;
  assert.equal(moveMatchPlayer(game, attacker.id, positions.indexOf("ZAG")).ok, true);
  const rating = matchPlayerRating(game, club.id, attacker);
  assert.equal(rating.position, "ZAG");
  assert.equal(rating.overall, Math.round(base * 0.8));
  assert.equal(rating.outOfPosition, true);
  assert.ok(matchStrength(game, club.id) < before);
  assert.equal(attacker.overall, base);
  setMatchFormation(game, "4-4-2");
  assert.equal(matchStrength(game, club.id), before);
  assert.equal(positionalRating({ position: "MC", overall: 80 }, "VOL").overall, 72);
});

test("bench drops before kickoff are free and update participants; live drops enforce substitution rules", () => {
  const { game, club, team } = setup();
  const reserve = club.squad.find(p => team.bench.includes(p.id) && p.position === "ATA");
  const slot = formationPositions(team.formation).indexOf("ATA");
  const out = team.slots[slot];
  assert.equal(moveMatchPlayer(game, reserve.id, slot).ok, true);
  assert.equal(team.substitutions, 0);
  assert.ok(team.bench.includes(out));
  assert.ok(!team.participants.includes(out));
  resumeMatch(game);
  assert.equal(moveMatchPlayer(game, out, slot).ok, false);
  pauseMatch(game);
  assert.equal(moveMatchPlayer(game, out, slot).ok, true);
  assert.equal(team.substitutions, 1);
  assert.ok(team.replaced.includes(reserve.id));
  assert.equal(moveMatchPlayer(game, reserve.id, slot).ok, false);
  assert.equal(new Set(team.slots).size, 11);
});

test("dismissed keeper leaves a vacancy and a replacement keeper takes goal without adding an eleventh player", () => {
  const { game, club, team } = setup();
  const sentOff = team.slots[0];
  team.onField = team.onField.filter(id => id !== sentOff);
  team.sentOff.push(sentOff);
  team.slots[0] = null;
  game.activeMatch.phase = "paused";
  assert.equal(resumeMatch(game).ok, false);
  const keeper = club.squad.find(p => team.bench.includes(p.id) && p.position === "GOL");
  assert.equal(moveMatchPlayer(game, keeper.id, 0).ok, false);
  assert.equal(moveMatchPlayer(game, keeper.id, 1).ok, true);
  assert.equal(team.slots[0], keeper.id);
  assert.equal(team.slots[1], null);
  assert.equal(team.onField.length, 10);
  assert.equal(resumeMatch(game).ok, true);
  pauseMatch(game);
  setMatchFormation(game, "3-5-2");
  assert.equal(team.slots.filter(Boolean).length, 10);
  assert.ok(!team.slots.includes(sentOff));
  assert.equal(team.slots[0], keeper.id);
  assert.equal(moveMatchPlayer(game, keeper.id, 2).ok, false);
});

test("saved formations, custom positions and old live saves survive reload", () => {
  const { game, team } = setup();
  setMatchFormation(game, "4-3-3");
  moveMatchPlayer(game, team.slots[9], 2);
  const saved = JSON.parse(JSON.stringify(game));
  ensureMatchTactics(saved);
  assert.deepEqual(saved, game);
  for (const side of Object.values(saved.activeMatch.teams)) { delete side.formation; delete side.slots; }
  ensureMatchTactics(saved);
  for (const side of Object.values(saved.activeMatch.teams)) {
    assert.equal(side.formation, "4-4-2");
    assert.deepEqual(side.slots.filter(Boolean).sort(), [...side.onField].sort());
  }
});
