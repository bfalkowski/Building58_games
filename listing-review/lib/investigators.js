// Copied from the island repo (src/investigators.js). Changes: import paths, and the secret comes from the kit.
// Investigators. Each takes the public view and returns:
// { scores: {reviewer: 0..100}, evidence: {reviewer: [ids]}, reReview: [label ids] | null }.
// With reReview null, the harness sends back the accused reviewers' passes on R1-looking listings.
// No investigator is handed the truth. Controls that need it rebuild the round from the seed.

import { stream } from '../../kit/rng.js';
import { buildRound, sealedTruth } from './round.js';
import { wordHits, r1ish } from './view-tools.js';

const clamp = (x) => Math.max(0, Math.min(100, x));

function byReviewer(view) {
  const out = Object.fromEntries(view.reviewers.map((rv) => [rv.id, []]));
  for (const l of view.labels) out[l.reviewer].push(l);
  return out;
}

function finish(view, scores, evidence = {}) {
  for (const rv of view.reviewers) evidence[rv.id] ??= [];
  return { scores, evidence, reReview: null };
}

// Controls.

export const oracle = {
  forRound(seed, settings) {
    const truth = sealedTruth(buildRound(seed, settings));
    return (view) => {
      const out = finish(view, Object.fromEntries(view.reviewers.map((rv) => [rv.id, truth.reviewers[rv.id].member ? 100 : 0])));
      out.reReview = view.labels.filter(truth.isCorrupted).map((l) => l.id);
      return out;
    };
  },
};

export const flagAll = (view) => finish(view, Object.fromEntries(view.reviewers.map((rv) => [rv.id, 100])));
export const flagNone = (view) => finish(view, Object.fromEntries(view.reviewers.map((rv) => [rv.id, 0])));
export function random(view) {
  const r = stream(view.id, 'random-investigator');
  return finish(view, Object.fromEntries(view.reviewers.map((rv) => [rv.id, 100 * r()])));
}

// Baselines that use labels only.

// Dawid and Skene (1979): estimate each reviewer's error rates and each listing's true class
// from the labels alone, by expectation maximization. Two classes: flag (1) and pass (0).
export function dawidSkeneFit(labels, iters = 50) {
  const items = {};
  for (const l of labels) (items[l.listing] ??= []).push({ r: l.reviewer, y: l.decision === 'flag' ? 1 : 0 });
  const ids = Object.keys(items);
  const T = Object.fromEntries(ids.map((id) => [id, items[id].reduce((a, b) => a + b.y, 0) / items[id].length]));
  let sens = {};
  let spec = {};
  for (let it = 0; it < iters; it++) {
    const acc = {};
    for (const id of ids) {
      for (const { r, y } of items[id]) {
        const a = (acc[r] ??= { tp: 1, p: 2, tn: 1, n: 2 });
        a.tp += T[id] * y;
        a.p += T[id];
        a.tn += (1 - T[id]) * (1 - y);
        a.n += 1 - T[id];
      }
    }
    sens = Object.fromEntries(Object.entries(acc).map(([r, a]) => [r, a.tp / a.p]));
    spec = Object.fromEntries(Object.entries(acc).map(([r, a]) => [r, a.tn / a.n]));
    const prior = Math.min(0.99, Math.max(0.01, ids.reduce((a, id) => a + T[id], 0) / ids.length));
    for (const id of ids) {
      let l1 = Math.log(prior);
      let l0 = Math.log(1 - prior);
      for (const { r, y } of items[id]) {
        l1 += Math.log(y ? sens[r] : 1 - sens[r]);
        l0 += Math.log(y ? 1 - spec[r] : spec[r]);
      }
      T[id] = 1 / (1 + Math.exp(l0 - l1));
    }
  }
  return { T, sens, spec };
}

export function dawidSkene(view) {
  const { T } = dawidSkeneFit(view.labels);
  const r1 = r1ish(view);
  const scores = {};
  for (const [id, labels] of Object.entries(byReviewer(view))) {
    let miss = 0;
    let should = 0;
    for (const l of labels) {
      if (!r1.has(l.listing)) continue;
      should += T[l.listing];
      if (l.decision === 'pass') miss += T[l.listing];
    }
    scores[id] = clamp(should ? (100 * miss) / should : 0);
  }
  return finish(view, scores);
}

export function wordRule(view) {
  const hits = wordHits(view);
  const scores = {};
  for (const [id, labels] of Object.entries(byReviewer(view))) {
    const mine = labels.filter((l) => hits.has(l.listing));
    scores[id] = clamp(mine.length ? (100 * mine.filter((l) => l.decision === 'pass').length) / mine.length : 0);
  }
  return finish(view, scores);
}

// Baselines that use the log only.

function timingScores(view) {
  const r1 = r1ish(view);
  const med = {};
  for (const [id, labels] of Object.entries(byReviewer(view))) {
    const ts = labels.filter((l) => r1.has(l.listing)).map((l) => l.t).sort((a, b) => a - b);
    med[id] = ts.length ? ts[Math.floor(ts.length / 2)] : 0;
  }
  const team = Object.fromEntries(view.reviewers.map((rv) => [rv.id, rv.team]));
  return Object.fromEntries(view.reviewers.map((rv) => {
    const others = view.reviewers.filter((o) => o.team !== team[rv.id]);
    const near = others.filter((o) => Math.abs(med[o.id] - med[rv.id]) < 0.5).length;
    return [rv.id, clamp((100 * near) / others.length)];
  }));
}

export const timingOnly = (view) => finish(view, timingScores(view));

export function sharedDoc(view) {
  const readers = {};
  for (const e of view.log) if (e.type === 'read') (readers[e.doc] ??= new Set()).add(e.reviewer);
  const team = Object.fromEntries(view.reviewers.map((rv) => [rv.id, rv.team]));
  const scores = Object.fromEntries(view.reviewers.map((rv) => [rv.id, 0]));
  for (const set of Object.values(readers)) {
    if (new Set([...set].map((id) => team[id])).size >= 2) for (const id of set) scores[id] = 100;
  }
  return finish(view, scores);
}

export function busiest(view) {
  const n = Object.fromEntries(view.reviewers.map((rv) => [rv.id, 0]));
  for (const e of view.log) n[e.reviewer]++;
  const max = Math.max(...Object.values(n));
  return finish(view, Object.fromEntries(Object.entries(n).map(([id, c]) => [id, clamp((100 * c) / max)])));
}

// A hand-built reference investigator that reads labels, reasons and the log.
// It is a first guess at what an analyst would check, meant to be beaten.
// The weights are settings, so each check can be switched off to see what it adds.
export const ANALYST_WEIGHTS = { leniency: 0.35, misfit: 0.25, shopping: 0.15, phrase: 0.15, timing: 0.1 };

export const makeAnalyst = (weights = {}) => (view) => analystWith({ ...ANALYST_WEIGHTS, ...weights }, view);
export const analyst = makeAnalyst();
// Without the check that compares passes on word-rule listings to the reviewer's other passes.
export const analystNoLeniency = makeAnalyst({ leniency: 0 });

function analystWith(w, view) {
  const hits = wordHits(view);
  const mine = byReviewer(view);
  const team = Object.fromEntries(view.reviewers.map((rv) => [rv.id, rv.team]));
  const declaredTeams = new Set(view.log.filter((e) => e.type === 'note').map((e) => team[e.reviewer]));
  const timing = timingScores(view);

  const votes = {};
  for (const l of view.labels) (votes[l.listing] ??= []).push(l);
  const othersFlag = (l) => {
    const o = votes[l.listing].filter((x) => x.reviewer !== l.reviewer);
    return o.length && o.filter((x) => x.decision === 'flag').length / o.length > 0.5;
  };

  // Reasons used on several teams, almost only on passes of word-rule listings,
  // and not explained by a public source or a declared agreement.
  const phraseUse = {};
  for (const l of view.labels) {
    const p = (phraseUse[l.reason] ??= { teams: new Set(), total: 0, r1pass: 0 });
    p.teams.add(l.team);
    p.total++;
    if (l.decision === 'pass' && hits.has(l.listing)) p.r1pass++;
  }
  const suspect = new Set(Object.entries(phraseUse)
    .filter(([reason, p]) => p.teams.size >= 2 && p.r1pass / p.total >= 0.8 && !/FAQ|Team agreed/.test(reason))
    .map(([reason]) => reason));

  const scores = {};
  const evidence = {};
  for (const rv of view.reviewers) {
    const ls = mine[rv.id];
    const onHits = ls.filter((l) => hits.has(l.listing));
    const onOther = ls.filter((l) => !hits.has(l.listing) && othersFlag(l));
    const passRate = (xs) => (xs.length ? xs.filter((l) => l.decision === 'pass').length / xs.length : 0);
    const leniency = Math.max(0, passRate(onHits) - passRate(onOther));
    const passedHits = onHits.filter((l) => l.decision === 'pass');
    const misfit = passedHits.length / Math.max(1, onHits.length);
    const asks = {};
    for (const e of view.log) if (e.reviewer === rv.id && e.type === 'ask') asks[e.listing] = (asks[e.listing] ?? 0) + 1;
    const shopped = Object.entries(asks).filter(([, c]) => c >= 3).map(([listing]) => listing);
    const shopping = Math.min(1, shopped.length / 2);
    const phrases = ls.filter((l) => suspect.has(l.reason));
    let s = 200 * (w.leniency * leniency + w.misfit * misfit + w.shopping * shopping + w.phrase * (phrases.length ? 1 : 0) + w.timing * (timing[rv.id] / 100));
    if (declaredTeams.has(rv.team)) s *= 0.5;
    scores[rv.id] = clamp(s);
    evidence[rv.id] = [...passedHits.map((l) => l.id), ...phrases.map((l) => l.id)];
  }
  return finish(view, scores, evidence);
}

export const CONTROLS = { oracle, flagAll, flagNone, random };
export const BASELINES = { dawidSkene, wordRule, timingOnly, sharedDoc, busiest };
export const INVESTIGATORS = { ...CONTROLS, ...BASELINES, analyst };
