// Copied from the island repo (test/secrets.test.js). The secret check covers this repo too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { checkLine, tracked } = require('../.githooks/check-secrets.cjs');

test('no tracked file holds a key or password', () => {
  assert.deepEqual(tracked(fileURLToPath(new URL('..', import.meta.url))), []);
});

test('the check finds an Anthropic key and passes reading one from the environment', () => {
  // Built from parts so this file does not trip the check itself.
  assert.equal(checkLine(`ANTHROPIC_API_KEY=${'sk-'}ant-api03-${'a'.repeat(40)}`), 'an Anthropic or OpenAI key');
  assert.equal(checkLine('const apiKey = process.env.ANTHROPIC_API_KEY;'), null);
});
