// Copied from the island repo (src/view-tools.js). Changes: import paths, and the secret comes from the kit.
// Helpers that read only the public view. Shared by investigators and the scorer.

export const WORD_RULE = /\b(cure[sd]?|treat[sed]*|prevent[sed]*|medicine|pills)\b/i;

export function wordHits(view) {
  return new Set(view.listings.filter((l) => WORD_RULE.test(l.text)).map((l) => l.id));
}

// Listings that look like R1 items: the word rule hits, or any reviewer cited R1.
export function r1ish(view) {
  const ids = wordHits(view);
  for (const l of view.labels) if (l.rule === 'R1') ids.add(l.listing);
  return ids;
}
