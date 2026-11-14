#!/usr/bin/env node
// Lab mode: many nights with no office, no seats and no model calls. The scripted investigators
// play the same nights, and the record prints. Nights are built from seeds in memory and nothing is
// written to disk, so no truth leaves this process except the totals.
// Usage: node find-the-ring/lab.js [--nights 100] [--seed lab]
import { buildNight, IDS } from './night.js';
import { detective, deskSergeant } from './investigators.js';
import { tally, auc, catchAt5 } from './score.js';
import { LOOKALIKES } from './rules.js';
import * as theme from './theme.js';

export function runLab({ nights = 100, seed = 'lab' } = {}) {
  const who = { detective, deskSergeant };
  const res = {};
  for (const k of Object.keys(who)) res[k] = { caught: 0, gotAway: 0, wrongMen: 0, cleared: 0, quiet: 0, quietRight: 0, pos: [], neg: [], wrongBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])), honestBy: Object.fromEntries(LOOKALIKES.map((id) => [id, 0])) };
  for (let i = 0; i < nights; i++) {
    const night = buildNight(`${seed}-${i}`);
    const view = { ships: night.ships, events: night.events };
    for (const [k, investigate] of Object.entries(who)) {
      const out = investigate(view), a = res[k], t = tally(night.ring, out.ring);
      for (const box of ['caught', 'gotAway', 'wrongMen', 'cleared']) a[box] += t[box].length;
      if (!night.ring.length) { a.quiet++; if (!out.ring.length) a.quietRight++; }
      for (const id of IDS) (night.ring.includes(id) ? a.pos : a.neg).push(out.scores[id]);
      for (const id of LOOKALIKES) if (!night.ring.includes(id)) { a.honestBy[id]++; if (out.ring.includes(id)) a.wrongBy[id]++; }
    }
  }
  for (const a of Object.values(res)) { a.auc = auc(a.pos, a.neg); a.catchAt5 = catchAt5(a.pos, a.neg); delete a.pos; delete a.neg; }
  return { nights, ...res };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const lab = runLab({ nights: Number(arg('nights', 100)), seed: arg('seed', 'lab') });
  const pct = (x) => `${Math.round(100 * x)}%`;
  for (const k of ['detective', 'deskSergeant']) {
    const a = lab[k];
    console.log(`\n${k === 'detective' ? 'Detective' : 'Desk Sergeant'}, ${lab.nights} nights`);
    console.log(`  caught ${a.caught} of ${a.caught + a.gotAway} (${pct(a.caught / (a.caught + a.gotAway))}), wrong men ${a.wrongMen} of ${a.wrongMen + a.cleared} honest (${pct(a.wrongMen / (a.wrongMen + a.cleared))})`);
    console.log(`  right when naming ${pct(a.caught / (a.caught + a.wrongMen))}, quiet nights called right ${a.quietRight} of ${a.quiet}`);
    console.log(`  AUC ${a.auc.toFixed(2)}, catch rate at 5% false alarms ${pct(a.catchAt5)}`);
    console.log(`  wrongly named on honest nights: ${LOOKALIKES.map((id) => `${theme.regulars[IDS.indexOf(id)].name} ${pct(a.wrongBy[id] / a.honestBy[id])}`).join(', ')}`);
  }
}
