// The JSON-lines runner. It speaks API 1 of the office's game protocol (docs/protocol.md) for a game,
// so a game only writes its rules:
//
//   setup({ seed, settings, seats }) -> { briefs: { S1: text, ... }, state, truth, words }
//   action(state, { seat, kind, args }) -> text, or { text, spendUsd }
//   finish(state) -> { score: { metrics, seats }, reveal }
//   kinds: the list of action kinds, for the answer to an unknown kind
//
// The runner seals truth and words in the sealed store, sends hello, the briefs, ready, the answers
// and done, and exits on abort or when its input ends. It never sends a message that holds a truth
// word before done: such a game stops with exit code 3, and the office ends the round.

import { createInterface } from 'node:readline';
import { seal, record } from './sealed.js';

export const API = 1;

export function run(game, { input = process.stdin, output = process.stdout, exit = (code) => process.exit(code) } = {}) {
  let round = null;  // { state, sealed }
  let done = false;
  const write = (m) => output.write(`${JSON.stringify(m)}\n`);
  const guarded = (m) => {
    const line = JSON.stringify(m);
    // The text as sent, and as the seat reads it, since quotes inside a text are escaped in the line.
    const hay = typeof m.text === 'string' ? `${line}\n${m.text}` : line;
    if (!done && round && round.sealed.words.some((w) => hay.includes(w))) {
      process.stderr.write(`${game.name}: held back a ${m.type} that held a truth word, and stopped.\n`);
      exit(3);
      return false;
    }
    output.write(`${line}\n`);
    return true;
  };

  const handle = async (m) => {
    if (m.type === 'hello') return write({ type: 'hello', api: API });
    if (m.type === 'abort') return exit(0);
    if (m.type === 'setup') {
      if (round) return;
      const seats = Array.isArray(m.seats) ? m.seats.map(String) : [];
      const out = await game.setup({ seed: String(m.seed), settings: m.settings && typeof m.settings === 'object' ? m.settings : {}, seats });
      const sealed = seal(game.folder, { seed: m.seed, settings: m.settings, seats, truth: out.truth, words: out.words });
      round = { state: out.state, sealed };
      for (const seat of seats) if (!guarded({ type: 'brief', seat, text: out.briefs[seat] })) return;
      return guarded({ type: 'ready' });
    }
    if (m.type === 'action') {
      let text, spendUsd = 0;
      if (!round || done) text = 'Error: the round is not running.';
      else if (!game.kinds.includes(m.kind)) text = `Error: there is no kind ${m.kind}. The kinds are ${game.kinds.join(', ')}.`;
      else {
        try {
          const out = await game.action(round.state, { seat: String(m.seat), kind: m.kind, args: m.args && typeof m.args === 'object' ? m.args : {} });
          if (out && typeof out === 'object') ({ text, spendUsd = 0 } = out); else text = out;
        } catch (e) {
          text = `Error: ${e.message}`;
        }
      }
      if (spendUsd > 0 && !guarded({ type: 'spend', usd: spendUsd })) return;
      return guarded({ type: 'answer', id: m.id, text: String(text) });
    }
    if (m.type === 'finish') {
      if (!round || done) return;
      const { score, reveal } = await game.finish(round.state);
      done = true;
      record(round.sealed, 'result', { score, reveal });
      return write({ type: 'done', score, reveal });
    }
  };

  // One message at a time, in order, so answers come back in the order the office asked.
  let queue = Promise.resolve();
  const lines = createInterface({ input });
  lines.on('line', (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (!m || typeof m !== 'object') return;
    queue = queue.then(() => handle(m)).catch((e) => {
      process.stderr.write(`${game.name}: ${e.stack || e.message}\n`);
      exit(1);
    });
  });
  // Exit once what was written has gone out, since a pipe may still hold the last lines.
  lines.on('close', () => { queue.then(() => output.write('', () => exit(0))); });
}
