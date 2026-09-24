const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const attackingRole = { GOL: 0.03, ZAG: 0.18, LAT: 0.32, VOL: 0.42, MC: 1.05, ATA: 1.7 };
const creativeRole = { GOL: 0.08, ZAG: 0.55, LAT: 1.15, VOL: 0.9, MC: 1.5, ATA: 1 };
const defensiveRole = { GOL: 0.05, ZAG: 1.6, LAT: 1.2, VOL: 1.45, MC: 0.75, ATA: 0.25 };

function currentStateFactor(player) {
  const form = clamp(player.form ?? 65, 20, 99);
  const morale = clamp(player.morale ?? 70, 20, 100);
  return (0.72 + form / 230) * (0.82 + morale / 500);
}

export function attackingWeight(player, position = player.position, overall = player.overall) {
  return Math.max(1, Math.pow(Math.max(8, overall - 45), 1.35) * (attackingRole[position] || 0.15) * currentStateFactor(player));
}

export function creativeWeight(player, position = player.position, overall = player.overall) {
  return Math.max(1, Math.pow(Math.max(8, overall - 45), 1.18) * (creativeRole[position] || 0.4) * currentStateFactor(player));
}

export function defensiveWeight(player, position = player.position, overall = player.overall) {
  return Math.max(1, Math.pow(Math.max(8, overall - 45), 1.15) * (defensiveRole[position] || 0.4) * currentStateFactor(player));
}

export function weightedPlayer(random, players, weightFor) {
  if (!players.length) return undefined;
  const weights = players.map(player => Math.max(0, weightFor(player)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) return players[Math.floor(random() * players.length)];
  let roll = random() * total;
  for (let index = 0; index < players.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return players[index];
  }
  return players.at(-1);
}

export function expectedPerformanceRating(player) {
  return clamp(6.15 + Math.max(0, (player.overall ?? 65) - 70) * 0.02, 6.15, 6.75);
}

export function goalRatingWeight(position) {
  return ({ GOL: 2.5, ZAG: 1.75, LAT: 1.55, VOL: 1.4, MC: 1.15, ATA: 1 }[position] || 1);
}

export function assistRatingWeight(position) {
  return ({ GOL: 1.5, ZAG: 1.25, LAT: 1.05, VOL: 0.9, MC: 0.65, ATA: 0.55 }[position] || 0.6);
}

export function preAssistRatingWeight(position) {
  return ({ GOL: 0.35, ZAG: 0.3, LAT: 0.24, VOL: 0.28, MC: 0.25, ATA: 0.16 }[position] || 0.2);
}

export function tackleRatingWeight(position) {
  return ({ GOL: 0, ZAG: 0.1, LAT: 0.09, VOL: 0.09, MC: 0.07, ATA: 0.04 }[position] || 0.05);
}

export function keyPassRatingWeight(position) {
  return ({ GOL: 0, ZAG: 0.05, LAT: 0.08, VOL: 0.07, MC: 0.09, ATA: 0.07 }[position] || 0.06);
}
