#!/usr/bin/env node
// Lab mode: many nights with no office, no seats and no model calls. Each detective works every
// night at its own desk, under the same budgets as a seat, and the record prints. Nights are built
// from seeds in memory and nothing is written to disk unless --out is given.
// Usage: node find-the-ring/lab.js [--nights 200] [--split test|cal] [--people] [--json] [--out file.json]
// The API detective spends money: add --api [--model claude-sonnet-5-5] [--cap 5] --yes. Without
// --yes it prints the estimate and stops.
import { writeFileSync } from 'node:fs';
import { buildNight, IDS, METHODS } from './night.js';
import { openDesk } from './desk.js';
import { detective, houseAlarm, informant } from './investigators.js';
import { scoreAnswer, auc, catchAt5 } from './score.js';
import { LOOKALIKES } from './rules.js';
import * as theme from './theme.js';

export const DETECTIVES = { informant, detective, houseAlarm };

// Calibration nights and test nights never share a seed.
export const nightSeed = (split, i) => `${split}-${i}`;
// The people set: 20 test nights that people play in case file mode. Every machine detective plays
// them too, so people and machines can be compared night by night.
export const PEOPLE_SET = Array.from({ length: 20 }, (_, i) => nightSeed('test', i * 10));

export async function runLab({ nights = 200, split = 'test', seeds = null, detectives = DETECTIVES, night: build = {}, keepLogs = false } = {}) {
  if (seeds) nights = seeds.length;
  const res = {};
  for (const k of Object.keys(detectives)) {
    res[k] = {
      caught: 0, gotAway: 0, wrongBans: 0, cleared: 0, points: 0, quiet: 0, quietRight: 0,
      goodEvidence: 0, weakEvidence: 0, reads: 0, privacyReads: 0, tails: 0,
      byMethod: Object.fromEntries(METHODS.map((m) => [m, { caught: 0, members: 0 }])),
      wrongBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])), honestBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])),
      pos: [], neg: [], negLook: [], logs: [], findableCaught: 0,
    };
  }
  // Findable: a member with at least one of the ring's own records tonight. A member with none left
  // no trace in the house's records, so no detective can be blamed for missing them.
  const findable = { members: 0, findable: 0 };
  for (let i = 0; i < nights; i++) {
    const seed = seeds ? seeds[i] : nightSeed(split, i);
    const night = buildNight(seed, build);
    const traced = night.ring.filter((id) => night.records.some((e) => e.ring && e.who === id));
    findable.members += night.ring.length; findable.findable += traced.length;
    for (const [k, work] of Object.entries(detectives)) {
      const desk = openDesk(night);
      await work(desk, { night, seed });
      const answer = desk.answer();
      const s = scoreAnswer(night, answer, LOOKALIKES), a = res[k];
      for (const f of ['caught', 'gotAway', 'wrongBans', 'cleared', 'points', 'goodEvidence', 'weakEvidence', 'reads', 'privacyReads', 'tails']) a[f] += s[f];
      a.findableCaught += traced.filter((id) => answer.bans[id]).length;
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
    a.findableCatchRate = a.findableCaught / Math.max(1, findable.findable);
    delete a.pos; delete a.neg; delete a.negLook;
    if (!keepLogs) delete a.logs;
  }
  return { nights, split, findableShare: findable.findable / Math.max(1, findable.members), ...res };
}

export function report(lab) {
  const pct = (x) => `${Math.round(100 * x)}%`;
  const lines = [`Findable share: ${pct(lab.findableShare)} of members left at least one record of the ring's own.`];
  for (const [k, a] of Object.entries(lab)) {
    if (k === 'apiSpend') { lines.push('', `API spend: $${a.usd.toFixed(2)} over ${a.nights} nights, ${a.noHandIn} never handed in`); continue; }
    if (typeof a !== 'object' || a === null) continue;
    lines.push('', `${k}, ${lab.nights} ${lab.split} nights`);
    lines.push(`  caught ${a.caught} of ${a.caught + a.gotAway} (${pct(a.catchRate)}), wrong bans ${a.wrongBans} of ${a.wrongBans + a.cleared} honest (${pct(a.wrongRate)}), points ${a.points}`);
    lines.push(`  quiet nights called right ${a.quietRight} of ${a.quiet}. AUC ${a.auc.toFixed(2)}, against look-alikes ${a.aucVsLookalikes.toFixed(2)}, catch rate at 5% false alarms ${pct(a.catchAt5)}`);
    lines.push(`  evidence: ${a.goodEvidence} good, ${a.weakEvidence} weak. Reads ${a.reads} (${a.privacyReads} of honest regulars), tails ${a.tails}`);
    lines.push(`  caught by method: ${Object.entries(a.byMethod).map(([m, x]) => `${m} ${x.members ? pct(x.caught / x.members) : '-'}`).join(', ')}. Caught of the findable: ${pct(a.findableCatchRate)}`);
    lines.push(`  wrongly banned on honest nights: ${LOOKALIKES.map((id) => `${theme.regulars[IDS.indexOf(id)].name} ${pct(a.wrongBy[id] / Math.max(1, a.honestBy[id]))}`).join(', ')}`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg('out', null);
  const seeds = process.argv.includes('--people') ? PEOPLE_SET : null;
  const nights = seeds ? seeds.length : Number(arg('nights', 200));
  let detectives = DETECTIVES, api = null;
  if (process.argv.includes('--api')) {
    const model = arg('model', 'claude-opus-5-5'), cap = Number(arg('cap', 5));
    if (!process.argv.includes('--yes')) {
      console.log(`The API detective would play ${nights} nights on ${model}, at an estimated $0.10 to $0.20 a night, with a cap of $${cap}. Add --yes to run it.`);
      process.exit(0);
    }
    const { apiDetective } = await import('./api.js');
    api = apiDetective({ model, capUsd: cap });
    detectives = { ...DETECTIVES, api };
  }
  const lab = await runLab({ nights, split: arg('split', 'test'), seeds, detectives, keepLogs: Boolean(out) });
  if (api) lab.apiSpend = api.spend;
  if (out) writeFileSync(out, JSON.stringify(lab, null, 1));
  console.log(process.argv.includes('--json') ? JSON.stringify(lab, null, 1) : report(lab));
}
