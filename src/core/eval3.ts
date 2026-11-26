import { rankOf, suitOf, type Card } from './cards';

/** Three Card Poker ranking (straight beats flush), weakest first. */
export enum Cat3 {
  High = 0,
  Pair,
  Flush,
  Straight,
  Trips,
  StraightFlush,
}

export const CAT3_NAME_PT: Record<Cat3, string> = {
  [Cat3.High]: 'Carta alta',
  [Cat3.Pair]: 'Par',
  [Cat3.Flush]: 'Flush',
  [Cat3.Straight]: 'Sequência',
  [Cat3.Trips]: 'Trinca',
  [Cat3.StraightFlush]: 'Straight flush',
};

export interface Hand3 {
  cat: Cat3;
  score: number;
  ranks: number[];
}

export function eval3(cards: Card[]): Hand3 {
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const flush = suitOf(cards[0]) === suitOf(cards[1]) && suitOf(cards[1]) === suitOf(cards[2]);
  let straightHigh = 0;
  if (r[0] !== r[1] && r[1] !== r[2]) {
    if (r[0] - r[2] === 2) straightHigh = r[0];
    else if (r[0] === 14 && r[1] === 3 && r[2] === 2) straightHigh = 3; // A-2-3
  }
  let cat: Cat3;
  let ranks: number[];
  if (straightHigh && flush) {
    cat = Cat3.StraightFlush;
    ranks = [straightHigh];
  } else if (r[0] === r[2]) {
    cat = Cat3.Trips;
    ranks = [r[0]];
  } else if (straightHigh) {
    cat = Cat3.Straight;
    ranks = [straightHigh];
  } else if (flush) {
    cat = Cat3.Flush;
    ranks = r;
  } else if (r[0] === r[1] || r[1] === r[2]) {
    cat = Cat3.Pair;
    const p = r[1];
    ranks = [p, r[0] === p ? r[2] : r[0]];
  } else {
    cat = Cat3.High;
    ranks = r;
  }
  let score = cat;
  for (let i = 0; i < 3; i++) score = score * 15 + (ranks[i] ?? 0);
  return { cat, score, ranks };
}
