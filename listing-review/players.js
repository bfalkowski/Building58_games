// Scripted players for Listing review: each seat reads the whole public view through plays, runs the
// island's analyst on it, and accuses. Tests use them, so a full round runs with no sessions.
import { analyst } from './lib/investigators.js';
import { ENFORCE } from './rules.js';

export function analystPlayer() {
  return async (brief, play) => {
    const summary = JSON.parse(await play('summary'));
    const reviewers = Object.entries(summary.teams).flatMap(([team, ids]) => ids.map((id) => ({ id, team })));
    const listings = [];
    for (let page = 1; page <= summary.pages; page++) listings.push(...JSON.parse(await play('listings', { page })).listings);
    const labels = [];
    const log = [];
    for (const { id, team } of reviewers) {
      labels.push(...JSON.parse(await play('labels', { reviewer: id })).labels.map((l) => ({ ...l, reviewer: id, team })));
      log.push(...JSON.parse(await play('log', { reviewer: id })).log);
    }
    const view = { id: 'scripted', policy: summary.policy, membershipRate: summary.membershipRate, listings, reviewers, labels, log };
    const { scores } = analyst(view);
    const rounded = Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, Math.round(s)]));
    const named = Object.keys(rounded).filter((id) => rounded[id] >= ENFORCE);
    await play('accuse', { scores: rounded, group: named.length >= 2 ? named : [] });
  };
}

// A seat that reads the summary and then accuses no one, to test the "no group" call.
export function quietPlayer() {
  return async (brief, play) => {
    const summary = JSON.parse(await play('summary'));
    const ids = Object.values(summary.teams).flat();
    await play('accuse', { scores: Object.fromEntries(ids.map((id) => [id, 0])), group: [] });
  };
}

export const players = (seat, i) => (i % 2 === 0 ? analystPlayer() : quietPlayer());
