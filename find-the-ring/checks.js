// Checks before anyone plays. Each one is a test, and all must pass before a person or an AI seat
// plays a new version of the game.
//   leakProbe      with every ring signal off, a simple classifier on the free records cannot tell
//                  the ring from the look-alikes (AUC near 0.5). Anything else is a leak.
//   bankScan       no text the machine or a call can show names goods, a way to hide or move them,
//                  or a way around a refusal.
//   lookalikeSigns every look-alike shows at least one of the ring's signals on its honest nights,
//                  but rarely all of tonight's method at once.

import * as theme from './theme.js';
import { buildNight, IDS, publicRecord } from './night.js';
import { auc } from './score.js';

// Every ring signal off: members act on their honest habits only.
export const SIGNALS_OFF = { ringCall: 0, ringSit: 0, ringMsg: 0, docks: 0, stray: 0 };
const KINDS = ['call', 'msg', 'look', 'note', 'refused', 'out', 'sit', 'cards'];

// Raw features of one regular from the free records: counts of each kind, at each time, and size.
export function features(night, id) {
  const before = new Set(night.ships.map((s) => s.at - 1)), sailing = new Set(night.ships.map((s) => s.at));
  const mine = night.records.map(publicRecord).filter((e) => e.who === id);
  const x = [1];
  for (const k of KINDS) {
    const m = mine.filter((e) => e.kind === k);
    x.push(m.length, m.filter((e) => before.has(e.half)).length, m.filter((e) => sailing.has(e.half)).length);
  }
  x.push(night.records.filter((e) => e.to === id || e.with === id).length);
  x.push(mine.filter((e) => e.kind === 'call').reduce((n, e) => n + e.mins, 0));
  return x;
}

function train(rows, steps = 300, rate = 0.05) {
  const n = rows[0].x.length;
  const mu = Array(n).fill(0), sd = Array(n).fill(1);
  for (let j = 1; j < n; j++) {
    mu[j] = rows.reduce((a, r) => a + r.x[j], 0) / rows.length;
    sd[j] = Math.sqrt(rows.reduce((a, r) => a + (r.x[j] - mu[j]) ** 2, 0) / rows.length) || 1;
  }
  const z = (x) => x.map((v, j) => (j ? (v - mu[j]) / sd[j] : 1));
  const w = Array(n).fill(0);
  const data = rows.map((r) => ({ x: z(r.x), y: r.y }));
  for (let s = 0; s < steps; s++) {
    const g = Array(n).fill(0);
    for (const r of data) { const p = 1 / (1 + Math.exp(-r.x.reduce((a, v, j) => a + v * w[j], 0))); for (let j = 0; j < n; j++) g[j] += (p - r.y) * r.x[j]; }
    for (let j = 0; j < n; j++) w[j] -= (rate * g[j]) / data.length + 0.001 * w[j];
  }
  return (x) => z(x).reduce((a, v, j) => a + v * w[j], 0);
}

const LOOKALIKES = IDS.filter((_, i) => theme.regulars[i].habit);

// Trains on calibration nights and scores test nights, all with the ring's signals off.
export function leakProbe({ nights = 300, difficulty = SIGNALS_OFF } = {}) {
  const rows = (split) => {
    const out = [];
    for (let i = 0; i < nights; i++) {
      const night = buildNight(`${split}-probe-${i}`, { ring: [2, 3], difficulty });
      for (const id of IDS) out.push({ x: features(night, id), y: night.ring.includes(id) ? 1 : 0, look: LOOKALIKES.includes(id) });
    }
    return out;
  };
  const score = train(rows('cal'));
  const test = rows('test');
  const pos = test.filter((r) => r.y).map((r) => score(r.x));
  return {
    aucVsAll: auc(pos, test.filter((r) => !r.y).map((r) => score(r.x))),
    aucVsLookalikes: auc(pos, test.filter((r) => !r.y && r.look).map((r) => score(r.x))),
  };
}

// Words that must never appear in any text the game can show: goods, hiding, moving, evasion.
export const BANNED = [/smuggl/i, /hid(e|den|ing)/i, /crate/i, /customs/i, /export/i, /bribe/i, /false bottom/i, /contraband/i, /tube/i, /pentode/i, /cargo/i, /ship (it|them)/i, /load(ed|ing)? /i, /rephrase/i, /instead ask/i, /another way/i, /get around/i, /bypass/i];

export function bankScan() {
  const problems = [];
  for (const [bank, lines] of Object.entries(theme.words)) for (const line of lines) for (const re of BANNED) if (re.test(line)) problems.push(`${bank}: ${line} matches ${re}`);
  return problems;
}

// The ring's signals a regular showed tonight, from the free records.
export function signsOf(night, id) {
  const before = new Set(night.ships.map((s) => s.at - 1)), sailing = new Set(night.ships.map((s) => s.at));
  const callers = {};
  for (const e of night.records) if (e.kind === 'call') (callers[e.line] ??= new Set()).add(e.who);
  const sat = new Set(night.records.filter((e) => e.kind === 'sit').map((e) => [e.who, e.with].sort().join()));
  const mine = night.records.filter((e) => e.who === id);
  return {
    sharedCall: mine.some((e) => e.kind === 'call' && before.has(e.half) && callers[e.line].size >= 2),
    quietMsg: mine.some((e) => e.kind === 'msg' && before.has(e.half) && !sat.has([e.who, e.to].sort().join())),
    outAtSailing: mine.some((e) => e.kind === 'out' && sailing.has(e.half)),
    sitBefore: mine.some((e) => e.kind === 'sit' && before.has(e.half)),
  };
}
const METHOD_SIGNS = { line: ['sharedCall', 'outAtSailing', 'sitBefore'], relay: ['quietMsg', 'outAtSailing'] };

export function lookalikeSigns({ nights = 300 } = {}) {
  const out = Object.fromEntries(LOOKALIKES.map((id) => [id, { honest: 0, some: 0, all: 0 }]));
  for (let i = 0; i < nights; i++) {
    const night = buildNight(`look-${i}`);
    for (const id of LOOKALIKES) {
      if (night.ring.includes(id)) continue;
      const s = signsOf(night, id), x = out[id];
      x.honest++;
      if (Object.values(s).some(Boolean)) x.some++;
      if (night.method && METHOD_SIGNS[night.method].every((k) => s[k])) x.all++;
    }
  }
  return out;
}
