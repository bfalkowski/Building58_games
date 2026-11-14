// The night's confusion matrix, and AUC.

// Splits the regulars into four boxes: in the ring and named (caught), in the ring and not named (got
// away), honest and named (wrong men), honest and not named (cleared).
export function tally(ring, named, ids = null) {
  const all = ids ?? Array.from({ length: 12 }, (_, i) => `R${i + 1}`);
  const out = { caught: [], gotAway: [], wrongMen: [], cleared: [] };
  for (const id of all) {
    const n = named.includes(id);
    if (ring.includes(id)) (n ? out.caught : out.gotAway).push(id);
    else (n ? out.wrongMen : out.cleared).push(id);
  }
  return out;
}

// Pick one ring member and one honest regular at random: how often does the ring member score
// higher? Ties count half. NaN when either side is empty.
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// The share of ring members caught when the cut lets through 5 wrong men in 100 honest regulars.
export function catchAt5(pos, neg) {
  if (!pos.length || !neg.length) return NaN;
  const d = neg.slice().sort((a, b) => b - a);
  const cut = d[Math.floor(0.05 * d.length)];
  return pos.filter((s) => s > cut).length / pos.length;
}
