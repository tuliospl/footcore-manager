import { ensureLineup, lineupError, setLineupFormation } from "./lineup.js";
import { advanceWeek, getClub, getLineup, mulberry32 } from "./core.js";
import { attackingWeight, creativeWeight, defensiveWeight, weightedPlayer } from "./player-impact.js";
import { markingStyle } from "./marking.js";

import { FORMATIONS, arrangePlayers, formationPositions, positionalRating } from "./tactics.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (random, items) => items[Math.floor(random() * items.length)];
const fail = message => ({ ok: false, message });

export function matchPlayers(game, clubId) {
  const team = game.activeMatch?.teams[clubId];
  return team ? team.onField.map(id => getClub(game, clubId).squad.find(player => player.id === id)) : [];
}

export function ensureMatchTactics(game) {
  if (!game.activeMatch) return;
  for (const [clubId, team] of Object.entries(game.activeMatch.teams)) {
    team.formation = Object.hasOwn(FORMATIONS, team.formation) ? team.formation : "4-4-2";
    team.slots ??= arrangePlayers(matchPlayers(game, clubId), team.formation);
    if (!team.minutes) {
      team.minutes = {};
      for (const id of team.participants) {
        const entry = game.activeMatch.events.find(event => event.inId === id)?.minute ?? 0;
        const exit = game.activeMatch.events.find(event => event.outId === id || (event.type === "red" && event.playerId === id))?.minute ?? game.activeMatch.minute;
        team.minutes[id] = Math.max(0, exit - entry);
      }
    }
  }
}

export function matchPlayerRating(game, clubId, player) {
  const team = game.activeMatch.teams[clubId];
  const position = formationPositions(team.formation)[team.slots.indexOf(player.id)];
  return { position, ...positionalRating(player, position) };
}

export function setMatchFormation(game, formation) {
  if (!game.activeMatch || !["ready", "paused", "halftime"].includes(game.activeMatch.phase)) return fail("Pause a partida para mudar o esquema.");
  if (!Object.hasOwn(FORMATIONS, formation)) return fail("Esquema inválido.");
  ensureMatchTactics(game);
  const team = game.activeMatch.teams[game.userClubId];
  team.formation = formation;
  team.slots = arrangePlayers(matchPlayers(game, game.userClubId), formation);
  const club=getClub(game,game.userClubId);
  if(club.lineup) setLineupFormation(club,formation);
  else club.formation=formation;
  return { ok: true, message: `Esquema ${formation}: jogadores reposicionados.` };
}

export function moveMatchPlayer(game, playerId, slotIndex) {
  if (!game.activeMatch || !["ready", "paused", "halftime"].includes(game.activeMatch.phase)) return fail("Pause a partida para organizar a equipe.");
  ensureMatchTactics(game);
  const team = game.activeMatch.teams[game.userClubId];
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 11) return fail("Posição inválida.");
  const targetId = team.slots[slotIndex];
  if (team.bench.includes(playerId)) {
    if (!targetId) return fail("Uma vaga deixada por expulsão não pode receber um reserva. Substitua um atleta em campo.");
    return substitute(game, game.userClubId, targetId, playerId);
  }
  const from = team.slots.indexOf(playerId);
  if (from < 0 || !team.onField.includes(playerId)) return fail("Esse atleta não está disponível.");
  const keeper = matchPlayers(game, game.userClubId).find(player => player.position === "GOL");
  if (keeper && ((playerId === keeper.id && slotIndex !== 0) || (targetId === keeper.id && from !== 0))) return fail("Mantenha o goleiro na posição GOL.");
  [team.slots[from], team.slots[slotIndex]] = [team.slots[slotIndex], team.slots[from]];
  return { ok: true, message: "Posições atualizadas." };
}

function randomFor(match) {
  const random = mulberry32(match.rngState);
  match.rngState += 997;
  return random;
}

function addEvent(match, type, clubId, message, details = {}) {
  match.events.push({ minute: match.minute, type, clubId, message, ...details });
}

function defaultTaker(game, clubId) {
  return [...matchPlayers(game, clubId)].sort((a, b) => (b.overall + (b.position === "ATA" ? 5 : 0)) - (a.overall + (a.position === "ATA" ? 5 : 0)))[0]?.id;
}

function createLiveMatch(game, fixture, seedOffset = 0) {
  const match = { ...fixture, season: game.season, week: game.week, minute: 0, phase: "ready", homeGoals: 0, awayGoals: 0, rngState: game.rngState + 173 + seedOffset, endMinute: 93 + (game.season + game.week) % 4, events: [], pendingPenalty: null, teams: {} };
  for (const clubId of [fixture.homeId, fixture.awayId]) {
    const club = getClub(game, clubId);
    const onField = getLineup(club).map(player => player.id);
    const plan=club.lineup ? ensureLineup(club) : null;
    match.teams[clubId] = { slots: plan ? [...plan.slots] : undefined, onField, bench: plan ? [...plan.bench] : club.squad.filter(player => !onField.includes(player.id)).map(player => player.id).slice(0,7), participants: [...onField], replaced: [], sentOff: [], substitutions: 0, yellows: {}, energy: Object.fromEntries(club.squad.map(player => [player.id, 100])), minutes: {}, shots: 0, takerId: null, formation: club.formation || "4-4-2" };
  }
  const context = { ...game, activeMatch: match };
  ensureMatchTactics(context);
  for (const clubId of Object.keys(match.teams)) match.teams[clubId].takerId = defaultTaker(context, clubId);
  addEvent(match, "info", null, "Equipes em campo. Aguardando o início da rodada.");
  return match;
}

export function startMatch(game) {
  if (game.activeMatch) return fail("Já há uma partida em andamento.");
  if (game.finished) return fail("Inicie a próxima temporada primeiro.");
  const fixture = game.schedule[game.week].find(item => item.homeId === game.userClubId || item.awayId === game.userClubId);
  if (!fixture) return { ...advanceWeek(game), bye: true };
  const error=lineupError(getClub(game,game.userClubId));
  if(error) return fail(error);
  game.activeMatch = createLiveMatch(game, fixture);
  ensureLiveRound(game);
  return { ok: true };
}

export function ensureLiveRound(game) {
  if (!game.activeMatch) return;
  ensureMatchTactics(game);
  if (!game.liveRound) {
    game.liveRound = game.schedule[game.week].filter(fixture => fixture.homeId !== game.activeMatch.homeId)
      .map((fixture, index) => createLiveMatch(game, fixture, (index + 1) * 1777));
  }
  syncOtherMatches(game);
}

export function liveRoundMatches(game) {
  if (!game.activeMatch) return [];
  return game.schedule[game.week].map(fixture => fixture.homeId === game.activeMatch.homeId ? game.activeMatch : game.liveRound?.find(match => match.homeId === fixture.homeId)).filter(Boolean);
}

function syncOtherMatches(game) {
  const own = game.activeMatch;
  const target = own.phase === "finished" ? own.endMinute : own.minute;
  for (const match of game.liveRound || []) {
    const context = { ...game, activeMatch: match, userClubId: null };
    ensureMatchTactics(context);
    while (match.minute < target && match.phase !== "finished") {
      if (match.phase !== "playing") resumeMatch(context);
      advanceSingleMatchMinute(context);
    }
  }
}

export function advanceMatchMinute(game) {
  const result = advanceSingleMatchMinute(game);
  if (result.ok) syncOtherMatches(game);
  return result;
}

export function resumeMatch(game) {
  const match = game.activeMatch;
  if (!match || !["ready", "paused", "halftime"].includes(match.phase)) return fail("A partida não pode continuar agora.");
  const team = match.teams[game.userClubId];
  if (team && (!team.slots[0] || !team.onField.includes(team.slots[0]))) return fail("Defina um jogador na posição GOL antes de continuar. Use um atleta em campo ou substitua alguém por um goleiro reserva.");
  if (match.phase === "halftime") addEvent(match, "info", null, "Começa o segundo tempo.");
  match.phase = "playing";
  return { ok: true };
}

export function pauseMatch(game) {
  if (game.activeMatch?.phase !== "playing") return fail("A partida já está parada.");
  game.activeMatch.phase = "paused";
  return { ok: true };
}

export function setPenaltyTaker(game, playerId) {
  const team = game.activeMatch?.teams[game.userClubId];
  if (!team || game.activeMatch.phase === "finished" || !team.onField.includes(playerId)) return fail("Escolha um atleta que esteja em campo.");
  team.takerId = playerId;
  return { ok: true };
}

function substitute(game, clubId, outId, inId) {
  const match = game.activeMatch;
  ensureMatchTactics(game);
  const team = match.teams[clubId];
  const pregame = match.phase === "ready";
  if (!pregame && team.substitutions >= 5) return fail("Você já fez as cinco substituições permitidas.");
  if (!team.onField.includes(outId) || !team.bench.includes(inId)) return fail("Selecione um atleta em campo e um reserva disponível.");
  const club = getClub(game, clubId);
  const out = club.squad.find(player => player.id === outId);
  const incoming = club.squad.find(player => player.id === inId);
  const remaining = matchPlayers(game, clubId).filter(player => player.id !== outId);
  if (out.position === "GOL" && incoming.position !== "GOL" && !remaining.some(player => player.position === "GOL")) return fail("Para retirar seu goleiro, coloque outro goleiro.");
  if (incoming.position === "GOL" && remaining.some(player => player.position === "GOL")) return fail("Já há um goleiro em campo.");
  const slot = team.slots.indexOf(outId);
  team.slots[slot] = inId;
  if (incoming.position === "GOL" && slot !== 0) [team.slots[0], team.slots[slot]] = [inId, team.slots[0]];
  team.onField[team.onField.indexOf(outId)] = inId;
  team.bench.splice(team.bench.indexOf(inId), 1);
  if (pregame) {
    team.bench.push(outId);
    team.participants = [...team.onField];
  } else {
    team.replaced.push(outId);
    team.participants.push(inId);
    team.substitutions++;
  }
  if (team.takerId === outId) team.takerId = defaultTaker(game, clubId);
  if (!pregame) addEvent(match, "substitution", clubId, `Sai ${out.name}; entra ${incoming.name}.`, { outId, inId });
  return { ok: true, message: pregame ? "Escalação atualizada." : "Substituição realizada." };
}

export function substitutePlayer(game, outId, inId) {
  if (!game.activeMatch || !["paused", "halftime"].includes(game.activeMatch.phase)) return fail("Pause a partida ou espere o intervalo para substituir.");
  return substitute(game, game.userClubId, outId, inId);
}

export function matchStrength(game, clubId) {
  ensureMatchTactics(game);
  const players = matchPlayers(game, clubId);
  const team = game.activeMatch.teams[clubId];
  const total = players.reduce((sum, player) => sum + matchPlayerRating(game, clubId, player).overall * 0.72 + player.form * 0.12 + player.morale * 0.06 + team.energy[player.id] * 0.1, 0);
  return total / 11 - (team.slots[0] ? 0 : 12);
}

function goal(game, clubId, scorer, random, penalty = false) {
  const match = game.activeMatch;
  const candidates = matchPlayers(game, clubId).filter(player => player.id !== scorer.id && matchPlayerRating(game, clubId, player).position !== "GOL");
  const assister = !penalty && random() >= 0.25 && candidates.length ? weightedPlayer(random, candidates, player => {
    const effective = matchPlayerRating(game, clubId, player);
    return creativeWeight(player, effective.position, effective.overall);
  }) : null;
  const preAssisterCandidates = assister ? candidates.filter(player => player.id !== assister.id) : [];
  const preAssister = preAssisterCandidates.length && random() < 0.55 ? weightedPlayer(random, preAssisterCandidates, player => {
    const effective = matchPlayerRating(game, clubId, player);
    return creativeWeight(player, effective.position, effective.overall);
  }) : null;
  match[clubId === match.homeId ? "homeGoals" : "awayGoals"]++;
  addEvent(match, "goal", clubId, `Gol de ${scorer.name}${penalty ? ", de pênalti" : assister ? `, com assistência de ${assister.name}` : ""}!`, { scorer: scorer.name, scorerId: scorer.id, assister: assister?.name ?? null, assisterId: assister?.id ?? null, preAssister: preAssister?.name ?? null, preAssisterId: preAssister?.id ?? null, penalty });
}

function recordRoleActions(game, clubId, random) {
  const players = matchPlayers(game, clubId).filter(player => matchPlayerRating(game, clubId, player).position !== "GOL");
  if (!players.length) return;
  if (random() < 0.075 * markingStyle(getClub(game, clubId)).tackleMultiplier) {
    const player = weightedPlayer(random, players, item => {
      const effective = matchPlayerRating(game, clubId, item);
      return defensiveWeight(item, effective.position, effective.overall);
    });
    addEvent(game.activeMatch, "tackle", clubId, `${player.name} recupera a bola.`, { playerId: player.id, hidden: true });
  }
  if (random() < 0.05) {
    const player = weightedPlayer(random, players, item => {
      const effective = matchPlayerRating(game, clubId, item);
      return creativeWeight(item, effective.position, effective.overall);
    });
    addEvent(game.activeMatch, "key-pass", clubId, `${player.name} cria uma chance de gol.`, { playerId: player.id, hidden: true });
  }
}

function penalty(game, random) {
  const match = game.activeMatch;
  const clubId = match.pendingPenalty.clubId;
  const team = match.teams[clubId];
  if (!team.onField.includes(team.takerId)) team.takerId = defaultTaker(game, clubId);
  const scorer = matchPlayers(game, clubId).find(player => player.id === team.takerId);
  const opponentId = clubId === match.homeId ? match.awayId : match.homeId;
  const keeper = matchPlayers(game, opponentId).find(player => player.id === match.teams[opponentId].slots[0]);
  const chance = clamp(0.76 + (matchPlayerRating(game, clubId, scorer).overall - (keeper ? matchPlayerRating(game, opponentId, keeper).overall : 35)) * 0.003, 0.55, 0.92);
  team.shots++;
  if (random() < chance) goal(game, clubId, scorer, random, true);
  else {
    const saved = !!keeper && random() < 0.7;
    addEvent(match, "penalty-miss", clubId, saved ? `${keeper.name} defende o pênalti de ${scorer.name}!` : `${scorer.name} cobra o pênalti para fora!`, { playerId: scorer.id, keeperId: saved ? keeper.id : null, saved });
  }
  match.pendingPenalty = null;
}

export function takePenalty(game, playerId) {
  const match = game.activeMatch;
  if (!match || match.phase !== "penalty" || match.pendingPenalty?.clubId !== game.userClubId) return fail("Não há pênalti do seu time para cobrar.");
  if (playerId !== undefined) {
    const selection = setPenaltyTaker(game, playerId);
    if (!selection.ok) return selection;
  }
  ensureMatchTactics(game);
  penalty(game, randomFor(match));
  endMinute(game);
  if (match.phase === "penalty") match.phase = "playing";
  syncOtherMatches(game);
  return { ok: true };
}

function card(game, clubId, random) {
  const match = game.activeMatch;
  const team = match.teams[clubId];
  const players = matchPlayers(game, clubId);
  const unbooked = players.filter(player => !team.yellows[player.id]);
  const player = pick(random, unbooked.length && random() < 0.82 ? unbooked : players);
  const directRed = random() < markingStyle(getClub(game, clubId)).directRedRate;
  if (!directRed) {
    team.yellows[player.id] = (team.yellows[player.id] || 0) + 1;
    addEvent(match, "yellow", clubId, `Cartão amarelo para ${player.name}.`, { playerId: player.id });
  }
  if (directRed || team.yellows[player.id] >= 2) {
    const dismissedSlot = team.slots.indexOf(player.id);
    team.slots[dismissedSlot] = null;
    team.onField.splice(team.onField.indexOf(player.id), 1);
    team.sentOff.push(player.id);
    if (team.takerId === player.id) team.takerId = defaultTaker(game, clubId);
    addEvent(match, "red", clubId, `${player.name} expulso${directRed ? " com vermelho direto" : " pelo segundo amarelo"}!`, { playerId: player.id, secondYellow: !directRed });
    if (team.onField.length < 7) {
      const winnerScore = clubId === match.homeId ? "awayGoals" : "homeGoals";
      const loserScore = clubId === match.homeId ? "homeGoals" : "awayGoals";
      match[winnerScore] = Math.max(match[winnerScore], match[loserScore] + 3);
      match.phase = "finished";
      addEvent(match, "info", null, "Partida encerrada: equipe com menos de sete atletas. Vitória administrativa para o adversário.");
    } else if (clubId === game.userClubId) match.phase = "paused";
    else if (dismissedSlot === 0) coverGoalAfterDismissal(game, clubId);
  }
}

function coverGoalAfterDismissal(game, clubId) {
  const team = game.activeMatch.teams[clubId];
  const club = getClub(game, clubId);
  const reserveKeeper = club.squad.filter(player => team.bench.includes(player.id) && player.position === "GOL").sort((a,b)=>b.overall-a.overall)[0];
  const outfield = matchPlayers(game, clubId).filter(player => player.position !== "GOL").sort((a,b)=>a.overall-b.overall)[0];
  if (!outfield) return;
  if (reserveKeeper && team.substitutions < 5) substitute(game, clubId, outfield.id, reserveKeeper.id);
  else {
    const slot = team.slots.indexOf(outfield.id);
    team.slots[0] = outfield.id;
    team.slots[slot] = null;
    addEvent(game.activeMatch, "info", clubId, `${outfield.name} assume o gol após a expulsão.`);
  }
}

function endMinute(game) {
  const match = game.activeMatch;
  if (match.phase === "finished") return;
  if (match.minute >= match.endMinute) {
    match.phase = "finished";
    addEvent(match, "info", null, "Fim de jogo!");
  } else if (match.minute === 45) {
    match.phase = "halftime";
    addEvent(match, "info", null, "Intervalo. Ajuste a equipe e faça suas substituições.");
  }
}

function advanceSingleMatchMinute(game) {
  const match = game.activeMatch;
  if (!match || match.phase !== "playing") return fail("Continue a partida para avançar o relógio.");
  ensureMatchTactics(game);
  const random = randomFor(match);
  match.minute++;
  for (const clubId of [match.homeId, match.awayId]) {
    const team = match.teams[clubId];
    const marking = markingStyle(getClub(game, clubId));
    team.onField.forEach(id => { team.energy[id] = Math.max(25, team.energy[id] - marking.energyDrain); team.minutes[id] = (team.minutes[id] || 0) + 1; });
    if (random() < marking.liveCardRate) {
      card(game, clubId, random);
      if (match.phase !== "playing") { endMinute(game); return { ok: true }; }
    }
  }
  for (const clubId of [match.homeId, match.awayId]) {
    const opponentId = clubId === match.homeId ? match.awayId : match.homeId;
    const club = getClub(game, clubId);
    const opponent = getClub(game, opponentId);
    recordRoleActions(game, clubId, random);
    if (random() < 0.004) {
      match.pendingPenalty = { clubId };
      addEvent(match, "penalty", clubId, `Pênalti para ${club.name}!`);
      if (clubId === game.userClubId) { match.phase = "penalty"; return { ok: true }; }
      penalty(game, random);
    } else if (random() < 0.11) {
      const attackers = matchPlayers(game, clubId).filter(player => matchPlayerRating(game, clubId, player).position !== "GOL");
      const candidates = attackers.length ? attackers : matchPlayers(game, clubId);
      const scorer = weightedPlayer(random, candidates, player => {
        const effective = matchPlayerRating(game, clubId, player);
        return attackingWeight(player, effective.position, effective.overall);
      });
      const difference = matchStrength(game, clubId) - matchStrength(game, opponentId) + (clubId === match.homeId ? 3 : 0);
      const scorerOverall = matchPlayerRating(game, clubId, scorer).overall;
      const keeper = matchPlayers(game, opponentId).find(p => p.id === match.teams[opponentId].slots[0]);
      const keeperOverall = keeper ? matchPlayerRating(game, opponentId, keeper).overall : 50;
      const chance = clamp(0.13 + difference * 0.005 + (scorerOverall - 75) * 0.0025 - (keeperOverall - 75) * 0.0015 + (club.tactic === "ofensivo" ? 0.035 : 0) - (opponent.tactic === "defensivo" ? 0.025 : 0) + markingStyle(opponent).opponentChanceAdjustment, 0.025, 0.45);
      match.teams[clubId].shots++;
      if (random() < chance) goal(game, clubId, scorer, random);
      else {
        const saved = !!keeper && random() < 0.45;
        addEvent(match, "shot", clubId, saved ? `${keeper.name} defende a finalização de ${scorer.name}.` : `${scorer.name} finaliza para fora.`, { playerId: scorer.id, keeperId: saved ? keeper.id : null, saved });
      }
    }
  }
  if ([60, 70, 80].includes(match.minute)) {
    for (const opponentId of [match.homeId, match.awayId].filter(id => id !== game.userClubId)) {
    const team = match.teams[opponentId];
    const squad = getClub(game, opponentId).squad;
    for (const out of [...matchPlayers(game, opponentId)].sort((a, b) => team.energy[a.id] - team.energy[b.id])) {
      const incoming = squad.filter(player => team.bench.includes(player.id) && player.position === out.position).sort((a, b) => b.overall - a.overall)[0];
      if (incoming) { substitute(game, opponentId, out.id, incoming.id); break; }
    }
    }
  }
  endMinute(game);
  return { ok: true };
}
