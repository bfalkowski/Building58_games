// Copied from the island repo (src/rng.js). Every game draws from these streams.
// Seeded random streams. Each part of a round draws from its own stream,
// so changing one knob does not reshuffle the rest.

export function hash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function stream(seed, name) {
  let a = hash(`${seed}:${name}`);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Discard the first outputs: nearby seeds give correlated first draws.
  for (let i = 0; i < 8; i++) next();
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[next.int(list.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = next.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}
