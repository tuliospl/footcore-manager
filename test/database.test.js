import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseClubCsv, readCsv, clubToCsv, MAX_CSV_BYTES } from "../src/club-csv.js";
import { validateDatabase } from "../src/database.js";
import { createGame, createGameFromDatabase, advanceWeek, getUserClub, finishLiveRound } from "../src/core.js";
import { startMatch, resumeMatch, advanceMatchMinute, takePenalty } from "../src/match.js";
import { replaceCareer, restoreCareer } from "../src/career-storage.js";
import { renderRound } from "../src/round-view.js";
import { renderMatchEvents } from "../src/match-view.js";

const example = name => readFileSync(new URL(`../examples/times/${name}.csv`, import.meta.url), "utf8");
const source = example("aurora");
const imported = () => ["aurora", "serra"].map(name => {
  const result = parseClubCsv(example(name), `${name}.csv`);
  assert.equal(result.ok, true, result.errors.join("\n"));
  return result.club;
});
const database = clubs => ({ version: 1, name: "Liga CSV", clubs: clubs || imported() });

test("imports complete CSV examples, UTF-8 BOM, CRLF and accents", () => {
  const result = parseClubCsv(`\uFEFF${source}`, "AURORA.CSV");
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.club.name, "Aurora FC");
  assert.equal(result.club.squad.length, 16);
  assert.equal(result.club.colors[0], "#ffd43b");
  assert.equal(result.club.coach, "Técnico de exemplo");
  assert.ok(result.club.squad.every(p => p.overall <= p.potential));
});

test("CSV quoting respects semicolons and doubled quotes; bad quotes report a line", () => {
  assert.deepEqual(readCsv('"Clube; Teste";BRA\n"João ""Canhoto""";G\n'), [{ cells: ["Clube; Teste", "BRA"], line: 1 }, { cells: ['João "Canhoto"', "G"], line: 2 }]);
  assert.throws(() => readCsv('Time;BRA\n"Nome;G'), /Linha 2/);
  assert.throws(() => readCsv('"Time"lixo;BRA'), /ponto e vírgula/);
});

test("maps reference positions and estimates missing attributes transparently", () => {
  const rows = readCsv(source).map(row => row.cells);
  rows[0][2] = "65";
  rows[1] = ["Teste Ponta", "WG", "BRA", "Y", "20", "L", "S", "Dri", "Vel", "6"];
  const result = parseClubCsv(rows.map(r => r.join(";")).join("\n"));
  assert.equal(result.ok, true, result.errors.join("\n"));
  const p = result.club.squad[0];
  assert.equal(p.position, "ATA");
  assert.equal(p.overall, 83);
  assert.ok(p.potential > p.overall && p.potential <= 93);
  assert.equal(p.calibration.method, "estimated");
  assert.equal(p.source.extra, 6);
  assert.ok(result.warnings.some(w => w.includes("estimado")));
  assert.ok(result.warnings.some(w => w.includes("pontas")));
});

test("explicit overall overrides star estimation; CSV roundtrip keeps attributes", () => {
  const club = imported()[0];
  club.squad[0].name = 'João "Goleiro"; Silva';
  club.squad[0].source.star = true;
  const result = parseClubCsv(clubToCsv(club));
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.club.squad, club.squad);
});

test("incomplete squads and missing goalkeepers cannot start a career", () => {
  assert.equal(parseClubCsv("Clube único;BRA;65").ok, false);
  const clubs = imported();
  clubs[0].squad = clubs[0].squad.filter(p => p.position !== "GOL");
  const result = validateDatabase(database(clubs));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("goleiro")));
});

test("malformed field values, CSS injection, excessive size and binary extensions are rejected", () => {
  for (const [column, value] of [[1, "ZZ"], [3, "talvez"], [4, "abc"], [5, "X"], [9, "8"], [10, "NaN"], [11, "1"], [12, "-1"]]) {
    const rows = readCsv(source).map(row => row.cells);
    rows[1][column] = value;
    assert.equal(parseClubCsv(rows.map(r => r.join(";")).join("\n")).ok, false, `column ${column}`);
  }
  assert.equal(parseClubCsv(source.replace("ffd43b", "url(evil)")).ok, false);
  assert.equal(parseClubCsv("a".repeat(MAX_CSV_BYTES + 1)).ok, false);
  assert.match(parseClubCsv("binary", "time.m26").errors[0], /binários/);
});

test("database rejects odd leagues, duplicate IDs, unsupported versions and invalid manager", () => {
  const clubs = imported();
  assert.equal(validateDatabase(database([clubs[0]])).ok, false);
  assert.equal(validateDatabase(database([clubs[0], clubs[0]])).ok, false);
  const data = database();
  data.clubs[1].squad[0].id = data.clubs[0].squad[0].id;
  assert.equal(validateDatabase(data).ok, false);
  assert.equal(validateDatabase({ ...database(), version: 2 }).ok, false);
  assert.throws(() => createGameFromDatabase(database(), "missing"), /Escolha um clube/);
});

test("import initializes playable independent careers with zero stats and no inherited players", () => {
  const data = database();
  const original = structuredClone(data);
  const game = createGameFromDatabase(data, data.clubs[1].id, 42);
  assert.equal(getUserClub(game).name, "Atlético da Serra");
  assert.equal(game.clubs.length, 2);
  assert.equal(game.market.length, 0);
  assert.equal(game.schedule.length, 2);
  assert.equal(game.table.length, 2);
  for (const club of game.clubs) for (const p of club.squad) {
    assert.equal(p.goals, 0); assert.equal(p.assists, 0); assert.equal(p.ratedMatches, 0);
    assert.ok(Number.isFinite(p.value)); assert.ok(Number.isFinite(p.salary));
  }
  game.clubs[0].squad[0].name = "Changed";
  assert.deepEqual(data, original);
  assert.equal(advanceWeek(game).ok, true);
  assert.equal(advanceWeek(game).ok, true);
  assert.equal(game.finished, true);
  assert.ok(game.table.every(row => row.played === 2));
});

test("20-club schedule has 38 rounds and every home/away pairing exactly once", () => {
  const base = imported()[0];
  const clubs = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(base), id: `club-${i}`, squad: base.squad.map((p, j) => ({ ...p, id: `p-${i}-${j}` })) }));
  const game = createGameFromDatabase(database(clubs), "club-19", 42);
  const pairings = game.schedule.flat().map(m => `${m.homeId}/${m.awayId}`);
  assert.equal(game.schedule.length, 38);
  assert.equal(new Set(pairings).size, 380);
  for (const round of game.schedule) assert.equal(new Set(round.flatMap(m => [m.homeId, m.awayId])).size, 20);
});

test("an imported live round completes and records ratings", () => {
  const data = database();
  const game = createGameFromDatabase(data, data.clubs[0].id, 81);
  assert.equal(startMatch(game).ok, true);
  let steps = 0;
  while (game.activeMatch.phase !== "finished" && steps++ < 200) {
    if (game.activeMatch.phase === "penalty") takePenalty(game);
    else { if (game.activeMatch.phase !== "playing") resumeMatch(game); advanceMatchMinute(game); }
  }
  assert.equal(game.activeMatch.phase, "finished");
  assert.equal(finishLiveRound(game).ok, true);
  assert.ok(game.clubs.every(c => c.squad.some(p => p.ratedMatches === 1)));
});

test("external names and event messages are displayed as text, not HTML", () => {
  const clubs = imported();
  clubs[0].name = '<img src=x onerror="attack()">';
  clubs[0].squad[0].name = '<script>attack()</script>';
  const game = createGameFromDatabase(database(clubs), clubs[0].id, 42);
  startMatch(game);
  const rendered = renderRound(game, 1000);
  assert.ok(!rendered.includes('<img src=x'));
  assert.ok(rendered.includes('&lt;img'));
  const events = renderMatchEvents(game, [{ minute: 5, message: '<script>attack()</script>', clubId: game.userClubId }]);
  assert.ok(!events.includes('<script>'));
  assert.ok(events.includes('&lt;script&gt;'));
});

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test("career replacement keeps a restorable copy and restores the exact original progression", () => {
  const storage = memoryStorage();
  const old = createGame(1), next = createGame(2);
  advanceWeek(old);
  replaceCareer(storage, "save", old, next);
  assert.deepEqual(JSON.parse(storage.getItem("save-previous")), old);
  assert.deepEqual(restoreCareer(storage, "save", next), old);
  assert.deepEqual(JSON.parse(storage.getItem("save-previous")), next);
});

test("storage failures never overwrite the current save", () => {
  const old = createGame(1), next = createGame(2);
  for (const failAt of ["save-previous", "save"]) {
    const storage = memoryStorage();
    storage.setItem("save", JSON.stringify(old));
    const original = storage.setItem;
    storage.setItem = (key, value) => { if (key === failAt) throw new Error("Quota exceeded"); original(key, value); };
    assert.throws(() => replaceCareer(storage, "save", old, next));
    assert.deepEqual(JSON.parse(storage.getItem("save")), old);
  }
});
