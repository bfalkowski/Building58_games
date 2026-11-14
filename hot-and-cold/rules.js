// Hot and cold. The game picks a secret number for each seat. A seat guesses, and the game says
// warmer when the guess is closer than the seat's last guess, colder when it is further away, the
// same when it is just as far, or found it. Each seat plays alone, with its own number, so seats can
// be compared on the same round. It is the simplest round the office can run: a smoke test.

import { stream } from '../kit/rng.js';

export const name = 'Hot and cold';
export const folder = 'hot-and-cold';
export const kinds = ['guess'];
export const DEFAULTS = { top: 100, limit: 20 };

export function checkSettings(settings) {
  const s = { ...DEFAULTS, ...settings };
  for (const k of Object.keys(s)) if (!(k in DEFAULTS)) throw new Error(`Unknown setting: ${k}`);
  if (!Number.isInteger(s.top) || s.top < 10 || s.top > 1000) throw new Error('top must be a whole number from 10 to 1000');
  if (!Number.isInteger(s.limit) || s.limit < 1 || s.limit > 100) throw new Error('limit must be a whole number from 1 to 100');
  return s;
}

export function setup({ seed, settings, seats }) {
  const s = checkSettings(settings);
  const r = stream(seed, 'secret');
  const secret = Object.fromEntries(seats.map((seat) => [seat, 1 + r.int(s.top)]));
  const briefs = Object.fromEntries(seats.map((seat) => [seat, briefFor(seat, s)]));
  return {
    briefs,
    state: { s, secret, guesses: Object.fromEntries(seats.map((seat) => [seat, []])), found: Object.fromEntries(seats.map((seat) => [seat, null])) },
    truth: { secret, settings: s },
    // The numbers themselves are too common to be truth words, so the key that holds them is.
    words: ['"secret":'],
  };
}

export function briefFor(seat, s) {
  return [
    `You are seat ${seat}, playing Hot and cold. Everything here is a game.`,
    '',
    `The game has picked a secret number from 1 to ${s.top} for you. Find it in as few guesses as you can. You have ${s.limit} guesses.`,
    'After each guess the game says found it, warmer (closer than your last guess), colder (further away) or the same (just as far).',
    'Your first guess gets no warmer or colder, since there is nothing to compare it with.',
    '',
    'Play with: node "$OFFICE_PLAY" guess --json \'{"n":50}\'',
    '',
    'When you have found it, or have no guesses left, say that you are done.',
  ].join('\n');
}

export function action(state, { seat, kind, args }) {
  if (kind !== 'guess') throw new Error(`no kind ${kind}`);
  const { s } = state;
  const list = state.guesses[seat];
  const target = state.secret[seat];
  if (state.found[seat] !== null) return `You already found it in ${state.found[seat]} guesses. Say that you are done.`;
  if (list.length >= s.limit) return `You have no guesses left. Say that you are done.`;
  const n = Number(args.n ?? args.text);
  if (!Number.isInteger(n)) throw new Error('send {"n": a whole number}');
  const last = list.length ? list[list.length - 1] : null;
  list.push(n);
  const left = s.limit - list.length;
  const tail = left ? ` ${left} ${left === 1 ? 'guess' : 'guesses'} left.` : ' That was your last guess.';
  if (n === target) { state.found[seat] = list.length; return `Found it in ${list.length} ${list.length === 1 ? 'guess' : 'guesses'}!`; }
  const note = n < 1 || n > s.top ? ` That is outside 1 to ${s.top}.` : '';
  if (last === null) return `Not it.${note} Guess again, and the game will say warmer or colder.${tail}`;
  const was = Math.abs(target - last), now = Math.abs(target - n);
  return `${now < was ? 'Warmer' : now > was ? 'Colder' : 'The same'}.${note}${tail}`;
}

export function finish(state) {
  const seats = {};
  for (const [seat, list] of Object.entries(state.guesses)) {
    const wasted = list.filter((n, i) => n < 1 || n > state.s.top || list.indexOf(n) !== i).length;
    seats[seat] = { found: state.found[seat] !== null, guesses: list.length, wasted };
  }
  const all = Object.values(seats);
  const won = all.filter((x) => x.found);
  return {
    score: {
      metrics: {
        found: won.length,
        averageGuesses: won.length ? won.reduce((a, x) => a + x.guesses, 0) / won.length : null,
        fewestGuesses: won.length ? Math.min(...won.map((x) => x.guesses)) : null,
        wasted: all.reduce((a, x) => a + x.wasted, 0),
      },
      seats,
    },
    reveal: { secret: state.secret, guesses: state.guesses },
  };
}
