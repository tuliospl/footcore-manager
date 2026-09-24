import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseClubCsv } from "../src/club-csv.js";
import { createGameFromDatabase, advanceWeek } from "../src/core.js";
import { validateCatalog, catalogTeams, catalogRows } from "../src/catalog-view.js";
import { badgeContent } from "../src/club-badge.js";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("data/m26/catalog.json", root), "utf8"));
const csv = team => readFileSync(new URL(team.csv, root), "utf8");

test("all 559 converted clubs and 15400 player records pass the actual game importer", () => {
  validateCatalog(catalog);
  assert.equal(catalog.teams.length, 559);
  assert.equal(catalog.players, 15400);
  assert.equal(catalog.countries.length, 18);
  let players = 0;
  const ids = new Set();
  for (const team of catalog.teams) {
    const result = parseClubCsv(csv(team), team.csv);
    assert.equal(result.ok, true, `${team.name}: ${result.errors.join("; ")}`);
    assert.equal(result.club.name, team.name);
    assert.equal(result.club.country, team.country);
    assert.equal(result.club.squad.length, team.players);
    assert.equal(ids.has(result.club.id), false, `Duplicate ${team.name}`);
    ids.add(result.club.id);
    players += result.club.squad.length;
    assert.ok(existsSync(new URL(team.badgePath, root)));
    assert.equal(readFileSync(new URL(team.badgePath, root)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
  assert.equal(players, 15400);
});

test("catalog filters accents and countries without losing cross-filter selections", () => {
  assert.equal(catalogTeams(catalog, "BRA", "").length, 99);
  const teams = catalogTeams(catalog, "BRA", "sao paulo");
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, "São Paulo");
  assert.equal(catalogTeams(catalog, "ENG", "sao paulo").length, 0);
  const selection = new Set([teams[0].id]);
  assert.match(catalogRows(catalog, "all", "sao paulo", selection), /checked/);
});

test("Flamengo data and badge survive career creation; imported league simulates", () => {
  const teams = ["Flamengo", "Palmeiras"].map(name => catalog.teams.find(t => t.name === name && t.country === "BRA"));
  const clubs = teams.map(t => ({ ...parseClubCsv(csv(t), t.csv).club, badgePath: t.badgePath }));
  assert.equal(clubs[0].stadium.name, "Maracanã");
  assert.equal(clubs[0].stadium.capacity, 78500);
  assert.equal(clubs[0].squad.length, 30);
  const rossi = clubs[0].squad.find(p => p.name === "Agustín Rossi");
  assert.equal(rossi.position, "GOL");
  assert.equal(rossi.age, 31);
  assert.equal(rossi.source.country, "ARG");
  const pedro = clubs[0].squad.find(p => p.name === "Pedro");
  assert.equal(pedro.position, "ATA");
  assert.equal(pedro.source.extra, 6);
  assert.equal(pedro.overall, 81); // Reviewed Footcore anchor, not the source club strength.
  const game = createGameFromDatabase({ version: 1, name: "MKFP", clubs }, clubs[0].id, 42);
  assert.equal(game.clubs[0].badgePath, teams[0].badgePath);
  assert.match(badgeContent(game.clubs[0]), /<img/);
  assert.equal(advanceWeek(game).ok, true);
  assert.ok(game.table.every(row => row.played === 1));
});

test("catalog rejects unexpected asset paths; badge HTML rejects external URLs", () => {
  const bad = structuredClone(catalog);
  bad.teams[0].csv = "https://example.com/data.csv";
  assert.throws(() => validateCatalog(bad), /inválido/);
  assert.equal(badgeContent({ shortName: '<x>', badgePath: 'https://example.com/logo.png' }), '&lt;x&gt;');
});
