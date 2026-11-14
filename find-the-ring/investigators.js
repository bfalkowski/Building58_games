// Scripted investigators. Each reads only the public view, { ships, events }, and gives every
// regular a suspicion score from 0 to 100.
//
// The detective looks for a line that two or more regulars call in the half hour before a ship sails,
// steps outside timed to the sailings (worth less for someone who steps out all night), and quiet talks
// with other suspects just before a sailing. The Desk Sergeant counts how busy each regular was on the
// phone and at the door. The detective is the baseline an AI seat has to beat; the sergeant is the
// simple rule both should beat.

import { IDS } from './night.js';

export const CUT = 60;  // a score at or above this names the regular

export function detective({ ships, events }) {
  const before = new Set(ships.map((s) => s.at - 1));
  const sailing = new Set(ships.map((s) => s.at));
  const callers = {}, early = {};
  for (const e of events) if (e.act === 'call') {
    (callers[e.line] ??= new Set()).add(e.who);
    if (before.has(e.half)) early[e.line] = (early[e.line] || 0) + 1;
  }
  const shared = new Set(Object.keys(callers).filter((l) => callers[l].size >= 2 && (early[l] || 0) >= 1));
  const f = Object.fromEntries(IDS.map((id) => [id, { calls: 0, early: 0, outs: 0, allOuts: 0, talks: [], allTalks: 0 }]));
  for (const e of events) {
    const x = f[e.who];
    if (e.act === 'call' && shared.has(e.line)) { x.calls++; if (before.has(e.half)) x.early++; }
    if (e.act === 'out') { x.allOuts++; if (sailing.has(e.half)) x.outs++; }
    if (e.act === 'talk') {
      x.allTalks++; f[e.with].allTalks++;
      x.talks.push({ with: e.with, early: before.has(e.half) }); f[e.with].talks.push({ with: e.who, early: before.has(e.half) });
    }
  }
  const base = {};
  for (const id of IDS) { const x = f[id]; base[id] = 1.6 * x.calls + 0.8 * x.early + (x.outs * (x.outs + 1)) / (x.allOuts + 1); }
  const scores = {};
  for (const id of IDS) {
    const x = f[id];
    const link = x.talks.reduce((a, t) => a + (Math.min(base[t.with], 3) / 3) * (t.early ? 1 : 0.4), 0);
    const raw = base[id] + (0.9 * link * 2) / (x.allTalks + 1);
    scores[id] = Math.round(100 * (1 - Math.exp(-raw / 2.2)));
  }
  return { scores, ring: IDS.filter((id) => scores[id] >= CUT), lines: [...shared] };
}

export function deskSergeant({ events }) {
  const busy = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (const e of events) busy[e.who] += e.act === 'call' || e.act === 'out' ? 1 : e.act === 'talk' ? 0.5 : 0;
  // Five or more is a suspect. As a score: 5 maps to the cut, 10 or more to 100.
  const scores = Object.fromEntries(IDS.map((id) => [id, Math.min(100, Math.round(busy[id] * 12))]));
  return { scores, ring: IDS.filter((id) => busy[id] >= 5) };
}
