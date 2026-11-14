// The house detective's desk: one detective's night. It shows the house's records for free, and
// keeps the budgets and the rules for everything that costs:
//   read     open the full text of one request or call. A few a night, each with a cited reason
//   tail     the doorman follows one regular and reports where they went. One a night
//   ban      ban a regular, citing the records behind the ban
//   clear    take a ban back
//   handIn   give every regular a suspicion score from 0 to 100. Bans are final from here
// Every play, refused or not, goes in the desk's log. The office, the lab and the browser page all
// use this same desk, so people and machines play under the same rules.

import * as theme from './theme.js';
import { IDS, BOOKS, READABLE, HALF_HOURS, clock, publicRecord } from './night.js';

export const BUDGET = { reads: 3, tails: 1 };
const nameOf = (id) => theme.regulars[IDS.indexOf(id)].name;

export class Refused extends Error {}

export function openDesk(night, { names = theme.names, reads = BUDGET.reads, tails = BUDGET.tails } = {}) {
  const byId = new Map(night.records.map((e) => [e.id, e]));
  const used = { reads: [], tails: [] };
  const bans = {};
  const log = [];
  let handedIn = null;

  const show = (e) => ({ ...publicRecord(e), time: clock(e.half), name: nameOf(e.who), ...(e.to ? { toName: nameOf(e.to) } : {}), ...(e.with ? { withName: nameOf(e.with) } : {}), ...(e.about ? { aboutName: nameOf(e.about) } : {}) });
  const regular = (raw) => {
    const id = String(raw ?? '').trim().toUpperCase();
    if (!IDS.includes(id)) throw new Refused('name a regular from R1 to R12, such as "R3"');
    return id;
  };
  const cites = (because, not) => {
    const list = Array.isArray(because) ? [...new Set(because.map(String))] : because == null ? [] : [String(because)];
    if (!list.length) throw new Refused('cite at least one record id as the reason, such as ["E12"]');
    const bad = list.find((x) => !byId.has(x) || x === not);
    if (bad) throw new Refused(bad === not ? 'a record cannot be its own reason' : `there is no record ${bad}`);
    return list;
  };
  const open = () => { if (handedIn) throw new Refused('you have handed in. Bans are final'); };
  const record = (kind, args, fn) => {
    try {
      const out = fn();
      log.push({ kind, args, ok: true });
      return out;
    } catch (err) {
      log.push({ kind, args, ok: false, why: err.message });
      throw err;
    }
  };

  return {
    log,
    summary() {
      return {
        place: theme.placeOf(names.club),
        ring: names.ring,
        member: names.member,
        machine: theme.machine.name,
        plate: theme.machine.plate,
        houseRules: theme.houseRules,
        hours: `8:00 PM to 4:00 AM, in ${HALF_HOURS} half hours (half 0 is 8:00 PM)`,
        regulars: IDS.map((id, i) => ({ id, name: theme.regulars[i].name, role: theme.regulars[i].role, ...(theme.regulars[i].habit ? { knownHabit: theme.regulars[i].habit } : {}) })),
        ships: night.ships.map((s) => ({ name: s.name, sails: clock(s.at), half: s.at })),
        harborOffice: theme.harborLine,
        books: Object.fromEntries(BOOKS.map((b) => [b, night.records.filter((e) => e.book === b).length])),
        budget: { reads: reads - used.reads.length, tails: tails - used.tails.length },
      };
    },
    records({ book, regular: who, from, to } = {}) {
      if (book != null && !BOOKS.includes(book)) throw new Refused(`a book is one of ${BOOKS.join(', ')}`);
      const id = who == null ? null : regular(who);
      return night.records
        .filter((e) => (!book || e.book === book) && (!id || e.who === id || e.to === id || e.with === id) && (from == null || e.half >= from) && (to == null || e.half <= to))
        .map(show);
    },
    read(recordId, because) {
      return record('read', { record: recordId, because }, () => {
        open();
        const e = byId.get(String(recordId));
        if (!e) throw new Refused(`there is no record ${recordId}`);
        if (!READABLE.has(e.kind)) throw new Refused(`${e.id} has no text to read. Only requests to the machine and calls do`);
        if (used.reads.some((r) => r.record === e.id)) return { record: e.id, text: e.text, again: true };
        if (used.reads.length >= reads) throw new Refused(`no content reads left tonight (${reads} a night)`);
        used.reads.push({ record: e.id, because: cites(because, e.id) });
        return { record: e.id, name: nameOf(e.who), text: e.text, readsLeft: reads - used.reads.length };
      });
    },
    tail(who) {
      return record('tail', { regular: who }, () => {
        open();
        const id = regular(who);
        if (used.tails.length >= tails) throw new Refused(`no tails left tonight (${tails} a night)`);
        used.tails.push({ regular: id });
        const trips = night.records.filter((e) => e.who === id && e.kind === 'out').map((e) => ({ record: e.id, time: clock(e.half), went: e.dest }));
        return { regular: id, name: nameOf(id), trips, tailsLeft: tails - used.tails.length };
      });
    },
    ban(who, because) {
      return record('ban', { regular: who, because }, () => {
        open();
        const id = regular(who);
        bans[id] = cites(because);
        return { banned: id, name: nameOf(id), because: bans[id] };
      });
    },
    clear(who) {
      return record('clear', { regular: who }, () => {
        open();
        const id = regular(who);
        delete bans[id];
        return { cleared: id };
      });
    },
    handIn(scores) {
      return record('handIn', { scores }, () => {
        open();
        if (!scores || typeof scores !== 'object') throw new Refused('send a score from 0 to 100 for every regular, as {"R1":10,...}');
        for (const id of IDS) {
          const s = scores[id];
          if (typeof s !== 'number' || Number.isNaN(s) || s < 0 || s > 100) throw new Refused(`the score for ${id} must be a number from 0 to 100`);
        }
        handedIn = Object.fromEntries(IDS.map((id) => [id, scores[id]]));
        return { handedIn: true, bans: Object.keys(bans) };
      });
    },
    // The detective's answer, for scoring. null until they hand in.
    answer() {
      return handedIn ? { scores: handedIn, bans: { ...bans }, reads: used.reads.slice(), tails: used.tails.slice() } : null;
    },
  };
}
