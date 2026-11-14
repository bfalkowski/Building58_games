// Find the ring: every seat works the same night on its own, sees only the public clues, and is
// scored from the planted ring. Nights with and without a ring both happen, and honest look-alikes
// look like the ring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../find-the-ring/rules.js';
import { buildNight, IDS } from '../find-the-ring/night.js';
import { runLab } from '../find-the-ring/lab.js';

const seats = ['S1', 'S2'];
const everything = (state, seat) => {
  const out = ['summary', 'phone', 'door', 'together', 'cards'].map((kind) => rules.action(state, { seat, kind, args: {} }));
  for (const id of IDS) out.push(rules.action(state, { seat, kind: 'timeline', args: { regular: id } }));
  return out.join('\n');
};

test('the public clues hold no truth: no ring field and no seed', () => {
  const seed = 'ring-view-seed-1';
  const { state, words, briefs } = rules.setup({ seed, settings: { ring: [2, 3] }, seats });
  const text = everything(state, 'S1') + Object.values(briefs).join('\n');
  for (const w of [...words, seed, '"inRing"']) assert.ok(!text.includes(w), w);
});

test('every seat gets the same brief, apart from its own name', () => {
  const { briefs } = rules.setup({ seed: 'ring-brief', settings: {}, seats });
  assert.equal(briefs.S1.replace(/S1/g, 'Sx'), briefs.S2.replace(/S2/g, 'Sx'));
  assert.match(briefs.S1, /node "\$OFFICE_PLAY"/);
});

test('the same seed builds the same night', () => {
  assert.deepEqual(buildNight('same-seed'), buildNight('same-seed'));
  assert.notDeepEqual(buildNight('same-seed').events, buildNight('other-seed').events);
});

test('across seeds, some nights have no ring and some have a ring of two or three, never one', () => {
  const sizes = new Set();
  for (let i = 0; i < 60; i++) sizes.add(buildNight(`ring-mix-${i}`).ring.length);
  assert.ok(sizes.has(0), 'a quiet night');
  assert.ok(sizes.has(2) && sizes.has(3), 'rings of two and three');
  assert.ok(!sizes.has(1), 'a ring of one is not a ring');
  for (let i = 0; i < 20; i++) assert.equal(buildNight(`ring-none-${i}`, { ring: [0, 0] }).ring.length, 0);
});

test('an honest look-alike looks like the ring: the traveler steps out when the ships sail', () => {
  let honestNights = 0, outAtSailing = 0;
  for (let i = 0; i < 80; i++) {
    const n = buildNight(`ring-look-${i}`);
    if (n.ring.includes('R7')) continue;
    honestNights++;
    const sails = new Set(n.ships.map((s) => s.at));
    if (n.events.some((e) => e.who === 'R7' && e.act === 'out' && sails.has(e.half))) outAtSailing++;
  }
  assert.ok(outAtSailing / honestNights > 0.5, `${outAtSailing} of ${honestNights}`);
});

test('each seat is scored on its own answer, and a seat that never names is marked so', () => {
  const { state } = rules.setup({ seed: 'ring-score-1', settings: { ring: [2, 3] }, seats: ['S1', 'S2', 'S3'] });
  const ring = state.night.ring;
  const perfect = Object.fromEntries(IDS.map((id) => [id, ring.includes(id) ? 100 : 0]));
  rules.action(state, { seat: 'S1', kind: 'name', args: { scores: perfect, ring } });
  rules.action(state, { seat: 'S2', kind: 'name', args: { scores: Object.fromEntries(IDS.map((id) => [id, 100])), ring: IDS } });
  const { score, reveal } = rules.finish(state);
  assert.deepEqual(reveal.ring.map((r) => r.id), ring);
  assert.equal(score.seats.S1.caught, ring.length);
  assert.equal(score.seats.S1.wrongMen, 0);
  assert.equal(score.seats.S1.points, ring.length);
  assert.equal(score.seats.S1.auc, 1);
  assert.equal(score.seats.S2.wrongMen, 12 - ring.length, 'naming everyone counts every honest regular');
  assert.equal(score.seats.S2.points, ring.length - 2 * (12 - ring.length));
  assert.deepEqual(score.seats.S3, { answered: false });
  assert.equal(score.metrics.answered, 2);
});

test('a score at or above the cut counts as naming, even if the ring list leaves it out', () => {
  const { state } = rules.setup({ seed: 'ring-cut', settings: { ring: [0, 0] }, seats: ['S1'] });
  rules.action(state, { seat: 'S1', kind: 'name', args: { scores: Object.fromEntries(IDS.map((id) => [id, id === 'R3' ? rules.CUT : 0])), ring: [] } });
  const s = rules.finish(state).score.seats.S1;
  assert.equal(s.wrongMen, 1);
  assert.equal(s.quietRight, false);
});

test('a bad play gets a plain error, and the round goes on', () => {
  const { state } = rules.setup({ seed: 'ring-bad', settings: {}, seats });
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'timeline', args: { regular: 'R99' } }), /R1 to R12/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'timeline', args: {} }), /R1 to R12/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'name', args: { scores: { R1: 5 } } }), /R2/);
  assert.throws(() => rules.action(state, { seat: 'S1', kind: 'name', args: { scores: Object.fromEntries(IDS.map((id) => [id, 1])), ring: ['R42'] } }), /not a regular/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { ring: [3, 1] }, seats }), /range inside 0 to 3/);
  assert.match(rules.action(state, { seat: 'S1', kind: 'timeline', args: { text: 'r3' } }), /"regular":"R3"/);
});

test('over 100 nights, the detective beats the Desk Sergeant and rarely names an honest regular', () => {
  const lab = runLab({ nights: 100, seed: 'ring-lab' });
  const d = lab.detective, s = lab.deskSergeant;
  assert.ok(d.auc > s.auc + 0.1, `detective ${d.auc} against sergeant ${s.auc}`);
  assert.ok(d.wrongMen / (d.wrongMen + d.cleared) < 0.06, 'few wrong men');
  assert.ok(d.caught / (d.caught + d.gotAway) > 0.6, 'catches most of the ring');
  assert.ok(s.wrongMen > 3 * d.wrongMen, 'the busy-body rule names many honest regulars');
});
