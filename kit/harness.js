// The scripted-player harness. It drives a game's process through the protocol the way the office
// does, with scripted players in place of sessions, so a full round runs in a test with no sessions
// and no model calls.
//
// A player is an async function (brief, play) that calls play(kind, args) and gets the game's answer
// text back. players(seat, index) picks the player for each seat.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const WAIT_MS = 15000;

// Starts a game's process. Returns send, next (the next message the game sends that matches) and
// the list of every message it sent.
export function startGame(folder, { env = {} } = {}) {
  const dir = resolve(folder);
  const manifest = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
  const child = spawn(process.execPath, [join(dir, manifest.entry)], { cwd: dir, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const sent = [];
  const waiting = [];
  const taken = new WeakSet();  // messages a next() has already handed out
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    let m;
    try { m = JSON.parse(line); } catch { m = { type: 'not-json', line }; }
    sent.push(m);
    const i = waiting.findIndex((w) => w.match(m) && !taken.has(m));
    if (i >= 0) waiting.splice(i, 1)[0].resolve(m);
  });
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  const next = (match, what) => {
    const old = sent.find((m) => !taken.has(m) && match(m));
    if (old) { taken.add(old); return Promise.resolve(old); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The game did not send ${what} in time. Its errors: ${stderr.trim() || 'none'}`)), WAIT_MS);
      waiting.push({ match, resolve: (m) => { clearTimeout(timer); taken.add(m); resolve(m); } });
      exited.then((code) => { clearTimeout(timer); reject(new Error(`The game exited with code ${code} before it sent ${what}. Its errors: ${stderr.trim() || 'none'}`)); });
    });
  };
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  return { manifest, child, send, next, sent, exited, stderr: () => stderr };
}

// Plays one round from hello to done. Returns the briefs, every play with its answer, done, the
// messages sent before done, and the exit code.
export async function playRound(dir, { seed, settings = {}, seats = ['S1'], players, env = {} }) {
  const g = startGame(dir, { env });
  try {
    g.send({ type: 'hello', api: 1 });
    await g.next((m) => m.type === 'hello', 'hello');
    g.send({ type: 'setup', seed, settings, seats });
    await g.next((m) => m.type === 'ready', 'ready');
    const briefs = Object.fromEntries(g.sent.filter((m) => m.type === 'brief').map((m) => [m.seat, m.text]));
    const plays = [];
    let n = 0;
    for (const [i, seat] of seats.entries()) {
      const play = async (kind, args = {}) => {
        const id = `a${++n}`;
        g.send({ type: 'action', id, seat, kind, args });
        const m = await g.next((x) => x.type === 'answer' && x.id === id, `the answer to ${kind}`);
        plays.push({ seat, kind, args, text: m.text });
        return m.text;
      };
      await players(seat, i)(briefs[seat], play);
    }
    const before = g.sent.slice();
    g.send({ type: 'finish' });
    const done = await g.next((m) => m.type === 'done', 'done');
    g.child.stdin.end();
    const code = await g.exited;
    return { briefs, plays, done, before, code, stderr: g.stderr() };
  } finally {
    if (g.child.exitCode === null) g.child.kill();
  }
}
