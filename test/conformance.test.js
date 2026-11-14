// Every game in the repo passes the conformance check before the office runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relative } from 'node:path';
import { conform, gameFolders, ROOT } from '../kit/conformance.js';

const games = gameFolders();

test('the repo has the version 1 games', () => {
  assert.deepEqual(games.map((d) => relative(ROOT, d)), ['find-the-ring', 'listing-review', 'planted-note']);
});

for (const dir of games) {
  test(`${relative(ROOT, dir)} passes the conformance check`, async () => {
    assert.deepEqual(await conform(dir), []);
  });
}
