export const FORMATIONS = {
  "4-4-2": [["GOL"], ["LAT", "ZAG", "ZAG", "LAT"], ["VOL"], ["MC", "MC"], ["MC"], ["ATA", "ATA"]],
  "4-3-3": [["GOL"], ["LAT", "ZAG", "ZAG", "LAT"], ["VOL"], ["MC", "MC"], ["ATA", "ATA", "ATA"]],
  "4-2-3-1": [["GOL"], ["LAT", "ZAG", "ZAG", "LAT"], ["VOL", "VOL"], ["MC", "MC", "MC"], ["ATA"]],
  "3-5-2": [["GOL"], ["ZAG", "ZAG", "ZAG"], ["LAT", "VOL", "LAT"], ["MC", "MC"], ["ATA", "ATA"]],
  "5-3-2": [["GOL"], ["LAT", "ZAG", "ZAG", "ZAG", "LAT"], ["VOL"], ["MC", "MC"], ["ATA", "ATA"]]
};
export const formationPositions = formation => (FORMATIONS[formation] || FORMATIONS["4-4-2"]).flat();
const lines = { GOL: 0, ZAG: 1, LAT: 1, VOL: 2, MC: 2, ATA: 3 };

export function positionalRating(player, position) {
  const penalty = player.position === position ? 0
    : player.position === "GOL" || position === "GOL" ? 0.5
    : lines[player.position] === lines[position] ? 0.1 : 0.2;
  const overall = Math.max(1, Math.round(player.overall * (1 - penalty)));
  return { overall, loss: player.overall - overall, outOfPosition: penalty > 0 };
}

// Assign the current eleven together, rather than letting an early choice steal
// another player's natural position. Empty slots remain empty after a dismissal.
export function arrangePlayers(players, formation) {
  const positions = formationPositions(formation);
  const candidates = [...players, ...Array(11 - players.length).fill(null)];
  const memo = new Map();
  function solve(slot, mask) {
    if (slot === 11) return { score: 0, ids: [] };
    if (memo.has(mask)) return memo.get(mask);
    let best = { score: -Infinity, ids: [] };
    candidates.forEach((player, index) => {
      if (mask & (1 << index)) return;
      const rating = player ? positionalRating(player, positions[slot]) : null;
      const score = player ? rating.overall + (rating.outOfPosition ? 0 : 1000)
        - ((player.position === "GOL") !== (positions[slot] === "GOL") ? 10000 : 0) : 0;
      const rest = solve(slot + 1, mask | (1 << index));
      if (score + rest.score > best.score) best = { score: score + rest.score, ids: [player?.id ?? null, ...rest.ids] };
    });
    memo.set(mask, best);
    return best;
  }
  return solve(0, 0).ids;
}
