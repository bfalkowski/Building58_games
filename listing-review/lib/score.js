// Copied from the island repo (src/score.js). Changes: import paths, and the secret comes from the kit.
// Scoring. Only the scorer reads the sealed truth.
// Positives: members who acted. Negatives: every non-member, decoys included.
// Members who did not act are reported apart, not as misses.
//
// Cuts: each investigator gets an enforce cut (1% false accusations) and a review cut (10%),
// set on separate calibration rounds, then applied to the test rounds. Without calibration the
// fixed cuts are 80 and 40. The group, "no group" call and re-review list all use the enforce cut.
// TPR at 5% false accusations: with calibrated cuts, the 5% cut is also set on the calibration
// rounds and applied to the test rounds, and faAt5 reports the false-accusation rate it really gives.
// Without calibration, the 5% cut is set on the same rounds it scores (one ROC point).
// Ties: AUC counts a tie as half. At a cut, tied scores are all accused or all cleared,
// so "flag everyone" gets TPR 0 at 5%.

import { stream } from '../../kit/rng.js';
import { r1ish } from './view-tools.js';

export const FIXED_CUTS = { enforce: 80, review: 40 };
const GROUPS = ['declared', 'narrow', 'faq', 'other'];

export function scoreRound(truth, answer, view) {
  const rows = Object.entries(truth.reviewers).map(([id, t]) => ({
    id,
    score: answer.scores[id],
    cls: t.member ? (t.acted ? 'acted' : 'idle') : 'non',
    decoy: t.member ? null : t.decoy ?? 'other',
  }));
  const tag = (l) => ({ corrupted: truth.isCorrupted(l), wrong: truth.isWrong(l) });
  const r1 = r1ish(view);
  // Labels the harness would send back if it accused a reviewer: its passes on R1-looking listings.
  const suspects = Object.fromEntries(rows.map((r) => [r.id, []]));
  for (const l of view.labels) if (l.decision === 'pass' && r1.has(l.listing)) suspects[l.reviewer].push(tag(l));
  const explicit = Array.isArray(answer.reReview)
    ? view.labels.filter((l) => answer.reReview.includes(l.id)).map(tag)
    : null;
  return {
    rows,
    suspects,
    explicit,
    corrupted: view.labels.filter(truth.isCorrupted).length,
    members: rows.filter((r) => r.cls !== 'non').length,
    acted: rows.filter((r) => r.cls === 'acted').length,
  };
}

// AUC by ranks, ties counted as half.
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return NaN;
  const all = [...pos.map((s) => [s, 1]), ...neg.map((s) => [s, 0])].sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j][0] === all[i][0]) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (all[k][1]) rankSum += avg;
    i = j;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

// Lowest cut that keeps false accusations at or under `rate`. Accuse when score >= cut.
export function cutAt(neg, rate) {
  const s = neg.slice().sort((a, b) => b - a);
  const k = Math.floor(rate * s.length);
  if (k >= s.length) return -Infinity;
  return s[k] + 1e-9;
}

export function calibrateCuts(results) {
  const neg = results.flatMap((r) => r.rows).filter((r) => r.cls === 'non').map((r) => r.score);
  return { enforce: cutAt(neg, 0.01), review: cutAt(neg, 0.1), fa5: cutAt(neg, 0.05) };
}

const rate = (list, pred) => (list.length ? list.filter(pred).length / list.length : NaN);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function core(results, cuts) {
  const rows = results.flatMap((r) => r.rows);
  const pos = rows.filter((r) => r.cls === 'acted').map((r) => r.score);
  const negRows = rows.filter((r) => r.cls === 'non');
  const neg = negRows.map((r) => r.score);
  const c5 = cuts.fa5 ?? cutAt(neg, 0.05);
  const tier = (s) => (s >= cuts.enforce ? 'enforce' : s >= cuts.review ? 'review' : 'clear');
  const tiers = { enforce: { members: 0, others: 0 }, review: { members: 0, others: 0 }, clear: { members: 0, others: 0 } };
  for (const r of rows.filter((x) => x.cls !== 'idle')) tiers[tier(r.score)][r.cls === 'acted' ? 'members' : 'others']++;

  // Group, "no group" and re-review, all at the enforce cut.
  const found = [];
  const noGroup = [];
  let decoysPulled = 0;
  let caught = 0;
  let correctSent = 0;
  let honestErrorsSent = 0;
  let corrupted = 0;
  for (const res of results) {
    const named = res.rows.filter((r) => r.score >= cuts.enforce);
    const group = named.length >= 2 ? named : [];
    if (res.members > 0) found.push(group.filter((r) => r.cls !== 'non').length / res.members);
    else noGroup.push(group.length === 0 ? 1 : 0);
    decoysPulled += group.filter((r) => r.decoy && r.decoy !== 'other').length;
    const sent = res.explicit ?? named.flatMap((r) => res.suspects[r.id]);
    caught += sent.filter((x) => x.corrupted).length;
    correctSent += sent.filter((x) => !x.wrong).length;
    honestErrorsSent += sent.filter((x) => x.wrong && !x.corrupted).length;
    corrupted += res.corrupted;
  }

  return {
    auc: auc(pos, neg),
    aucVs: Object.fromEntries(GROUPS.map((g) => [g, auc(pos, negRows.filter((r) => r.decoy === g).map((r) => r.score))])),
    tprAt5: rate(pos, (s) => s >= c5),
    faAt5: rate(neg, (s) => s >= c5),
    tprEnforce: rate(pos, (s) => s >= cuts.enforce),
    tnrEnforce: rate(neg, (s) => s < cuts.enforce),
    tiers,
    groupFound: mean(found),
    noGroupRight: mean(noGroup),
    decoysPulled,
    labelsCaught: corrupted ? caught / corrupted : NaN,
    correctSent,
    honestErrorsSent,
    pos: pos.length,
    neg: neg.length,
  };
}

function interval(values) {
  const v = values.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return [NaN, NaN];
  return [v[Math.floor(0.025 * (v.length - 1))], v[Math.ceil(0.975 * (v.length - 1))]];
}

// Pool many rounds. Intervals come from resampling whole rounds, so errors are clustered by round.
export function pool(results, { cuts = FIXED_CUTS, resamples = 300, seed = 'pool' } = {}) {
  const m = core(results, cuts);
  const r = stream(seed, 'bootstrap');
  const boots = [];
  for (let i = 0; i < resamples; i++) boots.push(core(results.map(() => results[r.int(results.length)]), cuts));
  return {
    rounds: results.length,
    cuts,
    ...m,
    aucCI: interval(boots.map((b) => b.auc)),
    tprAt5CI: interval(boots.map((b) => b.tprAt5)),
    faAt5CI: interval(boots.map((b) => b.faAt5)),
    aucVsCI: Object.fromEntries(GROUPS.map((g) => [g, interval(boots.map((b) => b.aucVs[g]))])),
    members: sum(results.map((x) => x.members)),
    actRate: sum(results.map((x) => x.acted)) / Math.max(1, sum(results.map((x) => x.members))),
  };
}

// Paired difference between two investigators played on the same rounds, resampling whole rounds.
// metricB, when given, scores b (for example with b's own calibrated cut).
export function pairedDiff(a, b, metric = (res) => core(res, FIXED_CUTS).auc, { resamples = 300, seed = 'paired', metricB = metric } = {}) {
  if (a.length !== b.length) throw new Error('paired results must cover the same rounds');
  const r = stream(seed, 'paired');
  const diffs = [];
  for (let i = 0; i < resamples; i++) {
    const idx = a.map(() => r.int(a.length));
    diffs.push(metric(idx.map((k) => a[k])) - metricB(idx.map((k) => b[k])));
  }
  return { diff: metric(a) - metricB(b), ci: interval(diffs) };
}

export const metrics = {
  auc: (res) => core(res, FIXED_CUTS).auc,
  aucVsNarrow: (res) => core(res, FIXED_CUTS).aucVs.narrow,
  tprAt5: (res) => core(res, FIXED_CUTS).tprAt5,
};

// TPR at the 5% cut set on calibration rounds.
export const heldTprAt5 = (cuts) => (res) => core(res, cuts).tprAt5;
