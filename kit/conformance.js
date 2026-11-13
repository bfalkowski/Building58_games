#!/usr/bin/env node
// The conformance check. Every folder in this repo with a game.json must pass it before the office
// runs that game. It checks:
//   1. the manifest, as the office's loader reads it (API 1, an entry file in the folder, whole
//      player counts, needs the loader can meet)
//   2. hello, setup, a brief for every seat, then ready
//   3. no message before done holds a truth word (the sealed truth's words, its canary and its seed)
//   4. the same seed and settings give the same briefs and the same answers
//   5. done has the shared score shape: { score: { metrics, seats }, reveal }, with a result for
//      every seat
//   6. an unknown kind gets an answer, not a crash, and abort ends the process with code 0
//   7. the truth is sealed outside the repo, in folders only its owner can read
//
// Usage: node kit/conformance.js [folder ...]   with no folder, every game in the repo.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { playRound, startGame } from './harness.js';
import { sealedRounds } from './sealed.js';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// What the office's loader can do today (Building58 relay/games.js: NEEDS and CAN).
export const LOADER_NEEDS = ['privateBriefs', 'ask', 'files', 'transcript', 'chat', 'phases', 'votes', 'turns', 'sandboxRepo', 'personSeat', 'gameMaster'];
export const LOADER_CAN = ['privateBriefs', 'ask', 'files'];

export function gameFolders(root = ROOT) {
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'game.json')))
    .map((d) => join(root, d.name)).sort();
}

// The same checks as the loader's, so a game that passes here is listed as ok in the office.
export function manifestProblems(dir) {
  let g;
  try { g = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')); } catch (e) { return [`game.json is not valid JSON: ${e.message}`]; }
  const out = [];
  if (typeof g.name !== 'string' || !g.name.trim()) out.push('it has no name');
  if (typeof g.version !== 'string') out.push('it has no version');
  if (g.api !== 1) out.push(`it asks for API ${g.api}, and the loader knows API 1`);
  if (typeof g.entry !== 'string' || !g.entry || isAbsolute(g.entry) || g.entry.split(/[\\/]/).includes('..')) out.push('its entry must be a file in its own folder');
  else if (!existsSync(join(dir, g.entry))) out.push(`its entry file ${g.entry} is missing`);
  const p = g.players || {};
  if (!Number.isInteger(p.min) || !Number.isInteger(p.max) || p.min < 1 || p.max < p.min) out.push('its players need a whole min and max, with min at least 1 and max at least min');
  if (!Array.isArray(g.needs)) out.push('its needs must be a list');
  else for (const n of g.needs) if (!LOADER_NEEDS.includes(n)) out.push(`it needs ${n}, which is not a need`); else if (!LOADER_CAN.includes(n)) out.push(`it needs ${n}, which the loader cannot do yet`);
  return out;
}

const tempHome = () => mkdtempSync(join(tmpdir(), 'games-conformance-'));

export async function conform(dir, { seed = 'conformance-seed-1', settings = {} } = {}) {
  const problems = manifestProblems(dir);
  if (problems.length) return problems;
  const manifest = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
  const { players } = await import(pathToFileURL(join(dir, 'players.js')).href);
  if (typeof players !== 'function') return ['players.js must export players(seat, index), the scripted players'];
  const n = Math.min(manifest.players.max, Math.max(manifest.players.min, 2));
  const seats = Array.from({ length: n }, (_, i) => `S${i + 1}`);

  const homes = [tempHome(), tempHome()];
  try {
    const rounds = [];
    for (const home of homes) {
      try {
        rounds.push(await playRound(dir, { seed, settings, seats, players, env: { GAMES_HOME: home } }));
      } catch (e) {
        return [...problems, `a round did not run: ${e.message}`];
      }
    }
    const [a, b] = rounds;

    for (const seat of seats) if (typeof a.briefs[seat] !== 'string' || !a.briefs[seat]) problems.push(`seat ${seat} got no brief`);
    if (a.code !== 0) problems.push(`the game exited with code ${a.code} after done`);

    // Truth words
    const sealed = sealedRounds(manifestFolder(dir), homes[0]);
    if (sealed.length !== 1) problems.push(`expected one sealed round in the games home, found ${sealed.length}`);
    for (const s of sealed) {
      if (!s.words.includes(s.canary)) problems.push('the canary is not a truth word');
      const before = a.before.map((m) => `${JSON.stringify(m)}\n${typeof m.text === 'string' ? m.text : ''}`).join('\n');
      for (const w of s.words) if (before.includes(w)) problems.push(`a message before done holds the truth word ${w.slice(0, 12)}...`);
      const mode = (p) => statSync(p).mode & 0o777;
      if (mode(s.dir) !== 0o700) problems.push(`the sealed folder is ${mode(s.dir).toString(8)}, not 700`);
      if (mode(join(s.dir, 'truth.json')) !== 0o600) problems.push(`truth.json is ${mode(join(s.dir, 'truth.json')).toString(8)}, not 600`);
      if (!relative(ROOT, s.dir).startsWith('..')) problems.push('the truth is sealed inside the repo');
    }

    // The same seed gives the same round
    if (JSON.stringify(a.briefs) !== JSON.stringify(b.briefs)) problems.push('the same seed and settings gave different briefs');
    if (JSON.stringify(a.plays) !== JSON.stringify(b.plays)) problems.push('the same seed and settings gave different answers');
    if (JSON.stringify(a.done) !== JSON.stringify(b.done)) problems.push('the same seed and settings gave a different score');

    // Score shape
    const sc = a.done.score;
    if (!sc || typeof sc !== 'object' || !sc.metrics || typeof sc.metrics !== 'object') problems.push('done has no score.metrics');
    else for (const [k, v] of Object.entries(sc.metrics)) if (v !== null && typeof v !== 'number') problems.push(`metric ${k} is not a number or null`);
    if (!sc || !sc.seats || JSON.stringify(Object.keys(sc.seats).sort()) !== JSON.stringify(seats.slice().sort())) problems.push('done has no result for each seat, or results for seats that are not in the round');
    if (!('reveal' in a.done)) problems.push('done has no reveal');
    if (!a.plays.length) problems.push('the scripted players made no plays');

    // Unknown kind and abort
    const g = startGame(dir, { env: { GAMES_HOME: homes[1] } });
    try {
      g.send({ type: 'hello', api: 1 });
      await g.next((m) => m.type === 'hello', 'hello');
      g.send({ type: 'setup', seed: 'conformance-abort', settings, seats });
      await g.next((m) => m.type === 'ready', 'ready');
      g.send({ type: 'action', id: 'x1', seat: 'S1', kind: 'no-such-kind', args: {} });
      const ans = await g.next((m) => m.type === 'answer' && m.id === 'x1', 'an answer to an unknown kind');
      if (!/^Error:/.test(ans.text)) problems.push('an unknown kind did not get an error answer');
      g.send({ type: 'abort' });
      const code = await Promise.race([g.exited, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
      if (code !== 0) problems.push(`abort did not end the process with code 0 (got ${code})`);
    } catch (e) {
      problems.push(e.message);
    } finally {
      if (g.child.exitCode === null) g.child.kill();
    }
    return problems;
  } finally {
    for (const h of homes) rmSync(h, { recursive: true, force: true });
  }
}

// The name the runner seals under: the game's folder name.
function manifestFolder(dir) {
  return resolve(dir).split(/[\\/]/).pop();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.length > 2 ? process.argv.slice(2).map((d) => resolve(d)) : gameFolders();
  let bad = 0;
  for (const dir of dirs) {
    const problems = await conform(dir);
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${relative(ROOT, dir)}`);
    for (const p of problems) console.log(`     ${p}`);
    if (problems.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
