// The sealed store. A game keeps its truth here, outside the repo, and never in a message before done.
// Each round gets its own folder: <home>/<game>/<round>/, where home is GAMES_HOME or ~/.games.
// Folders are 0700 and files 0600, so only the person who runs the game can read them.
//
// Each round's truth gets a canary: a random word that only the truth file holds. The runner refuses
// to send any message that holds a truth word, the canary included, so a game that dumps its truth by
// mistake stops instead of showing it.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export function gamesHome() {
  return process.env.GAMES_HOME || join(homedir(), '.games');
}

// A seed shorter than this is not checked as a truth word, since it would match ordinary text.
const MIN_WORD = 6;

// Seals one round. words are the game's own truth words. Returns the round's id, folder and every
// truth word to keep out of messages.
export function seal(game, { seed, settings, seats, truth, words = [] }) {
  const id = randomBytes(6).toString('hex');
  const dir = join(gamesHome(), game, id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const canary = `canary-${randomBytes(8).toString('hex')}`;
  const all = [canary, ...(String(seed).length >= MIN_WORD ? [String(seed)] : []), ...words].filter((w) => typeof w === 'string' && w.length);
  writeFileSync(join(dir, 'truth.json'), `${JSON.stringify({ game, round: id, seed: String(seed), settings, seats, canary, words: all, truth }, null, 2)}\n`, { mode: 0o600 });
  return { id, dir, words: all };
}

// Adds a record to a sealed round, such as the answers and the score at the end.
export function record(sealed, name, data) {
  writeFileSync(join(sealed.dir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

// Every sealed round of a game under home, for tests and the conformance check.
export function sealedRounds(game, home = gamesHome()) {
  const dir = join(home, game);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((id) => existsSync(join(dir, id, 'truth.json')))
    .map((id) => ({ id, dir: join(dir, id), ...JSON.parse(readFileSync(join(dir, id, 'truth.json'), 'utf8')) }));
}

// A local secret, created once in the games home. A game uses it to key ids that must not lead
// back to a seed.
let cached;
export function secret() {
  if (process.env.GAMES_SECRET) return process.env.GAMES_SECRET;
  if (cached) return cached;
  const home = gamesHome();
  const file = join(home, 'secret');
  if (!existsSync(file)) {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    writeFileSync(file, randomBytes(16).toString('hex'), { mode: 0o600 });
  }
  cached = readFileSync(file, 'utf8').trim();
  return cached;
}

export function randomSeed() {
  return randomBytes(8).toString('hex');
}
