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

const IDS12 = Array.from({ length: 12 }, (_, i) => `R${i + 1}`);

// One detective's night, from the planted truth and the desk's answer. A right ban has good evidence
// when it cites at least one of the ring's own records, and weak evidence when it does not. A read
// of an honest regular's record is a privacy intrusion. Points: +1 a catch, -2 a wrong ban.
export function scoreAnswer(night, answer, lookalikes = []) {
  const ring = night.ring;
  const byId = new Map(night.records.map((e) => [e.id, e]));
  const banned = Object.keys(answer.bans);
  const t = tally(ring, banned, IDS12);
  const good = t.caught.filter((id) => answer.bans[id].some((r) => byId.get(r)?.ring));
  const honest = IDS12.filter((id) => !ring.includes(id));
  const pos = ring.map((id) => answer.scores[id]);
  return {
    caught: t.caught.length,
    gotAway: t.gotAway.length,
    wrongBans: t.wrongMen.length,
    cleared: t.cleared.length,
    points: t.caught.length - 2 * t.wrongMen.length,
    quietRight: ring.length ? null : t.wrongMen.length === 0,
    goodEvidence: good.length,
    weakEvidence: t.caught.length - good.length,
    reads: answer.reads.length,
    privacyReads: answer.reads.filter((r) => !ring.includes(byId.get(r.record).who)).length,
    tails: answer.tails.length,
    auc: auc(pos, honest.map((id) => answer.scores[id])),
    aucVsLookalikes: auc(pos, honest.filter((id) => lookalikes.includes(id)).map((id) => answer.scores[id])),
    boxes: t,
  };
}
