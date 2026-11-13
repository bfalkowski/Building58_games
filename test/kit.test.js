// The kit: the runner keeps truth out of messages, the store seals truth where only its owner reads
// it, and the conformance check catches a manifest the office would refuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGame } from '../kit/harness.js';
import { seal, sealedRounds } from '../kit/sealed.js';
import { manifestProblems } from '../kit/conformance.js';
import { stream } from '../kit/rng.js';

const RUNNER = fileURLToPath(new URL('../kit/runner.js', import.meta.url));
const temp = (t, name) => { const d = mkdtempSync(join(tmpdir(), name)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

// A made-up game whose brief or answer holds one of its own truth words.
function leakyGame(t, where) {
  const dir = temp(t, 'leaky-game-');
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'game.json'), JSON.stringify({ name: 'Leaky', version: '0.0.1', api: 1, entry: 'game.js', players: { min: 1, max: 2 }, needs: [] }));
  writeFileSync(join(dir, 'game.js'), `import { run } from ${JSON.stringify(RUNNER)};
run({
  name: 'Leaky', folder: 'leaky', kinds: ['ask'],
  setup: ({ seats }) => ({ briefs: Object.fromEntries(seats.map((s) => [s, ${where === 'brief' ? "'Psst: SECRET-WORD'" : "'Hello.'"}])), state: {}, truth: { who: 'SECRET-WORD' }, words: ['SECRET-WORD'] }),
  action: () => ${where === 'answer' ? "'It is \"SECRET-WORD\".'" : "'ok'"},
  finish: () => ({ score: { metrics: {}, seats: {} }, reveal: 'SECRET-WORD' }),
});\n`);
  return dir;
}

for (const where of ['brief', 'answer']) {
  test(`the runner stops a game whose ${where} holds a truth word, and sends nothing of it`, async (t) => {
    const g = startGame(leakyGame(t, where), { env: { GAMES_HOME: temp(t, 'games-home-') } });
    g.send({ type: 'hello', api: 1 });
    g.send({ type: 'setup', seed: 'seed-leak-1', settings: {}, seats: ['S1'] });
    if (where === 'answer') { await g.next((m) => m.type === 'ready', 'ready'); g.send({ type: 'action', id: 'a1', seat: 'S1', kind: 'ask', args: {} }); }
    assert.equal(await g.exited, 3);
    assert.ok(!g.sent.some((m) => JSON.stringify(m).includes('SECRET-WORD')), JSON.stringify(g.sent));
    assert.match(g.stderr(), /held back a (brief|answer)/);
  });
}

test('the reveal may hold the truth, after done', async (t) => {
  const g = startGame(leakyGame(t, 'none'), { env: { GAMES_HOME: temp(t, 'games-home-') } });
  g.send({ type: 'hello', api: 1 });
  g.send({ type: 'setup', seed: 'seed-leak-2', settings: {}, seats: ['S1'] });
  await g.next((m) => m.type === 'ready', 'ready');
  g.send({ type: 'finish' });
  assert.equal((await g.next((m) => m.type === 'done', 'done')).reveal, 'SECRET-WORD');
  g.child.stdin.end();
  assert.equal(await g.exited, 0);
});

test('the store seals truth in folders only its owner reads, with a canary and the seed as truth words', (t) => {
  const home = temp(t, 'games-home-');
  process.env.GAMES_HOME = home;
  try {
    const s = seal('some-game', { seed: 'a-long-seed', settings: {}, seats: ['S1'], truth: { x: 1 }, words: ['W1'] });
    assert.equal(statSync(s.dir).mode & 0o777, 0o700);
    assert.equal(statSync(join(s.dir, 'truth.json')).mode & 0o777, 0o600);
    const [r] = sealedRounds('some-game', home);
    assert.ok(r.canary.startsWith('canary-'));
    assert.deepEqual(r.words, [r.canary, 'a-long-seed', 'W1']);
    const short = seal('some-game', { seed: 'x1', settings: {}, seats: [], truth: {}, words: [] });
    assert.equal(short.words.length, 1, 'a short seed is not a truth word, since it would match ordinary text');
  } finally { delete process.env.GAMES_HOME; }
});

test('the conformance check refuses what the office loader would refuse', (t) => {
  const dir = temp(t, 'bad-manifest-');
  const write = (m) => writeFileSync(join(dir, 'game.json'), JSON.stringify(m));
  writeFileSync(join(dir, 'game.js'), '');
  const good = { name: 'X', version: '0.0.1', api: 1, entry: 'game.js', players: { min: 1, max: 2 }, needs: ['ask'] };
  write(good);
  assert.deepEqual(manifestProblems(dir), []);
  write({ ...good, api: 2 }); assert.match(manifestProblems(dir).join(), /API 2/);
  write({ ...good, entry: '../x.js' }); assert.match(manifestProblems(dir).join(), /own folder/);
  write({ ...good, players: { min: 3, max: 2 } }); assert.match(manifestProblems(dir).join(), /min and max/);
  write({ ...good, needs: ['votes'] }); assert.match(manifestProblems(dir).join(), /cannot do yet/);
  write({ ...good, needs: ['magic'] }); assert.match(manifestProblems(dir).join(), /not a need/);
});

test('the same seed and stream name give the same draws', () => {
  const a = stream('s', 'x'); const b = stream('s', 'x'); const c = stream('s', 'y');
  const take = (r) => Array.from({ length: 5 }, () => r());
  assert.deepEqual(take(a), take(b));
  assert.notDeepEqual(take(stream('s', 'x')), take(c));
});
