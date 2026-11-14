// Scripted players for Find the ring. Each plays through the office's plays, with the same desk
// calls the lab uses, so a full round runs in a test with no sessions.
import { detective, deskSergeant } from './investigators.js';
import { IDS } from './night.js';

// The desk, through plays. A refused play comes back as "Error: ...", and that is thrown here.
export function remoteDesk(play) {
  const call = async (kind, args) => {
    const text = await play(kind, args);
    if (text.startsWith('Error:')) throw new Error(text);
    return JSON.parse(text);
  };
  return {
    summary: () => call('summary', {}),
    records: async (args = {}) => (await call('records', args)).records,
    read: (record, because) => call('read', { record, because }),
    tail: (regular) => call('tail', { regular }),
    ban: (regular, because) => call('ban', { regular, because }),
    clear: (regular) => call('clear', { regular }),
    handIn: (scores) => call('handin', { scores }),
  };
}

export const detectivePlayer = () => async (brief, play) => { await detective(remoteDesk(play)); };
export const sergeantPlayer = () => async (brief, play) => { await deskSergeant(remoteDesk(play)); };

// A seat that reads the summary, bans nobody and hands in zeros, to test the "no ring" call.
export function quietPlayer() {
  return async (brief, play) => {
    await play('summary');
    await play('handin', { scores: Object.fromEntries(IDS.map((id) => [id, 0])) });
  };
}

export const players = (seat, i) => [detectivePlayer, sergeantPlayer, quietPlayer][i % 3]();
