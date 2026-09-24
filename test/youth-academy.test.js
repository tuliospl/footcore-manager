import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advanceWeek, getUserClub, sellPlayer, loanOutAcademyGraduate } from "../src/core.js";
import {
  advanceYouthAcademy,
  ageYouthAcademy,
  ensureYouthAcademy,
  hireScout,
  promoteProspect,
  refreshScoutMarket,
  releaseProspect,
  scoutContractCost,
  scoutMarketRoundsRemaining,
  sortYouthProspects,
  startScouting
} from "../src/youth-academy.js";

function hireByExperience(game, experience) {
  const academy = ensureYouthAcademy(game);
  let scout = academy.candidateScouts.find(item => item.experience === experience);
  if (!scout) {
    scout = { id: `test-scout-${experience}`, name: `Olheiro Teste ${experience}`, experience, specialty: "bra", salary: 2500 + experience * 2200, signingFee: 1000, availableUntil: 99 };
    academy.candidateScouts.push(scout);
  }
  getUserClub(game).budget = 100_000_000;
  assert.equal(hireScout(game, scout.id).ok, true);
  return academy.scouts.find(item => item.id === scout.id);
}

test("experienced scouts finish faster and return more, stronger talents", () => {
  const beginnerGame = createGame(314);
  const eliteGame = createGame(314);
  const beginner = hireByExperience(beginnerGame, 1);
  const elite = hireByExperience(eliteGame, 5);
  assert.equal(startScouting(beginnerGame, beginner.id, "sam").ok, true);
  assert.equal(startScouting(eliteGame, elite.id, "sam").ok, true);
  assert.ok(beginner.mission.roundsRemaining > elite.mission.roundsRemaining);
  for (let round = 0; round < 6; round++) {
    advanceYouthAcademy(beginnerGame);
    advanceYouthAcademy(eliteGame);
  }
  const beginnerTalents = ensureYouthAcademy(beginnerGame).prospects;
  const eliteTalents = ensureYouthAcademy(eliteGame).prospects;
  assert.ok(eliteTalents.length > beginnerTalents.length);
  assert.ok(eliteTalents.reduce((sum, player) => sum + player.potential, 0) / eliteTalents.length > beginnerTalents.reduce((sum, player) => sum + player.potential, 0) / beginnerTalents.length);
  assert.equal(ensureYouthAcademy(beginnerGame).scouts.some(scout => scout.id === beginner.id), false);
  assert.equal(ensureYouthAcademy(eliteGame).scouts.some(scout => scout.id === elite.id), false);
});

test("a scout leaves after delivering one report and stops charging salary", () => {
  const game = createGame(405);
  const scout = hireByExperience(game, 5);
  startScouting(game, scout.id, "eur");
  while (scout.mission) advanceYouthAcademy(game);
  const academy = ensureYouthAcademy(game);
  assert.equal(academy.scouts.some(item => item.id === scout.id), false);
  assert.ok(academy.prospects.length > 0);
  const budgetAfterReport = getUserClub(game).budget;
  advanceYouthAcademy(game);
  assert.equal(getUserClub(game).budget, budgetAfterReport);
});

test("scout payroll is charged each round and regular match progression advances missions", () => {
  const game = createGame(81);
  const scout = hireByExperience(game, 5);
  assert.equal(startScouting(game, scout.id, "bra").ok, true);
  const budget = getUserClub(game).budget;
  const remaining = scout.mission.roundsRemaining;
  assert.equal(advanceWeek(game).ok, true);
  assert.ok(getUserClub(game).budget < budget + 1_000_000);
  assert.equal(scout.mission.roundsRemaining, remaining - 1);
});

test("academy talents can be promoted at 16, released and developed between seasons", () => {
  const game = createGame(912);
  const scout = hireByExperience(game, 5);
  startScouting(game, scout.id, "afr");
  while (scout.mission) advanceYouthAcademy(game);
  const academy = ensureYouthAcademy(game);
  const prospect = academy.prospects[0];
  prospect.age = 15;
  assert.equal(promoteProspect(game, prospect.id).ok, false);
  const beforeOverall = prospect.overall;
  ageYouthAcademy(game);
  assert.equal(prospect.age, 16);
  assert.ok(prospect.overall > beforeOverall);
  const squadSize = getUserClub(game).squad.length;
  assert.equal(promoteProspect(game, prospect.id).ok, true);
  assert.equal(getUserClub(game).squad.length, squadSize + 1);
  assert.equal(prospect.contractEndSeason, game.season + 3);
  const disposable = academy.prospects[0];
  assert.equal(releaseProspect(game, disposable.id).ok, true);
  assert.equal(academy.prospects.includes(disposable), false);
});

test("academy graduates cannot be promoted and immediately sold for their projected value", () => {
  const game = createGame(913);
  const scout = hireByExperience(game, 5);
  startScouting(game, scout.id, "sam");
  while (scout.mission) advanceYouthAcademy(game);
  const prospect = ensureYouthAcademy(game).prospects[0];
  prospect.age = 18;
  assert.equal(promoteProspect(game, prospect.id).ok, true);
  const club = getUserClub(game);
  const budget = club.budget;
  assert.equal(sellPlayer(game, prospect.id).ok, false);
  assert.equal(club.budget, budget);
  assert.equal(club.squad.includes(prospect), true);

  prospect.appearances = 5;
  const expectedFee = Math.round(prospect.value * 0.1 / 1000) * 1000;
  assert.equal(sellPlayer(game, prospect.id).ok, true);
  assert.equal(club.budget, budget + expectedFee);
});

test("academy graduates can develop on loan and return automatically", () => {
  const game = createGame(321);
  const owner = getUserClub(game);
  owner.reputation = 95;
  const player = owner.squad.find(item => item.position !== "GOL");
  player.academyGraduate = true;
  player.age = 19;
  player.overall = 82;
  player.potential = 95;
  const startingOverall = player.overall;
  const result = loanOutAcademyGraduate(game, player.id);
  assert.equal(result.ok, true);
  assert.ok(!owner.squad.includes(player));
  const borrower = game.clubs.find(club => club.id === player.loan.borrowerClubId);
  assert.ok(borrower.squad.includes(player));
  assert.equal(player.loan.ownerClubId, owner.id);
  while (!game.finished) assert.equal(advanceWeek(game).ok, true);
  assert.ok(owner.squad.includes(player));
  assert.equal(player.loan, undefined);
  assert.ok(player.appearances >= 8);
  assert.ok(player.overall > startingOverall);
});

test("academy prospects sort by every visible column without mutating their saved order", () => {
  const prospects = [
    { id: "b", name: "Bruno", position: "ATA", age: 17, overall: 58, potential: 82, value: 2_000_000 },
    { id: "a", name: "Álvaro", position: "ZAG", age: 16, overall: 55, potential: 90, value: 1_500_000 }
  ];
  assert.deepEqual(sortYouthProspects(prospects, "name", "asc").map(player => player.id), ["a", "b"]);
  assert.deepEqual(sortYouthProspects(prospects, "position", "asc").map(player => player.id), ["b", "a"]);
  assert.deepEqual(sortYouthProspects(prospects, "age", "asc").map(player => player.id), ["a", "b"]);
  assert.deepEqual(sortYouthProspects(prospects, "overall", "desc").map(player => player.id), ["b", "a"]);
  assert.deepEqual(sortYouthProspects(prospects, "potential", "desc").map(player => player.id), ["a", "b"]);
  assert.deepEqual(sortYouthProspects(prospects, "value", "desc").map(player => player.id), ["b", "a"]);
  assert.deepEqual(prospects.map(player => player.id), ["b", "a"]);
});

test("scout market renews every four rounds with changing people and specialties", () => {
  const game = createGame(733);
  const academy = ensureYouthAcademy(game);
  const initialIds = academy.candidateScouts.map(scout => scout.id);
  assert.equal(academy.candidateScouts.length, 7);
  assert.equal(scoutMarketRoundsRemaining(game), 4);
  for (let round = 0; round < 3; round++) advanceYouthAcademy(game);
  assert.deepEqual(academy.candidateScouts.map(scout => scout.id), initialIds);
  assert.equal(scoutMarketRoundsRemaining(game), 1);
  advanceYouthAcademy(game);
  assert.equal(academy.candidateScouts.length, 7);
  assert.notDeepEqual(academy.candidateScouts.map(scout => scout.id), initialIds);
  assert.equal(scoutMarketRoundsRemaining(game), 4);
  assert.equal(refreshScoutMarket(game), false);
});

test("elite scouts are much rarer than inexperienced professionals", () => {
  const totals = [0, 0, 0, 0, 0, 0];
  const specialties = new Set();
  let marketsWithoutElite = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const scouts = ensureYouthAcademy(createGame(seed)).candidateScouts;
    if (!scouts.some(scout => scout.experience === 5)) marketsWithoutElite++;
    for (const scout of scouts) { totals[scout.experience]++; specialties.add(scout.specialty); }
  }
  assert.ok(totals[1] > totals[2] && totals[2] > totals[3] && totals[3] > totals[4] && totals[4] > totals[5]);
  assert.ok(marketsWithoutElite > 140);
  assert.equal(specialties.size, 6);
});

test("elite scouting is a major investment compared with entry-level reports", () => {
  const beginnerCost = scoutContractCost({ experience: 1, signingFee: 75_000, salary: 5_000 });
  const eliteCost = scoutContractCost({ experience: 5, signingFee: 4_500_000, salary: 90_000 });
  assert.equal(beginnerCost, 105_000);
  assert.equal(eliteCost, 4_680_000);
  assert.ok(eliteCost > beginnerCost * 40);

  const game = createGame(91);
  game.academy = { version: 2, scouts: [], prospects: [], candidateScouts: [{ id: "cheap-elite", name: "Elite barato", experience: 5, specialty: "eur", salary: 13_500, signingFee: 488_000 }], nextProspectId: 1 };
  const academy = ensureYouthAcademy(game);
  assert.equal(academy.version, 3);
  assert.equal(academy.candidateScouts.some(scout => scout.id === "cheap-elite"), false);
});
