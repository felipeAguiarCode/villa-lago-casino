import { rankOf, suitOf, type Card } from './cards';

/** 5-card poker categories, weakest first. */
export enum Cat5 {
  High = 0,
  Pair,
  TwoPair,
  Trips,
  Straight,
  Flush,
  FullHouse,
  Quads,
  StraightFlush,
  Royal,
}

export const CAT5_NAME_PT: Record<Cat5, string> = {
  [Cat5.High]: 'Carta alta',
  [Cat5.Pair]: 'Par',
  [Cat5.TwoPair]: 'Dois pares',
  [Cat5.Trips]: 'Trinca',
  [Cat5.Straight]: 'Sequência',
  [Cat5.Flush]: 'Flush',
  [Cat5.FullHouse]: 'Full house',
  [Cat5.Quads]: 'Quadra',
  [Cat5.StraightFlush]: 'Straight flush',
  [Cat5.Royal]: 'Royal flush',
};

export interface Hand5 {
  cat: Cat5;
  /** Comparable score: higher wins. */
  score: number;
  /** Ranks that define the hand, most significant first (for kicker display). */
  ranks: number[];
  /** The 5 cards that made the hand (in eval order). */
  cards: Card[];
}

const B = 15; // rank base (ranks are 2..14)

function pack(cat: number, ranks: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * B + (ranks[i] ?? 0);
  return s;
}

/** Evaluates exactly 5 cards. */
export function eval5(cards: Card[]): Hand5 {
  const counts = new Array<number>(15).fill(0);
  let suitMask0 = suitOf(cards[0]);
  let flush = true;
  for (const c of cards) {
    counts[rankOf(c)]++;
    if (suitOf(c) !== suitMask0) flush = false;
  }
  // ranks grouped by (count desc, rank desc)
  const groups: [number, number][] = [];
  for (let r = 14; r >= 2; r--) if (counts[r]) groups.push([counts[r], r]);
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  let straightHigh = 0;
  if (groups.length === 5) {
    const hi = groups[0][1];
    const lo = groups[4][1];
    // groups sorted by rank desc when all counts are 1
    if (hi - lo === 4) straightHigh = hi;
    else if (hi === 14 && groups[1][1] === 5 && lo === 2) straightHigh = 5; // wheel A-2-3-4-5
  }

  const ordered = groups.map((g) => g[1]);
  let cat: Cat5;
  let ranks: number[];
  if (straightHigh && flush) {
    cat = straightHigh === 14 ? Cat5.Royal : Cat5.StraightFlush;
    ranks = [straightHigh];
  } else if (groups[0][0] === 4) {
    cat = Cat5.Quads;
    ranks = ordered;
  } else if (groups[0][0] === 3 && groups[1][0] === 2) {
    cat = Cat5.FullHouse;
    ranks = ordered;
  } else if (flush) {
    cat = Cat5.Flush;
    ranks = ordered;
  } else if (straightHigh) {
    cat = Cat5.Straight;
    ranks = [straightHigh];
  } else if (groups[0][0] === 3) {
    cat = Cat5.Trips;
    ranks = ordered;
  } else if (groups[0][0] === 2 && groups[1][0] === 2) {
    cat = Cat5.TwoPair;
    ranks = ordered;
  } else if (groups[0][0] === 2) {
    cat = Cat5.Pair;
    ranks = ordered;
  } else {
    cat = Cat5.High;
    ranks = ordered;
  }
  return { cat, score: pack(cat, ranks), ranks, cards: cards.slice() };
}

/** Best 5-card hand out of 5..7 cards. */
export function bestOf(cards: Card[]): Hand5 {
  if (cards.length === 5) return eval5(cards);
  const n = cards.length;
  let best: Hand5 | null = null;
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === 5) {
      const h = eval5(pick);
      if (!best || h.score > best.score) best = h;
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best!;
}

/** Compare: >0 if a beats b, <0 if b beats a, 0 tie. */
export const compare5 = (a: Hand5, b: Hand5) => a.score - b.score;

/** Jacks-or-better qualifying pair check (pair of J, Q, K or A). */
export function isHighPair(h: Hand5) {
  return h.cat === Cat5.Pair && h.ranks[0] >= 11;
}

/** Which of the 5 cards take part in the made hand (for highlighting). */
export function scoringMask(cards: Card[], h: Hand5): boolean[] {
  const whole = [Cat5.Straight, Cat5.Flush, Cat5.FullHouse, Cat5.StraightFlush, Cat5.Royal];
  if (whole.includes(h.cat)) return cards.map((c) => h.cards.includes(c));
  if (h.cat === Cat5.High) return cards.map(() => false);
  const counts = new Map<number, number>();
  for (const c of h.cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  return cards.map((c) => h.cards.includes(c) && (counts.get(rankOf(c)) ?? 0) >= 2);
}
