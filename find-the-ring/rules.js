// Find the ring, for the office. One night in a club: twelve regulars, two ships, and maybe a ring
// of two or three who work together. Each seat is a detective. It reads the night's clues through
// plays, gives every regular a suspicion score, and names the ring, or nobody. Every seat works the
// same night on its own and is scored on its own. The theme's words are all in theme.js.

import * as theme from './theme.js';
import { buildNight, clock, IDS, HALF_HOURS } from './night.js';
import { CUT } from './investigators.js';
import { tally, auc } from './score.js';

export const name = 'Find the ring';
export const folder = 'find-the-ring';
export const kinds = ['summary', 'phone', 'door', 'together', 'cards', 'timeline', 'name'];
export { CUT };
// The regulars with an honest habit that looks like the ring's.
export const LOOKALIKES = IDS.filter((_, i) => theme.regulars[i].habit);

export function briefFor(seat, names = theme.names) {
  return [
    `You are seat ${seat}, a detective in a round of Find the ring. Everything in it is made up.`,
    '',
    `The place is ${theme.placeOf(names.club)}. Twelve regulars, R1 to R12, spend one night there, from 8 PM to 4 AM. Two ships sail during the night.`,
    `Some regulars may be ${theme.plural(names.member)}: a ring that calls itself ${names.ring}, two or three people who work together to move ${theme.cargo}. A night can have no ring at all.`,
    'Some honest regulars have habits that look suspicious. Judge what regulars did, never who they are.',
    '',
    'Your job: give every regular a score from 0 to 100, the chance in percent that they are in the ring. Then name the ring, or an empty list if you think there is none.',
    `Scoring: each ring member you name is +1, each honest regular you name is -2. A score of ${CUT} or more also counts as naming.`,
    '',
    'Play with: node "$OFFICE_PLAY" <kind> --json \'<args>\'. The kinds:',
    '  summary                                    the regulars, their known habits, and the ships',
    '  phone --json \'{"regular":"R3"}\'            the phone log. Leave out regular for every call, or give {"line":"..."}',
    '  door --json \'{"regular":"R3"}\'             the door book: who stepped outside, and when',
    '  together --json \'{"regular":"R3"}\'         who sat down with whom',
    '  cards --json \'{"regular":"R3"}\'            the card table',
    '  timeline --json \'{"regular":"R3"}\'         everything one regular did, in order',
    '  name --json \'{"scores":{"R1":10,...,"R12":5},"ring":["R4","R5"]}\'',
    '                                             your answer, with all twelve scores. Send it again to change it.',
    '',
    'Answers come back as JSON. Work only from these answers. Other seats work the same night on their own.',
    'When you have sent name, say that you are done.',
  ].join('\n');
}

function range(settings) {
  const r = settings.ring ?? [0, 3];
  if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n >= 0 && n <= 3) || r[0] > r[1]) {
    throw new Error('the ring setting is a range inside 0 to 3, such as [0, 3]');
  }
  return r;
}

// A name setting is a short line of plain text. Leaving it out keeps the theme's default.
const NAME_TEXT = /^[A-Za-z0-9][A-Za-z0-9 .,'&-]{0,59}$/;
export function namesFrom(settings) {
  const out = { ...theme.names };
  for (const key of Object.keys(out)) {
    const v = settings[`${key}Name`];
    if (v == null) continue;
    if (typeof v !== 'string' || !NAME_TEXT.test(v.trim())) {
      throw new Error(`the ${key}Name setting is plain text of 1 to 60 letters, digits, spaces and . , ' & -`);
    }
    out[key] = v.trim();
  }
  return out;
}

export function setup({ seed, settings, seats }) {
  const names = namesFrom(settings);
  const night = buildNight(seed, { ring: range(settings) });
  const view = { ships: night.ships, events: night.events };
  return {
    briefs: Object.fromEntries(seats.map((s) => [s, briefFor(s, names)])),
    state: { night, view, names, answers: Object.fromEntries(seats.map((s) => [s, null])) },
    truth: { inRing: night.ring, ships: night.ships },
    // A word only the truth has: its field name.
    words: ['"inRing":'],
  };
}

const json = (x) => JSON.stringify(x);
const nameOf = (id) => theme.regulars[IDS.indexOf(id)].name;
const shown = (e) => {
  const out = { time: clock(e.half), half: e.half, who: e.who, name: nameOf(e.who) };
  if (e.act === 'call') out.line = e.line;
  if (e.act === 'talk') { out.with = e.with; out.withName = nameOf(e.with); }
  if (e.act === 'cards') out.pot = e.pot;
  return out;
};
function regularArg(args, required) {
  const raw = args.regular ?? args.text;
  if (raw == null || raw === '') { if (required) throw new Error('name a regular from R1 to R12, as {"regular":"R3"}'); return null; }
  const id = String(raw).trim().toUpperCase();
  if (!IDS.includes(id)) throw new Error('name a regular from R1 to R12, as {"regular":"R3"}');
  return id;
}

export function action(state, { seat, kind, args }) {
  const { ships, events } = state.view;
  if (kind === 'summary') {
    return json({
      place: theme.placeOf(state.names.club),
      ring: state.names.ring,
      hours: `8:00 PM to 4:00 AM, in ${HALF_HOURS} half hours (half 0 is 8:00 PM)`,
      regulars: IDS.map((id, i) => ({ id, name: theme.regulars[i].name, role: theme.regulars[i].role, ...(theme.regulars[i].habit ? { knownHabit: theme.regulars[i].habit } : {}) })),
      ships: ships.map((s) => ({ name: s.name, sails: clock(s.at), half: s.at })),
      harborMaster: theme.harborLine,
      clues: { phone: events.filter((e) => e.act === 'call').length, door: events.filter((e) => e.act === 'out').length, together: events.filter((e) => e.act === 'talk').length, cards: events.filter((e) => e.act === 'cards').length },
    });
  }
  const acts = { phone: 'call', door: 'out', together: 'talk', cards: 'cards' };
  if (acts[kind]) {
    const id = regularArg(args, false);
    const line = kind === 'phone' && args.line ? String(args.line) : null;
    const list = events.filter((e) => e.act === acts[kind] && (!id || e.who === id || e.with === id) && (!line || e.line === line));
    return json({ [kind]: list.map(shown) });
  }
  if (kind === 'timeline') {
    const id = regularArg(args, true);
    return json({ regular: id, name: nameOf(id), timeline: events.filter((e) => e.who === id || e.with === id).map((e) => ({ ...shown(e), act: e.act })) });
  }
  if (kind === 'name') {
    const scores = args.scores;
    if (!scores || typeof scores !== 'object') throw new Error('send {"scores":{"R1":0..100,...},"ring":[...]}');
    for (const id of IDS) {
      const s = scores[id];
      if (typeof s !== 'number' || Number.isNaN(s) || s < 0 || s > 100) throw new Error(`the score for ${id} must be a number from 0 to 100`);
    }
    const ring = Array.isArray(args.ring) ? [...new Set(args.ring.map((x) => String(x).toUpperCase()))] : [];
    const bad = ring.find((x) => !IDS.includes(x));
    if (bad) throw new Error(`${bad} is not a regular`);
    state.answers[seat] = { scores: Object.fromEntries(IDS.map((id) => [id, scores[id]])), ring };
    return 'Saved. You can send name again to change it until the round ends.';
  }
  throw new Error(`no kind ${kind}`);
}

const num = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };

// The regulars a seat named: its ring list, plus anyone it scored at or above the cut.
export const namedBy = (a) => [...new Set([...a.ring, ...IDS.filter((id) => a.scores[id] >= CUT)])];

export function scoreSeat(ring, a) {
  const t = tally(ring, namedBy(a));
  const honest = IDS.filter((id) => !ring.includes(id));
  const pos = ring.map((id) => a.scores[id]);
  return {
    answered: true,
    named: namedBy(a),
    caught: t.caught.length,
    gotAway: t.gotAway.length,
    wrongMen: t.wrongMen.length,
    cleared: t.cleared.length,
    points: t.caught.length - 2 * t.wrongMen.length,
    quietRight: ring.length ? null : t.wrongMen.length === 0,
    auc: num(auc(pos, honest.map((id) => a.scores[id]))),
    aucVsLookalikes: num(auc(pos, honest.filter((id) => LOOKALIKES.includes(id)).map((id) => a.scores[id]))),
  };
}

export function finish(state) {
  const ring = state.night.ring;
  const seats = {};
  for (const [seat, a] of Object.entries(state.answers)) seats[seat] = a ? scoreSeat(ring, a) : { answered: false };
  const answered = Object.values(seats).filter((s) => s.answered);
  const sum = (k) => answered.reduce((n, s) => n + s[k], 0);
  return {
    score: {
      metrics: {
        answered: answered.length,
        ringSize: ring.length,
        caught: sum('caught'),
        gotAway: sum('gotAway'),
        wrongMen: sum('wrongMen'),
        points: sum('points'),
        auc: num(mean(answered.map((s) => s.auc ?? NaN))),
        aucVsLookalikes: num(mean(answered.map((s) => s.aucVsLookalikes ?? NaN))),
      },
      seats,
    },
    reveal: {
      ring: ring.map((id) => ({ id, name: nameOf(id) })),
      lookalikes: LOOKALIKES.filter((id) => !ring.includes(id)).map((id) => ({ id, name: nameOf(id), habit: theme.regulars[IDS.indexOf(id)].habit })),
      ringLine: theme.ringLine,
    },
  };
}
