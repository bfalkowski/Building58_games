// Scripted detectives. Each works one night through a desk (desk.js, or the same plays through the
// office), so it pays the same budgets as anyone: free records, a few content reads with a cited
// reason, one tail, and bans that cite records. Each ends by handing in a score for every regular.
//
// The detective knows only the public signals: a line two or more regulars call before a sailing,
// messages before a sailing between regulars who never sit together, steps out timed to the
// sailings, and quiet talks before a sailing. It spends its reads and its tail on its top suspects.
// The Desk Sergeant counts how busy each regular was. It reads nothing and bans the busiest.

import * as theme from './theme.js';
import { IDS, READABLE, METHODS } from './night.js';
import { stream } from '../kit/rng.js';

// Ban only above two-thirds sure: with +1 a catch and -2 a wrong ban, a ban pays only above that.
export const BAN_AT = 67;
export const toScore = (raw) => Math.round(100 * (1 - Math.exp(-Math.max(0, raw) / 2.2)));

// The public signals in one night's records, for every regular, with the records behind each.
export function signals(summary, records) {
  const before = new Set(summary.ships.map((s) => s.half - 1));
  const sailing = new Set(summary.ships.map((s) => s.half));
  const f = Object.fromEntries(IDS.map((id) => [id, { raw: 0, cites: [], outs: 0, allOuts: 0, msgs: 0 }]));
  const cite = (id, e, w) => { f[id].raw += w; f[id].cites.push({ id: e.id, w, e }); };

  // A shared line: two or more callers, at least one call before a sailing.
  const callers = {}, early = {};
  for (const e of records) if (e.kind === 'call') { (callers[e.line] ??= new Set()).add(e.who); if (before.has(e.half)) early[e.line] = (early[e.line] || 0) + 1; }
  const shared = new Set(Object.keys(callers).filter((l) => callers[l].size >= 2 && early[l] >= 1));
  for (const e of records) if (e.kind === 'call' && shared.has(e.line)) cite(e.who, e, before.has(e.half) ? 2.2 : 0.6);

  // Messages before a sailing between two regulars who never sit together. A regular who messages
  // many people (a hub) counts less.
  const sat = new Set(records.filter((e) => e.kind === 'sit').map((e) => [e.who, e.with].sort().join()));
  for (const e of records) if (e.kind === 'msg') { f[e.who].msgs++; f[e.to].msgs++; }
  for (const e of records) if (e.kind === 'msg' && before.has(e.half) && !sat.has([e.who, e.to].sort().join())) {
    const hub = Math.max(f[e.who].msgs, f[e.to].msgs) >= 6 ? 0.25 : 1;
    cite(e.who, e, 1.4 * hub); cite(e.to, e, 1.1 * hub);
  }

  // Steps out at a sailing, worth less for someone who steps out all night.
  for (const e of records) if (e.kind === 'out') { f[e.who].allOuts++; if (sailing.has(e.half)) f[e.who].outs++; }
  for (const id of IDS) {
    const x = f[id];
    const w = (x.outs * (x.outs + 1)) / (x.allOuts + 1);
    if (w > 0) for (const e of records) if (e.kind === 'out' && e.who === id && sailing.has(e.half)) cite(id, e, w / x.outs);
  }

  // Talks before a sailing with someone already suspect.
  const base = Object.fromEntries(IDS.map((id) => [id, f[id].raw]));
  for (const e of records) if (e.kind === 'sit' && before.has(e.half)) {
    if (base[e.with] >= 2) cite(e.who, e, 0.6);
    if (base[e.who] >= 2) cite(e.with, e, 0.6);
  }
  return f;
}

// Spends the reads, the tail and the bans from a table of suspicion f, then hands in.
export async function workTheDesk(d, summary, records, f, { banAt = BAN_AT, readFrom = 25 } = {}) {
  const top = () => IDS.slice().sort((a, b) => f[b].raw - f[a].raw);

  // Content reads: the strongest readable record of each top suspect still in doubt.
  let reads = summary.budget.reads;
  for (const id of top()) {
    if (reads <= 0 || toScore(f[id].raw) < readFrom) break;
    const best = f[id].cites.filter((c) => c.e && READABLE.has(c.e.kind)).sort((a, b) => b.w - a.w)[0];
    if (!best) continue;
    const reason = f[id].cites.find((c) => c.id !== best.id) ?? records.find((e) => e.id !== best.id && e.who === id);
    if (!reason) continue;
    const out = await d.read(best.id, [reason.id]);
    reads--;
    if (theme.oddWords.test(out.text)) {
      f[id].raw += 3; f[id].cites.unshift({ id: best.id, w: 9, e: best.e });
      if (best.e.to) { f[best.e.to].raw += 1.5; f[best.e.to].cites.unshift({ id: best.id, w: 9, e: best.e }); }
    } else {
      f[id].raw *= 0.3;
    }
  }

  // The tail: the top suspect who stepped out at a sailing, if still in doubt.
  if (summary.budget.tails > 0) {
    const who = top().find((id) => f[id].outs > 0 && toScore(f[id].raw) >= 30 && toScore(f[id].raw) < 95);
    if (who) {
      const out = await d.tail(who);
      const bad = out.trips.find((t) => theme.oddPlace(t.went));
      if (bad) { f[who].raw += 2; f[who].cites.unshift({ id: bad.record, w: 9 }); } else f[who].raw *= 0.4;
    }
  }

  const scores = Object.fromEntries(IDS.map((id) => [id, toScore(f[id].raw)]));
  for (const id of IDS) if (scores[id] >= banAt) {
    const cites = [...new Set(f[id].cites.slice().sort((a, b) => b.w - a.w).map((c) => c.id))].slice(0, 3);
    if (cites.length) await d.ban(id, cites);
  }
  await d.handIn(scores);
  return scores;
}

export async function detective(d, opts = {}) {
  const summary = await d.summary();
  const records = await d.records();
  return workTheDesk(d, summary, records, signals(summary, records), opts);
}

// The Informant: the ceiling. It knows tonight's method and the odds, but sees only the house's
// records, under the same budgets. On a quiet night it is told a method drawn at random, so it never
// learns from the method that the night is quiet. Lab only: a seat is never told the method.
export async function informant(d, { night, seed = 'informant' } = {}) {
  const summary = await d.summary();
  const records = await d.records();
  const method = night?.method ?? stream(seed, 'informant').pick(METHODS);
  // The same signals as the detective, keeping only the ones tonight's method leaves.
  const keep = { line: ['call', 'sit', 'out'], relay: ['msg', 'out'], books: ['out'] }[method];
  const f = signals(summary, records);
  for (const id of IDS) {
    f[id].cites = f[id].cites.filter((c) => keep.includes(c.e.kind)).map((c) => (method === 'books' ? { ...c, w: c.w * 2 } : c));
    f[id].raw = f[id].cites.reduce((n, c) => n + c.w, 0);
  }
  // Off the books leaves silence: nothing at all in the half hour before a sailing.
  if (method === 'books') {
    const before = summary.ships.map((s) => s.half - 1);
    for (const id of IDS) {
      const mine = records.filter((e) => e.who === id);
      const quiet = before.filter((h) => !mine.some((e) => e.half === h)).length;
      if (mine.length >= 3 && f[id].raw > 0) f[id].raw += 0.4 * quiet;
    }
  }
  return workTheDesk(d, summary, records, f, { readFrom: 15 });
}

// The Desk Sergeant: the busiest regulars are suspects. Six or more acts is a ban.
export async function deskSergeant(d) {
  const records = await d.records();
  const busy = Object.fromEntries(IDS.map((id) => [id, { n: 0, cites: [] }]));
  for (const e of records) {
    const w = e.kind === 'sit' ? 0.5 : e.kind === 'cards' ? 0 : 1;
    if (w) { busy[e.who].n += w; busy[e.who].cites.push(e.id); }
  }
  const scores = Object.fromEntries(IDS.map((id) => [id, Math.min(100, Math.round(busy[id].n * 11))]));
  for (const id of IDS) if (busy[id].n >= 6) await d.ban(id, busy[id].cites.slice(0, 3));
  await d.handIn(scores);
  return scores;
}
