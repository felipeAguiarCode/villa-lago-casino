import { rankOf, suitOf, type Card } from './cards';

/** Four Card Poker ranking, weakest first (four of a kind beats a straight flush; trips beat a flush). */
export enum Cat4 {
  High = 0,
  Pair,
  TwoPair,
  Straight,
  Flush,
  Trips,
  StraightFlush,
  Quads,
}

export interface Hand4 {
  cat: Cat4;
  score: number;
  ranks: number[];
  cards: Card[];
}

export function eval4(cards: Card[]): Hand4 {
  const counts = new Array<number>(15).fill(0);
  let flush = true;
  for (const c of cards) {
    counts[rankOf(c)]++;
    if (suitOf(c) !== suitOf(cards[0])) flush = false;
  }
  const groups: [number, number][] = [];
  for (let r = 14; r >= 2; r--) if (counts[r]) groups.push([counts[r], r]);
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const ordered = groups.map((g) => g[1]);
  let straightHigh = 0;
  if (groups.length === 4) {
    if (ordered[0] - ordered[3] === 3) straightHigh = ordered[0];
    else if (ordered[0] === 14 && ordered[1] === 4 && ordered[3] === 2) straightHigh = 4; // A-2-3-4
  }
  let cat: Cat4;
  let ranks = ordered;
  if (groups[0][0] === 4) cat = Cat4.Quads;
  else if (straightHigh && flush) {
    cat = Cat4.StraightFlush;
    ranks = [straightHigh];
  } else if (groups[0][0] === 3) cat = Cat4.Trips;
  else if (flush) cat = Cat4.Flush;
  else if (straightHigh) {
    cat = Cat4.Straight;
    ranks = [straightHigh];
  } else if (groups[0][0] === 2 && groups[1][0] === 2) cat = Cat4.TwoPair;
  else if (groups[0][0] === 2) cat = Cat4.Pair;
  else cat = Cat4.High;
  let score = cat;
  for (let i = 0; i < 4; i++) score = score * 15 + (ranks[i] ?? 0);
  return { cat, score, ranks, cards: cards.slice() };
}

/** Best 4-card hand out of 4..7 cards. */
export function best4(cards: Card[]): Hand4 {
  let best: Hand4 | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const h = eval4([cards[a], cards[b], cards[c], cards[d]]);
          if (!best || h.score > best.score) best = h;
        }
  return best!;
}
