// One night, built from a seed. Twelve regulars (R1 to R12) spend 8 PM to 4 AM in the club, in 16
// half hours. Each half hour a regular may make a call, step outside, sit down with someone, or play
// cards. A ring of 0 to 3 regulars works together: in the half hour before a ship sails they call
// the ring's line and sit together, and when it sails they step outside. Some honest regulars have
// habits that look the same. The night is the truth; the public view is its events and the ships.

import { stream } from '../kit/rng.js';
import * as theme from './theme.js';

export const HALF_HOURS = 16;
export const IDS = theme.regulars.map((_, i) => `R${i + 1}`);

// Honest habits: the chance, each half hour, of each act. Index is the regular.
const BASE = { call: 0.05, out: 0.05, talk: 0.1, cards: 0.08 };
const HABITS = [
  { call: 0.04, out: 0.04, talk: 0.08, cards: 0 },        // R1 the singer
  { call: 0.02, out: 0.32, talk: 0.04, cards: 0 },        // R2 steps out every set
  { call: 0.3, out: 0.05, talk: 0.05, cards: 0.05 },      // R3 phones all night
  BASE, BASE, BASE,
  BASE,                                                   // R7 checks on her ship near sailings (below)
  { call: 0.04, out: 0.04, talk: 0.45, cards: 0.05 },     // R8 works the room
  { call: 0.02, out: 0.02, talk: 0.15, cards: 0 },        // R9 the bartender
  { call: 0.03, out: 0.04, talk: 0.05, cards: 0.6 },      // R10 plays cards all night
  { call: 0.12, out: 0.06, talk: 0.15, cards: 0.04 },     // R11 the reporter
  { call: 0.1, out: 0.04, talk: 0.08, cards: 0.08 },      // R12 the doctor
];
const SHIP_WATCHER = 'R7';
const WRONG_NUMBER = 0.025;  // an honest call that reaches the ring's line by mistake

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

export function buildNight(seed, { ring: range = [0, 3] } = {}) {
  const pick = stream(seed, 'ring');
  const ring = pick.shuffle(IDS).slice(0, ringSize(pick, range)).sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b));
  const sail = stream(seed, 'ships');
  const first = 4 + sail.int(4);
  const second = Math.min(14, first + 3 + sail.int(13 - first - 2));
  const names = sail.shuffle(theme.ships);
  const ships = [{ at: first, name: names[0] }, { at: second, name: names[1] }];

  const r = stream(seed, 'night');
  const others = (id, pool) => pool.filter((x) => x !== id);
  const events = [];
  for (let half = 0; half < HALF_HOURS; half++) {
    const before = ships.some((s) => s.at === half + 1);
    const sailing = ships.some((s) => s.at === half);
    IDS.forEach((id, i) => {
      const inRing = ring.includes(id);
      let e = null;
      if (inRing && before && r.chance(0.55)) e = { act: 'call', line: theme.ringLine };
      else if (inRing && sailing && r.chance(0.6)) e = { act: 'out' };
      else if (inRing && before && ring.length > 1 && r.chance(0.35)) e = { act: 'talk', with: r.pick(others(id, ring)) };
      else if (inRing && r.chance(0.02)) e = { act: 'call', line: theme.ringLine };
      else if (id === SHIP_WATCHER && (before || sailing) && r.chance(0.55)) e = sailing ? { act: 'out' } : { act: 'call', line: theme.harborLine };
      else {
        const k = HABITS[i];
        let x = r();
        if (x < k.call) e = { act: 'call', line: r.chance(WRONG_NUMBER) ? theme.ringLine : theme.regulars[i].line };
        else if ((x -= k.call) < k.out) e = { act: 'out' };
        else if ((x -= k.out) < k.talk) e = { act: 'talk', with: r.pick(others(id, IDS)) };
        else if ((x -= k.talk) < k.cards) e = { act: 'cards', pot: r.chance(id === 'R10' ? 0.35 : 0.12) ? 'big' : 'small' };
      }
      if (e) events.push({ half, who: id, ...e });
    });
  }
  return { ring, ships, events };
}
