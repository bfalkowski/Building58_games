// Scripted players for Find the ring. Each reads the night through plays, runs a scripted
// investigator on it, and names. Tests use them, so a full round runs with no sessions.
import { detective, deskSergeant } from './investigators.js';

async function readNight(play) {
  const summary = JSON.parse(await play('summary'));
  const events = [];
  for (const [kind, act] of [['phone', 'call'], ['door', 'out'], ['together', 'talk'], ['cards', 'cards']]) {
    for (const e of JSON.parse(await play(kind))[kind]) events.push({ half: e.half, who: e.who, act, ...(e.line ? { line: e.line } : {}), ...(e.with ? { with: e.with } : {}), ...(e.pot ? { pot: e.pot } : {}) });
  }
  return { ships: summary.ships.map((s) => ({ at: s.half, name: s.name })), events };
}

const investigatorPlayer = (investigate) => async (brief, play) => {
  const { scores, ring } = investigate(await readNight(play));
  await play('name', { scores, ring });
};

export const detectivePlayer = () => investigatorPlayer(detective);
export const sergeantPlayer = () => investigatorPlayer(deskSergeant);

// A seat that reads the summary and names nobody, to test the "no ring" call.
export function quietPlayer() {
  return async (brief, play) => {
    const { regulars } = JSON.parse(await play('summary'));
    await play('name', { scores: Object.fromEntries(regulars.map((r) => [r.id, 0])), ring: [] });
  };
}

export const players = (seat, i) => [detectivePlayer, sergeantPlayer, quietPlayer][i % 3]();
