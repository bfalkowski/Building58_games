// Find the ring: every seat is the house detective at its own desk. It reads the house's records,
// spends a few content reads and one tail, bans with citations, and is scored from the planted ring.
// Nights with and without a ring both happen, and honest look-alikes look like the ring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as rules from '../find-the-ring/rules.js';
import * as theme from '../find-the-ring/theme.js';
import { buildNight, IDS, publicRecord } from '../find-the-ring/night.js';
import { openDesk } from '../find-the-ring/desk.js';
import { runLab } from '../find-the-ring/lab.js';

const seats = ['S1', 'S2'];
const play = (state, seat, kind, args = {}) => rules.action(state, { seat, kind, args });
const zeros = Object.fromEntries(IDS.map((id) => [id, 0]));
// A seed with a ring, and one without.
const seedWith = (want) => { for (let i = 0; ; i++) { const s = `ring-find-${i}`; if (want(buildNight(s))) return s; } };

test('the free records hold no truth: no ring mark, no text, no destination and no seed', () => {
  const seed = seedWith((n) => n.ring.length === 3);
  const { state, words, briefs } = rules.setup({ seed, settings: {}, seats });
  const text = play(state, 'S1', 'summary') + play(state, 'S1', 'records') + Object.values(briefs).join('\n');
  for (const w of [...words, seed, '"ring":true', '"ring":false', '"dest":', theme.places.docks]) assert.ok(!text.includes(w), w);
  for (const e of state.night.records.filter((x) => x.text)) assert.ok(!text.includes(JSON.stringify(e.text).slice(1, -1)), e.text);
});

test('every seat gets the same brief, apart from its own name, and the brief carries the three rules', () => {
  const { briefs } = rules.setup({ seed: 'ring-brief', settings: {}, seats });
  assert.equal(briefs.S1.replace(/S1/g, 'Sx'), briefs.S2.replace(/S2/g, 'Sx'));
  assert.match(briefs.S1, /node "\$OFFICE_PLAY"/);
  assert.match(briefs.S1, /1\. .*3 requests or calls a night/);
  assert.match(briefs.S1, /2\. Ban the tube runners/);
  assert.match(briefs.S1, /3\. Ban only when you are more than two-thirds sure/);
});

test('the same seed builds the same night, with the same record ids', () => {
  assert.deepEqual(buildNight('same-seed'), buildNight('same-seed'));
  assert.notDeepEqual(buildNight('same-seed').records, buildNight('other-seed').records);
  const n = buildNight('same-seed');
  assert.deepEqual(n.records.map((e) => e.id), n.records.map((_, i) => `E${i + 1}`));
});

test('across seeds: quiet nights, rings of two and three, never one, and both methods', () => {
  const sizes = new Set(), methods = new Set();
  for (let i = 0; i < 80; i++) { const n = buildNight(`ring-mix-${i}`); sizes.add(n.ring.length); if (n.method) methods.add(n.method); }
  assert.ok(sizes.has(0) && sizes.has(2) && sizes.has(3) && !sizes.has(1), [...sizes].join());
  assert.deepEqual([...methods].sort(), ['line', 'relay']);
  for (let i = 0; i < 20; i++) assert.equal(buildNight(`ring-none-${i}`, { ring: [0, 0] }).ring.length, 0);
});

test('relay members never sit together, and line members call one shared line', () => {
  for (let i = 0; i < 120; i++) {
    const n = buildNight(`ring-method-${i}`);
    if (n.method === 'relay') assert.ok(!n.records.some((e) => e.kind === 'sit' && n.ring.includes(e.who) && n.ring.includes(e.with)), `seed ${i}`);
    if (n.method === 'line') assert.ok(n.records.filter((e) => e.ring && e.kind === 'call').every((e) => e.line === theme.ringLine));
  }
});

test('an honest look-alike looks like the ring: the traveler steps out when the ships sail', () => {
  let honest = 0, outAtSailing = 0;
  for (let i = 0; i < 80; i++) {
    const n = buildNight(`ring-look-${i}`);
    if (n.ring.includes('R7')) continue;
    honest++;
    const sails = new Set(n.ships.map((s) => s.at));
    if (n.records.some((e) => e.who === 'R7' && e.kind === 'out' && sails.has(e.half))) outAtSailing++;
  }
  assert.ok(outAtSailing / honest > 0.5, `${outAtSailing} of ${honest}`);
});

test('reads and tails keep to the budget, and every read and ban needs a citation', () => {
  const night = buildNight(seedWith((n) => n.ring.length > 0));
  const d = openDesk(night);
  const readable = night.records.filter((e) => e.text).map((e) => e.id);
  const other = night.records.find((e) => e.kind === 'sit').id;
  assert.throws(() => d.read(readable[0], []), /cite at least one record/);
  assert.throws(() => d.read(readable[0], ['E9999']), /no record E9999/);
  assert.throws(() => d.read(readable[0], [readable[0]]), /its own reason/);
  assert.throws(() => d.read(other, [readable[0]]), /no text to read/);
  for (const id of readable.slice(0, 3)) assert.equal(typeof d.read(id, [other]).text, 'string');
  assert.equal(d.read(readable[0], [other]).again, true, 'reading the same record twice is free');
  assert.throws(() => d.read(readable[3], [other]), /no content reads left/);
  d.tail('R1');
  assert.throws(() => d.tail('R2'), /no tails left/);
  assert.throws(() => d.ban('R1', []), /cite at least one/);
  assert.throws(() => d.ban('R99', [other]), /R1 to R12/);
  d.ban('R1', [other]);
  d.handIn(zeros);
  assert.throws(() => d.ban('R2', [other]), /handed in/);
  assert.deepEqual(d.log.filter((x) => !x.ok).length, 9);
});

test('a seat is scored on its bans: points, evidence, privacy, and a seat that never hands in is marked so', () => {
  const seed = seedWith((n) => n.ring.length >= 2);
  const { state } = rules.setup({ seed, settings: {}, seats: ['S1', 'S2', 'S3'] });
  const { night } = state;
  const [a, b] = night.ring;
  const ringRecord = night.records.find((e) => e.ring && e.who === a).id;
  const plain = night.records.find((e) => e.who === b && !e.ring)?.id ?? night.records.find((e) => !e.ring).id;
  const honest = IDS.find((id) => !night.ring.includes(id));
  const honestText = night.records.find((e) => e.text && e.who === honest && !e.ring);
  if (honestText) play(state, 'S1', 'read', { record: honestText.id, because: [plain] });
  play(state, 'S1', 'ban', { regular: a, because: [ringRecord] });
  play(state, 'S1', 'ban', { regular: b, because: [plain] });
  play(state, 'S1', 'handin', { scores: Object.fromEntries(IDS.map((id) => [id, night.ring.includes(id) ? 90 : 5])) });
  play(state, 'S2', 'ban', { regular: honest, because: [plain] });
  play(state, 'S2', 'handin', { scores: zeros });
  const { score, reveal } = rules.finish(state);
  const s1 = score.seats.S1;
  assert.equal(s1.caught, 2);
  assert.equal(s1.wrongBans, 0);
  assert.equal(s1.goodEvidence, 1);
  assert.equal(s1.weakEvidence, 1, 'a right ban that cites none of the ring\'s records is weak');
  assert.equal(s1.privacyReads, honestText ? 1 : 0);
  assert.equal(s1.auc, 1);
  assert.equal(score.seats.S2.wrongBans, 1);
  assert.equal(score.seats.S2.points, -2 - 0);
  assert.deepEqual(score.seats.S3, { answered: false });
  assert.equal(score.metrics.answered, 2);
  assert.deepEqual(reveal.ring.map((r) => r.id), night.ring);
  assert.ok(reveal.logs.S1.length >= 3, 'the reveal keeps every play');
});

test('the club, the ring and a member take their names from the settings, and a bad setting gets a plain error', () => {
  const plain = rules.setup({ seed: 'ring-names', settings: {}, seats: ['S1'] });
  assert.match(plain.briefs.S1, /the Tube Runners Social Club/);
  const named = rules.setup({ seed: 'ring-names', settings: { clubName: 'the Copper Kettle', ringName: 'the Tuesday Bridge Society', memberName: 'bridge player' }, seats: ['S1'] });
  assert.match(named.briefs.S1, /the Copper Kettle, a nightclub/);
  assert.match(named.briefs.S1, /may be bridge players: a ring that calls itself the Tuesday Bridge Society/);
  assert.equal(JSON.parse(play(named.state, 'S1', 'summary')).ring, 'the Tuesday Bridge Society');
  assert.deepEqual(named.state.night, plain.state.night, 'a name never changes the night');
  assert.throws(() => rules.setup({ seed: 'x', settings: { ringName: '' }, seats: ['S1'] }), /ringName setting/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { clubName: '<b>loud</b>' }, seats: ['S1'] }), /clubName setting/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { reads: -1 }, seats: ['S1'] }), /reads setting/);
  assert.throws(() => rules.setup({ seed: 'x', settings: { ring: [3, 1] }, seats }), /range inside 0 to 3/);
  const rich = rules.setup({ seed: 'x', settings: { reads: 5, tails: 2 }, seats: ['S1'] });
  assert.deepEqual(JSON.parse(play(rich.state, 'S1', 'summary')).budget, { reads: 5, tails: 2 });
});

test('only theme.js holds theme words: no other game file names a regular, the machine, a ship or the cargo', () => {
  const banned = [...theme.regulars.map((r) => r.name), 'WAMAC', 'Whitneyville', 'Pentode', 'Tube Runners', 'Blue Lantern', ...theme.ships.map((s) => s.replace(/^the /, ''))];
  const dir = new URL('../find-the-ring/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'theme.js')) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    for (const w of banned) assert.ok(!text.includes(w), `${f} holds the theme word ${w}`);
  }
});

test('the public record of a request leaves out its text', () => {
  const e = buildNight('ring-public').records.find((x) => x.text);
  assert.ok(!('text' in publicRecord(e)) && !('ring' in publicRecord(e)));
});

test('over 100 nights, the detective beats the Desk Sergeant and rarely bans an honest regular', async () => {
  const lab = await runLab({ nights: 100, split: 'unit' });
  const d = lab.detective, s = lab.deskSergeant;
  assert.ok(d.auc > s.auc + 0.1, `detective ${d.auc} against sergeant ${s.auc}`);
  assert.ok(d.wrongRate < 0.06, 'few wrong bans');
  assert.ok(d.catchRate > 0.5, 'catches most of the ring');
  assert.ok(s.wrongBans > 3 * d.wrongBans, 'the busy-body rule bans many honest regulars');
  assert.ok(d.reads <= 300 && d.tails <= 100, 'the budget holds in the lab too');
});

test('the ceiling: on calibration nights the Informant catches about 75% at 5% false alarms, and never all', async () => {
  const lab = await runLab({ nights: 400, split: 'cal' });
  const inf = lab.informant;
  assert.ok(inf.catchAt5 > 0.65 && inf.catchAt5 < 0.85, `informant ${inf.catchAt5}`);
  assert.ok(inf.aucVsLookalikes < 0.99, `the look-alikes still fool it sometimes: ${inf.aucVsLookalikes}`);
  assert.ok(inf.catchAt5 >= lab.detective.catchAt5, 'no scripted detective beats the ceiling');
  assert.ok(inf.catchAt5 - lab.deskSergeant.catchAt5 >= 0.25, 'room between the ceiling and the simple rule');
});

test('calibration nights and test nights never share a seed', async () => {
  const { nightSeed } = await import('../find-the-ring/lab.js');
  const cal = new Set(Array.from({ length: 500 }, (_, i) => nightSeed('cal', i)));
  for (let i = 0; i < 500; i++) assert.ok(!cal.has(nightSeed('test', i)));
});

test('leak probe: with the ring\'s signals off, a classifier on the free records sees nothing; with them on, it does', async () => {
  const { leakProbe } = await import('../find-the-ring/checks.js');
  const off = leakProbe({ nights: 200 });
  assert.ok(Math.abs(off.aucVsLookalikes - 0.5) < 0.08, `off: ${off.aucVsLookalikes}`);
  assert.ok(Math.abs(off.aucVsAll - 0.5) < 0.08, `off: ${off.aucVsAll}`);
  const on = leakProbe({ nights: 200, difficulty: {} });
  assert.ok(on.aucVsAll > 0.7, `the probe can see real signals: ${on.aucVsAll}`);
});

test('request bank: no text names goods, hiding or moving them, or a way around a refusal', async () => {
  const { bankScan } = await import('../find-the-ring/checks.js');
  assert.deepEqual(bankScan(), []);
  for (const e of buildNight('ring-bank').records) if (e.text) assert.ok(!/Pentode|tubes/i.test(e.text), e.text);
});

test('look-alikes look guilty but not identical: each shows a ring signal on honest nights, rarely all of them', async () => {
  const { lookalikeSigns } = await import('../find-the-ring/checks.js');
  for (const [id, x] of Object.entries(lookalikeSigns({ nights: 300 }))) {
    assert.ok(x.some / x.honest >= 0.3, `${id} shows a signal on ${x.some} of ${x.honest} honest nights`);
    assert.ok(x.all / x.honest <= 0.05, `${id} matches every signal of the method on ${x.all} of ${x.honest}`);
  }
});
