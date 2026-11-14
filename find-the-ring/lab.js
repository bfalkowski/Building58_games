#!/usr/bin/env node
// Lab mode: many nights with no office, no seats and no model calls. Each detective works every
// night at its own desk, under the same budgets as a seat, and the record prints. Nights are built
// from seeds in memory and nothing is written to disk unless --out is given.
// Usage: node find-the-ring/lab.js [--nights 200] [--split test|cal] [--json] [--out file.json]
import { writeFileSync } from 'node:fs';
import { buildNight, IDS, METHODS } from './night.js';
import { openDesk } from './desk.js';
import { detective, deskSergeant } from './investigators.js';
import { scoreAnswer, auc, catchAt5 } from './score.js';
import { LOOKALIKES } from './rules.js';
import * as theme from './theme.js';

export const DETECTIVES = { detective, deskSergeant };

// Calibration nights and test nights never share a seed.
export const nightSeed = (split, i) => `${split}-${i}`;

export async function runLab({ nights = 200, split = 'test', detectives = DETECTIVES, night: build = {}, keepLogs = false } = {}) {
  const res = {};
  for (const k of Object.keys(detectives)) {
    res[k] = {
      caught: 0, gotAway: 0, wrongBans: 0, cleared: 0, points: 0, quiet: 0, quietRight: 0,
      goodEvidence: 0, weakEvidence: 0, reads: 0, privacyReads: 0, tails: 0,
      byMethod: Object.fromEntries(METHODS.map((m) => [m, { caught: 0, members: 0 }])),
      wrongBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])), honestBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])),
      pos: [], neg: [], negLook: [], logs: [],
    };
  }
  for (let i = 0; i < nights; i++) {
    const seed = nightSeed(split, i);
    const night = buildNight(seed, build);
    for (const [k, work] of Object.entries(detectives)) {
      const desk = openDesk(night);
      await work(desk, { night });
      const answer = desk.answer();
      const s = scoreAnswer(night, answer, LOOKALIKES), a = res[k];
      for (const f of ['caught', 'gotAway', 'wrongBans', 'cleared', 'points', 'goodEvidence', 'weakEvidence', 'reads', 'privacyReads', 'tails']) a[f] += s[f];
      if (!night.ring.length) { a.quiet++; if (s.wrongBans === 0) a.quietRight++; }
      else { a.byMethod[night.method] ??= { caught: 0, members: 0 }; a.byMethod[night.method].caught += s.caught; a.byMethod[night.method].members += night.ring.length; }
      for (const id of IDS) {
        if (night.ring.includes(id)) a.pos.push(answer.scores[id]);
        else { a.neg.push(answer.scores[id]); if (LOOKALIKES.includes(id)) a.negLook.push(answer.scores[id]); }
      }
      for (const id of LOOKALIKES) if (!night.ring.includes(id)) { a.honestBy[id]++; if (answer.bans[id]) a.wrongBy[id]++; }
      if (keepLogs) a.logs.push({ seed, method: night.method, ring: night.ring, log: desk.log, boxes: s.boxes });
    }
  }
  for (const a of Object.values(res)) {
    a.auc = auc(a.pos, a.neg);
    a.aucVsLookalikes = auc(a.pos, a.negLook);
    a.catchAt5 = catchAt5(a.pos, a.neg);
    a.catchRate = a.caught / Math.max(1, a.caught + a.gotAway);
    a.wrongRate = a.wrongBans / Math.max(1, a.wrongBans + a.cleared);
    delete a.pos; delete a.neg; delete a.negLook;
    if (!keepLogs) delete a.logs;
  }
  return { nights, split, ...res };
}

export function report(lab) {
  const pct = (x) => `${Math.round(100 * x)}%`;
  const lines = [];
  for (const [k, a] of Object.entries(lab)) {
    if (typeof a !== 'object') continue;
    lines.push('', `${k}, ${lab.nights} ${lab.split} nights`);
    lines.push(`  caught ${a.caught} of ${a.caught + a.gotAway} (${pct(a.catchRate)}), wrong bans ${a.wrongBans} of ${a.wrongBans + a.cleared} honest (${pct(a.wrongRate)}), points ${a.points}`);
    lines.push(`  quiet nights called right ${a.quietRight} of ${a.quiet}. AUC ${a.auc.toFixed(2)}, against look-alikes ${a.aucVsLookalikes.toFixed(2)}, catch rate at 5% false alarms ${pct(a.catchAt5)}`);
    lines.push(`  evidence: ${a.goodEvidence} good, ${a.weakEvidence} weak. Reads ${a.reads} (${a.privacyReads} of honest regulars), tails ${a.tails}`);
    lines.push(`  caught by method: ${Object.entries(a.byMethod).map(([m, x]) => `${m} ${x.members ? pct(x.caught / x.members) : '-'}`).join(', ')}`);
    lines.push(`  wrongly banned on honest nights: ${LOOKALIKES.map((id) => `${theme.regulars[IDS.indexOf(id)].name} ${pct(a.wrongBy[id] / Math.max(1, a.honestBy[id]))}`).join(', ')}`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg('out', null);
  const lab = await runLab({ nights: Number(arg('nights', 200)), split: arg('split', 'test'), keepLogs: Boolean(out) });
  if (out) writeFileSync(out, JSON.stringify(lab, null, 1));
  console.log(process.argv.includes('--json') ? JSON.stringify(lab, null, 1) : report(lab));
}
