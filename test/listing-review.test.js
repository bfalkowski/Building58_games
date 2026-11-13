// Listing review: every seat investigates the same round on its own, sees only the public view, and
// is scored from the planted truth. Rounds with and without paid reviewers both happen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../listing-review/rules.js';

process.env.GAMES_SECRET = 'test-secret';  // the round's public id needs a key; keep it out of ~/.games
const seats = ['S1', 'S2'];
const all = (state, seat) => {
  const out = [rules.action(state, { seat, kind: 'summary', args: {} })];
  for (let page = 1; page <= 4; page++) out.push(rules.action(state, { seat, kind: 'listings', args: { page } }));
  for (const id of state.ids) for (const kind of ['labels', 'log']) out.push(rules.action(state, { seat, kind, args: { reviewer: id } }));
  return out.join('\n');
};

test('the public view holds no truth: no member, persona, gold or decoy field, and no seed', () => {
  const seed = 'lr-view-seed-1';
  const { state, words, briefs } = rules.setup({ seed, settings: {}, seats });
  const text = all(state, 'S1') + Object.values(briefs).join('\n');
  // membershipRate is public: the share of paid reviewers on average, not who they are.
  for (const w of [...words, seed, '"member"', '"persona"', '"decoy"', '"gold"', '"acted"', '"strict"', '"lenient"', '"narrow"']) assert.ok(!text.includes(w), w);
});

test('every seat gets the same brief, apart from its own name', () => {
  const { briefs } = rules.setup({ seed: 'lr-brief', settings: {}, seats });
  assert.equal(briefs.S1.replace(/S1/g, 'Sx'), briefs.S2.replace(/S2/g, 'Sx'));
  assert.match(briefs.S1, /node "\$OFFICE_PLAY"/);
});

test('across seeds, some rounds have paid reviewers and some have none', () => {
  const counts = new Set();
  for (let i = 0; i < 30; i++) {
    const { state } = rules.setup({ seed: `lr-mix-${i}`, settings: {}, seats: ['S1'] });
    counts.add(rules.finish(state).score.metrics.members);
  }
  assert.ok(counts.has(0), 'a round with no paid reviewers');
  assert.ok([...counts].some((n) => n >= 2), 'a round with a group');
});

test('each seat is scored on its own answer, and a seat that never answers is marked so', () => {
  const { state } = rules.setup({ seed: 'lr-score-1', settings: { members: [2, 4] }, seats: ['S1', 'S2', 'S3'] });
  const truth = state.open.finish({ scores: Object.fromEntries(state.ids.map((id) => [id, 0])), reReview: null }).truth;
  const members = state.ids.filter((id) => truth.reviewers[id].member);
  const perfect = Object.fromEntries(state.ids.map((id) => [id, members.includes(id) ? 100 : 0]));
  rules.action(state, { seat: 'S1', kind: 'accuse', args: { scores: perfect, group: members } });
  rules.action(state, { seat: 'S2', kind: 'accuse', args: { scores: Object.fromEntries(state.ids.map((id) => [id, 100])), group: state.ids } });
  const { score, reveal } = rules.finish(state);
  assert.deepEqual(reveal.members, members);
  assert.equal(score.seats.S1.groupRight, true);
  assert.equal(score.seats.S1.falseAccusations, 0);
  assert.ok(score.seats.S1.auc === 1 || score.seats.S1.auc === null);
  assert.equal(score.seats.S2.falseAccusations, 12 - members.length, 'accusing everyone counts every honest reviewer');
  assert.deepEqual(score.seats.S3, { answered: false });
  assert.equal(score.metrics.answered, 2);
});

test('a bad play gets a plain error, and the round goes on', () => {
  const { state } = rules.setup({ seed: 'lr-bad', settings: {}, seats });
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'labels', args: { reviewer: 'P99' } }), /P1 to P12/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'listings', args: { page: 9 } }), /pages are 1 to 4/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'accuse', args: { scores: { P1: 5 } } }), /P2/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'accuse', args: { scores: Object.fromEntries(state.ids.map((id) => [id, 1])), group: ['P42'] } }), /not a reviewer/);
  assert.match(rules.action(state, { seat: 'S1', kind: 'labels', args: { text: 'p3' } }), /"reviewer":"P3"/);
});
