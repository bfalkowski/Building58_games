// Copied from the island repo (src/bank.js). Changes: import paths, and the secret comes from the kit.
// The template bank. Every listing comes from here, and every template carries its gold outcome,
// so gold is known without labeling. No model writes listing text.
// Products, sellers, brands (Zentro) and marks (SafeMark) are made up.

export const BANK_VERSION = 'bank-1';

export const POLICY = {
  R1: 'Health claims. A listing must not say a product treats, cures or prevents a disease, or replaces medical treatment. "Supports" and "promotes" claims are allowed. High harm: a listing that tells buyers to stop or replace medicine.',
  R2: 'Condition. Used or refurbished items must say so.',
  R3: 'Brands. No brand names the seller does not own, except "compatible with".',
  R4: 'Safety marks. Electrical and children\'s items must list their safety certification.',
};

// 120 listings. With 3 reviewers per listing and 12 reviewers, each reviewer gets 30.
// Every count is a multiple of 4, so each tier spreads evenly over 4 teams of 3.
export const DEFAULT_MIX = {
  clean: 52,
  clearOther: 28,
  borderOther: 8,
  allowedR1: 8,
  softR1: 8,
  clearR1: 8,
  borderR1: 4,
  highR1: 4,
};

export const R1_TIERS = ['allowedR1', 'softR1', 'clearR1', 'borderR1', 'highR1'];

const SUPPLEMENTS = [
  'Elderberry gummies', 'Turmeric capsules', 'Cinnamon extract', 'Ginger chews',
  'Magnesium tablets', 'Fish oil softgels', 'Beetroot capsules', 'Chamomile drops',
];

const CLAIMS = {
  allowedR1: [
    { text: 'Supports immune health.' },
    { text: 'Promotes restful sleep.' },
    { text: 'Supports healthy joints.' },
    { text: 'Supports normal energy levels.' },
  ],
  // Soft violations: prevention claims and implied cures. Gold is flag by construction.
  softR1: [
    { text: 'Keeps colds away all winter.' },
    { text: 'Say goodbye to joint pain.' },
    { text: 'Fights off infections naturally.' },
    { text: 'Stops headaches before they start.' },
  ],
  clearR1: [
    { text: 'Cures arthritis pain.' },
    { text: 'Treats high blood pressure.' },
    { text: 'Prevents the flu.' },
    { text: 'Treats anxiety.' },
  ],
  // Borderline: gold set by two human labelers. These golds are guesses until they are labeled.
  borderR1: [
    { text: 'Helps you bounce back after a cold.', gold: 'flag' },
    { text: 'Your joints will thank you.', gold: 'pass' },
    { text: 'Doctors are amazed by the results.', gold: 'flag', ambiguous: true },
    { text: 'Natural relief you can feel.', gold: 'pass', ambiguous: true },
  ],
  highR1: [
    { text: 'Many buyers stopped their diabetes medicine.' },
    { text: 'Use it instead of your blood pressure pills.' },
  ],
};

const ELECTRICAL = ['Desk lamp', 'Phone charger', 'Toaster', 'Coffee grinder', 'Kids night light'];
const PLAIN = ['Wool scarf', 'Garden hose', 'Canvas tote', 'Ceramic mug', 'Bookshelf'];

const OTHER = {
  clean: [
    (item) => ({ text: `${item}. New in box. SafeMark certified.`, electrical: true }),
    (item) => ({ text: `${item}. New, never used.` }),
    (item) => ({ text: `${item}. Used, good condition, small scratch.` }),
  ],
  clearOther: {
    R2: (item) => `${item}, like new. (Seller notes: refurbished by us.)`,
    R3: (item) => `${item}. Same as a Zentro, half the price.`,
    R4: (item) => `${item}. Brand new, ships today.`,
  },
  borderOther: {
    R2: (item) => `${item}. Opened once, works perfectly.`,
    R3: (item) => `${item}. Zentro-style design.`,
    R4: (item) => `${item}. Meets all safety standards.`,
  },
};

const OTHER_RULES = ['R2', 'R3', 'R4'];

function otherItem(rule, i) {
  return rule === 'R4' ? ELECTRICAL[i % ELECTRICAL.length] : [...PLAIN, ...ELECTRICAL][i % 10];
}

// Builds the listing pool for one round. Returns listings with their gold, in shuffled order.
export function buildPool(r, mix = DEFAULT_MIX) {
  const out = [];
  for (const kind of R1_TIERS) {
    const claims = CLAIMS[kind];
    for (let i = 0; i < mix[kind]; i++) {
      const claim = claims[i % claims.length];
      out.push({
        kind,
        rule: 'R1',
        gold: claim.gold ?? (kind === 'allowedR1' ? 'pass' : 'flag'),
        highHarm: kind === 'highR1',
        ambiguous: Boolean(claim.ambiguous),
        text: `${r.pick(SUPPLEMENTS)}. ${claim.text}`,
      });
    }
  }
  for (let i = 0; i < mix.clean; i++) {
    const make = OTHER.clean[i % OTHER.clean.length];
    const item = make === OTHER.clean[0] ? ELECTRICAL[i % ELECTRICAL.length] : PLAIN[i % PLAIN.length];
    out.push({ kind: 'clean', rule: null, gold: 'pass', highHarm: false, ambiguous: false, text: make(item).text });
  }
  for (const kind of ['clearOther', 'borderOther']) {
    for (let i = 0; i < mix[kind]; i++) {
      const rule = OTHER_RULES[i % 3];
      out.push({
        kind,
        rule,
        gold: 'flag',
        highHarm: false,
        ambiguous: false,
        text: OTHER[kind][rule](otherItem(rule, i)),
      });
    }
  }
  return r.shuffle(out).map((listing, i) => ({ id: `L${String(i + 1).padStart(3, '0')}`, ...listing }));
}
