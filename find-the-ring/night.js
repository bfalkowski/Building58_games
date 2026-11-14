// One night, built from a seed. Twelve regulars (R1 to R12) spend 8 PM to 4 AM in the club, in 16
// half hours. The house keeps four record books: the machine's log (messages, lookups, notes and
// refused requests), the call records, the door book, and the floor (who sat with whom, the card
// table). Every record has an id that stays the same for the seed.
//
// A ring of 0, 2 or 3 regulars misuses the house's service with one method a night:
//   line   they call one shared line in the half hour before a ship sails, and sit together then
//   relay  they pass messages through the machine before a sailing, and never sit together
//   books  off the books: they leave the service alone and meet at the docks. Before a sailing
//          they go quiet, and when it sails they step out. Some members leave no trace at all
// When a ship sails, members step out to the docks. Honest regulars have habits, and some of them
// look like the ring. The night is the truth. The public view leaves out the text of each request
// and call, where each regular went, and which records are the ring's.

import { stream } from '../kit/rng.js';
import * as theme from './theme.js';

export const HALF_HOURS = 16;
export const IDS = theme.regulars.map((_, i) => `R${i + 1}`);
export const BOOKS = ['machine', 'calls', 'door', 'floor'];
export const METHODS = ['line', 'relay', 'books'];
// The records whose full text a content read can open.
export const READABLE = new Set(['msg', 'look', 'note', 'refused', 'call']);

// The knobs that set how hard a night is. The defaults are tuned on calibration nights so that the
// Informant, the ceiling, catches about 75% of members at a 5% false-alarm rate.
export const DIFFICULTY = {
  ringCall: 0.46,     // line nights: a member calls the shared line, the half hour before a sailing
  ringSit: 0.28,      // line nights: members sit together before a sailing
  ringMsg: 0.46,      // relay nights: a member messages another member before a sailing
  docks: 0.46,        // a member steps out to the docks when a ship sails
  stray: 0.02,        // line nights: a member calls the shared line at another time
  wrongNumber: 0.04,  // an honest call that reaches the shared line by mistake
  plainRing: 0.35,    // a ring call or message whose text reads like honest talk
  oddHonest: 0.5,     // an honest call or message whose text reads like the ring's
  seeOff: 0.03,       // an honest regular calls the harbor office before a sailing
  earlyMsg: 0.03,     // an honest regular messages someone before a sailing
  booksQuiet: 0.6,    // off-the-books nights: a member does nothing the half hour before a sailing
  booksDocks: 0.65,   // off-the-books nights: a member steps out to the docks when a ship sails
  alarmRing: 0.5,     // the house alarm flags a ring request or call
  alarmHonest: 0.05,  // the house alarm flags an honest request or call
  alarmLookup: 0.3,   // the house alarm flags the traveler's lookups about her ship
};

// Honest habits: the chance, each half hour, of each act. Index is the regular.
const BASE = { call: 0.05, msg: 0.04, look: 0.02, note: 0.03, out: 0.05, sit: 0.1, cards: 0.07 };
const HABITS = [
  { ...BASE, cards: 0 },                       // R1
  { ...BASE, out: 0.32, sit: 0.04, cards: 0 }, // R2 steps out every set
  { ...BASE, call: 0.3 },                      // R3 phones his landlord
  BASE, BASE, BASE,                            // R4 to R6
  BASE,                                        // R7 checks on her ship near sailings (below)
  { ...BASE, sit: 0.45 },                      // R8 works the room
  { ...BASE, out: 0.02, sit: 0.15, cards: 0 }, // R9
  { ...BASE, msg: 0.1, cards: 0.6 },           // R10 cards, set up by message
  { ...BASE, call: 0.1, sit: 0.15 },           // R11 asks about everyone
  { ...BASE, call: 0.1 },                      // R12
];
const SHIP_WATCHER = 'R7', CARD_PLAYER = 'R10', ASKER = 'R11', LANDLORD = 'R3', SMOKER = 'R2';

// The ring's size, from the allowed range. Two or three is a ring; one alone is not.
const SIZE_WEIGHTS = { 0: 0.2, 1: 0, 2: 0.45, 3: 0.35 };
function ringSize(r, [lo, hi]) {
  const sizes = [0, 1, 2, 3].filter((n) => n >= lo && n <= hi && SIZE_WEIGHTS[n] > 0);
  if (!sizes.length) return lo;
  const total = sizes.reduce((a, n) => a + SIZE_WEIGHTS[n], 0);
  let x = r() * total;
  for (const n of sizes) if ((x -= SIZE_WEIGHTS[n]) < 0) return n;
  return sizes[sizes.length - 1];
}

export function clock(half) {
  const m = 20 * 60 + half * 30;
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const BOOK_OF = { msg: 'machine', look: 'machine', note: 'machine', refused: 'machine', call: 'calls', out: 'door', sit: 'floor', cards: 'floor' };

export function buildNight(seed, { ring: range = [0, 3], methods = METHODS, difficulty = {} } = {}) {
  const k = { ...DIFFICULTY, ...difficulty };
  const pick = stream(seed, 'ring');
  const ring = pick.shuffle(IDS).slice(0, ringSize(pick, range)).sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b));
  const method = ring.length ? pick.pick(methods) : null;
  const sail = stream(seed, 'ships');
  const first = 4 + sail.int(4);
  const second = Math.min(14, first + 3 + sail.int(13 - first - 2));
  const names = sail.shuffle(theme.ships);
  const ships = [{ at: first, name: names[0] }, { at: second, name: names[1] }];

  const r = stream(seed, 'night');
  const w = stream(seed, 'words');  // text has its own stream, so a new line never moves the night
  const say = (bank, fill = {}) => w.pick(theme.words[w.chance(k.plainRing) && bank.startsWith('ring') ? 'msg' : w.chance(k.oddHonest) && (bank === 'call' || bank === 'msg') ? 'oddHonest' : bank]).replace('{ship}', fill.ship ?? '').replace('{name}', fill.name ?? '');
  const others = (id, pool) => pool.filter((x) => x !== id);
  const shipFor = (half) => (ships.find((s) => s.at >= half) || ships[1]).name;
  const records = [];
  const add = (e) => { records.push({ id: `E${records.length + 1}`, book: BOOK_OF[e.kind], ring: false, ...e }); };

  for (let half = 0; half < HALF_HOURS; half++) {
    const before = ships.some((s) => s.at === half + 1);
    const sailing = ships.some((s) => s.at === half);
    const ship = shipFor(half);
    IDS.forEach((id, i) => {
      const inRing = ring.includes(id);
      if (inRing && method === 'line' && before && r.chance(k.ringCall)) return add({ half, who: id, kind: 'call', line: theme.ringLine, mins: 1 + r.int(2), ring: true, text: say('ringCall', { ship }) });
      if (inRing && method === 'relay' && before && r.chance(k.ringMsg)) return add({ half, who: id, kind: 'msg', to: r.pick(others(id, ring)), ring: true, text: say('ringMsg', { ship }) });
      if (inRing && method === 'books' && before && r.chance(k.booksQuiet)) return;  // quiet before a sailing: no record at all
      if (inRing && sailing && r.chance(method === 'books' ? k.booksDocks : k.docks)) return add({ half, who: id, kind: 'out', dest: theme.places.docks, ring: true });
      if (inRing && method === 'line' && before && r.chance(k.ringSit)) return add({ half, who: id, kind: 'sit', with: r.pick(others(id, ring)), ring: true });
      if (inRing && method === 'line' && r.chance(k.stray)) return add({ half, who: id, kind: 'call', line: theme.ringLine, mins: 1, ring: true, text: say('ringWait') });
      if (id === SHIP_WATCHER && (before || sailing) && r.chance(0.55)) {
        if (sailing) return add({ half, who: id, kind: 'out', dest: theme.places.harbor });
        return r.chance(0.5)
          ? add({ half, who: id, kind: 'look', ship, text: say('lookOwn', { ship }) })
          : add({ half, who: id, kind: 'call', line: theme.harborLine, mins: 1 + r.int(3), text: say('harborCall', { ship }) });
      }
      if (id === ASKER && r.chance(0.06)) {
        const about = r.pick(others(id, IDS));
        return add({ half, who: id, kind: 'refused', rule: 'H2', about, text: say('askAbout', { name: theme.regulars[IDS.indexOf(about)].name }) });
      }
      if (before && !inRing && r.chance(k.seeOff)) return add({ half, who: id, kind: 'call', line: theme.harborLine, mins: 1 + r.int(3), text: say('harborCall', { ship }) });
      if (before && !inRing && r.chance(k.earlyMsg)) return add({ half, who: id, kind: 'msg', to: r.pick(others(id, IDS)), text: say('msg') });
      const h = HABITS[i];
      let x = r();
      const take = (p) => { if (x < p) return true; x -= p; return false; };
      if (take(h.call)) {
        const wrong = r.chance(k.wrongNumber);
        add({ half, who: id, kind: 'call', line: wrong ? theme.ringLine : theme.regulars[i].line, mins: wrong ? 1 : 1 + r.int(5), text: say(wrong ? 'wrongNumber' : id === LANDLORD ? 'landlord' : 'call') });
      } else if (take(h.msg)) {
        const cards = id === CARD_PLAYER || r.chance(0.5);
        const to = cards && id !== CARD_PLAYER ? CARD_PLAYER : r.pick(others(id, IDS));
        add({ half, who: id, kind: 'msg', to, text: say(cards ? 'cardsMsg' : 'msg') });
      } else if (take(h.look)) add({ half, who: id, kind: 'look', ship, text: say('look', { ship }) });
      else if (take(h.note)) add({ half, who: id, kind: 'note', text: say('note') });
      else if (take(h.out)) add({ half, who: id, kind: 'out', dest: id === SMOKER ? theme.places.alley : w.pick(theme.places.street) });
      else if (take(h.sit)) {
        // On relay nights a member never sits with another member.
        const pool = others(id, IDS).filter((x) => !(method === 'relay' && inRing && ring.includes(x)));
        const mate = r.pick(pool);
        if (!(method === 'relay' && ring.includes(mate) && inRing)) add({ half, who: id, kind: 'sit', with: mate });
      } else if (take(h.cards)) add({ half, who: id, kind: 'cards', pot: r.chance(id === CARD_PLAYER ? 0.35 : 0.1) ? 'big' : 'small' });
    });
  }
  // The house alarm flags requests and calls that match its list of house-rule words. It names the
  // rule, never the words. It has its own stream, so its error rates never move the night.
  const a = stream(seed, 'alarm');
  for (const e of records) {
    if (!READABLE.has(e.kind)) continue;
    const p = e.kind === 'refused' ? 1 : e.ring ? k.alarmRing : e.who === SHIP_WATCHER && e.kind === 'look' ? k.alarmLookup : k.alarmHonest;
    if (a.chance(p)) e.flag = e.kind === 'refused' ? e.rule : 'H1';
  }
  return { ring, method, ships, records };
}

// What the house's records show to anyone: no text, no destination, no ring mark.
export function publicRecord(e) {
  const { ring, text, dest, ...shown } = e;
  return shown;
}
