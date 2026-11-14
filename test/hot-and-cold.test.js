// Hot and cold: each seat finds its own secret number from warmer and colder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../hot-and-cold/rules.js';
import { halvingPlayer, countingPlayer } from '../hot-and-cold/players.js';

const play = (state, seat) => async (kind, args = {}) => {
  try { return rules.action(state, { seat, kind, args }); } catch (e) { return `Error: ${e.message}`; }
};
const round = (secret, settings = {}) => {
  const { state } = rules.setup({ seed: 'hc', settings, seats: ['S1'] });
  state.secret.S1 = secret;
  return state;
};

test('each seat gets its own number, and the same seed gives the same numbers', () => {
  const a = rules.setup({ seed: 'hc-same', settings: {}, seats: ['S1', 'S2', 'S3', 'S4'] });
  const b = rules.setup({ seed: 'hc-same', settings: {}, seats: ['S1', 'S2', 'S3', 'S4'] });
  assert.deepEqual(a.truth.secret, b.truth.secret);
  for (const n of Object.values(a.truth.secret)) assert.ok(n >= 1 && n <= 100);
  let differ = 0;
  for (let i = 0; i < 20; i++) {
    const { truth } = rules.setup({ seed: `hc-${i}`, settings: {}, seats: ['S1', 'S2'] });
    if (truth.secret.S1 !== truth.secret.S2) differ++;
  }
  assert.ok(differ > 15);
});

test('the brief and the answers never hold the secret before it is found', async () => {
  for (let i = 0; i < 10; i++) {
    const { state, briefs } = rules.setup({ seed: `hc-hide-${i}`, settings: {}, seats: ['S1'] });
    assert.ok(!/secret number is \d/.test(briefs.S1));
    const answers = [];
    await countingPlayer()(briefs.S1, async (kind, args) => { const t = await play(state, 'S1')(kind, args); answers.push(t); return t; });
    for (const t of answers.slice(0, -1)) assert.ok(!t.includes(String(state.secret.S1)) || /left\.$/.test(t), t);
  }
});

test('warmer, colder, the same and found it follow the distance to the number', () => {
  const s = round(40);
  const g = (n) => rules.action(s, { seat: 'S1', kind: 'guess', args: { n } });
  assert.match(g(10), /^Not it\./);
  assert.match(g(30), /^Warmer\./);
  assert.match(g(60), /^Colder\./);
  assert.match(g(20), /^The same\./);
  assert.match(g(40), /^Found it in 5 guesses!/);
  assert.match(g(41), /already found/);
});

test('guesses run out at the limit, and wasted guesses are counted', () => {
  const s = round(99, { limit: 3 });
  const g = (n) => rules.action(s, { seat: 'S1', kind: 'guess', args: { n } });
  g(5); g(5);
  assert.match(g(500), /outside 1 to 100\. That was your last guess\./);
  assert.match(g(99), /no guesses left/);
  const { score } = rules.finish(s);
  assert.deepEqual(score.seats.S1, { found: false, guesses: 3, wasted: 2 });
  assert.equal(score.metrics.found, 0);
  assert.equal(score.metrics.averageGuesses, null);
});

test('the halving player finds every number from 1 to 100 in at most 14 guesses, inside the limit of 20', async () => {
  let most = 0;
  for (let secret = 1; secret <= 100; secret++) {
    const s = round(secret);
    await halvingPlayer()(rules.briefFor('S1', s.s), play(s, 'S1'));
    assert.ok(s.found.S1 !== null, `found ${secret}`);
    most = Math.max(most, s.found.S1);
  }
  assert.ok(most <= 14, `most guesses ${most}`);
});

test('the score tells a good player from a weak one on the same round', async () => {
  const { state } = rules.setup({ seed: 'hc-compare', settings: {}, seats: ['S1', 'S2'] });
  state.secret.S1 = state.secret.S2 = 77;
  await halvingPlayer()(rules.briefFor('S1', state.s), play(state, 'S1'));
  await countingPlayer()(rules.briefFor('S2', state.s), play(state, 'S2'));
  const { score, reveal } = rules.finish(state);
  assert.equal(score.seats.S1.found, true);
  assert.ok(score.seats.S1.guesses < 12);
  assert.equal(score.seats.S2.found, false, 'counting up from 1 runs out of guesses before 77');
  assert.equal(score.metrics.found, 1);
  assert.deepEqual(reveal.secret, { S1: 77, S2: 77 });
});

test('bad settings and bad guesses are refused', () => {
  assert.throws(() => rules.setup({ seed: 'x', settings: { top: 5 }, seats: ['S1'] }), /10 to 1000/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { limit: 0 }, seats: ['S1'] }), /1 to 100/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { hint: 1 }, seats: ['S1'] }), /Unknown setting/);
  assert.throws(() => rules.action(round(5), { seat: 'S1', kind: 'guess', args: { n: 'five' } }), /whole number/);
});
