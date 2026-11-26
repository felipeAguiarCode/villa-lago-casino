import { rankOf, suitOf, type Card } from '../../../core/cards';

/**
 * Canastra Rules Engine: the best single same-suit sequence of a hand, with 2s as wild cards (one
 * substitute per sequence; a 2 in its own suit at the "2" position is natural). Pure.
 */
export interface CanastraOptions {
  minimumSequenceSize: number;
  minimumCanastraSize: number;
  wildRank: number;
  maxSubstituteWildCards: number;
  naturalTwoEnabled: boolean;
  aceLowEnabled: boolean;
  aceHighEnabled: boolean;
  cleanCanastraPriority: boolean;
}

export const CANASTRA_DEFAULTS: CanastraOptions = {
  minimumSequenceSize: 3,
  minimumCanastraSize: 7,
  wildRank: 2,
  maxSubstituteWildCards: 1,
  naturalTwoEnabled: true,
  aceLowEnabled: true,
  aceHighEnabled: true,
  cleanCanastraPriority: true,
};

export type CanastraClass = 'NO_SEQUENCE' | 'SHORT_SEQUENCE' | 'LONG_SEQUENCE' | 'DIRTY_CANASTRA' | 'CLEAN_CANASTRA';
export const CANASTRA_CLASSES: CanastraClass[] = ['NO_SEQUENCE', 'SHORT_SEQUENCE', 'LONG_SEQUENCE', 'DIRTY_CANASTRA', 'CLEAN_CANASTRA'];

export interface CanastraSequence {
  cls: CanastraClass;
  suit: number;
  /** Positions start..end: 1 is a low Ace, 14 a high Ace. */
  start: number;
  end: number;
  /** Hand indices in position order. */
  cards: number[];
  /** Hand index of the substitute 2 and the position it stands for, if any. */
  wild: { index: number; position: number } | null;
  length: number;
  naturals: number;
}

export const NO_SEQUENCE: CanastraSequence = { cls: 'NO_SEQUENCE', suit: -1, start: 0, end: 0, cards: [], wild: null, length: 0, naturals: 0 };

function classify(length: number, dirty: boolean, o: CanastraOptions): CanastraClass {
  if (length >= o.minimumCanastraSize) return dirty ? 'DIRTY_CANASTRA' : 'CLEAN_CANASTRA';
  if (length >= 5) return 'LONG_SEQUENCE';
  if (length >= o.minimumSequenceSize) return 'SHORT_SEQUENCE';
  return 'NO_SEQUENCE';
}

/** Rank key: class, length, natural cards, final card (high Ace 14, low Ace 1). Suits never count. */
export function sequenceKey(s: CanastraSequence, o: CanastraOptions = CANASTRA_DEFAULTS): number[] {
  let cls = CANASTRA_CLASSES.indexOf(s.cls);
  // with purity priority off, both canastras rank together and length decides
  if (!o.cleanCanastraPriority && cls === 4) cls = 3;
  return [cls, s.length, s.naturals, s.end];
}

export function compareSequences(a: CanastraSequence, b: CanastraSequence, o: CanastraOptions = CANASTRA_DEFAULTS): number {
  const ka = sequenceKey(a, o);
  const kb = sequenceKey(b, o);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return Math.sign(ka[i] - kb[i]);
  return 0;
}

/** The card values that fill position p of a suit (1 and 14 are the Ace). */
const rankAt = (p: number) => (p === 1 || p === 14 ? 14 : p);

/** Every same-suit window that one hand can fill, best first. */
export function bestSequence(hand: Card[], o: CanastraOptions = CANASTRA_DEFAULTS): CanastraSequence {
  let best = NO_SEQUENCE;
  const lo = o.aceLowEnabled ? 1 : 2;
  const hi = o.aceHighEnabled ? 14 : 13;
  for (let suit = 0; suit < 4; suit++) {
    // first natural card of this suit for each position
    const natural = new Map<number, number>();
    for (let p = lo; p <= hi; p++) {
      const idx = hand.findIndex((c) => suitOf(c) === suit && rankOf(c) === rankAt(p) && (rankAt(p) !== o.wildRank || o.naturalTwoEnabled));
      if (idx >= 0) natural.set(p, idx);
    }
    for (let a = lo; a <= hi; a++)
      for (let b = a + o.minimumSequenceSize - 1; b <= hi && b - a + 1 <= hand.length; b++) {
        // a window can't hold the low and the high Ace together (no circular runs)
        if (a === 1 && b === 14) continue;
        const gaps: number[] = [];
        const cards: number[] = [];
        for (let p = a; p <= b; p++) {
          const i = natural.get(p);
          if (i === undefined) gaps.push(p);
          cards.push(i ?? -1);
        }
        if (gaps.length > o.maxSubstituteWildCards) continue;
        let wild: CanastraSequence['wild'] = null;
        if (gaps.length) {
          // any 2 not already standing in its own natural place
          const w = hand.findIndex((c, i) => rankOf(c) === o.wildRank && !cards.includes(i));
          if (w < 0) continue;
          wild = { index: w, position: gaps[0] };
          cards[gaps[0] - a] = w;
        }
        const length = b - a + 1;
        const seq: CanastraSequence = { cls: classify(length, !!wild, o), suit, start: a, end: b, cards, wild, length, naturals: length - (wild ? 1 : 0) };
        if (compareSequences(seq, best, o) > 0) best = seq;
      }
  }
  return best;
}

/**
 * Dealer discard policy (up to `max` cards, decided from its own hand only):
 * keep the best sequence, the same-suit cards right next to its ends and one spare 2 when the
 * sequence has no substitute yet; with no sequence, keep the suit with most distinct values
 * (then the longest natural run, then the first suit in hand order) and one spare 2.
 */
export function canastraDealerDiscards(hand: Card[], max: number, o: CanastraOptions = CANASTRA_DEFAULTS): number[] {
  const best = bestSequence(hand, o);
  const keep = new Set<number>();
  const isWild = (c: Card) => rankOf(c) === o.wildRank;
  let suit: number;
  if (best.cls !== 'NO_SEQUENCE') {
    if (best.length === hand.length) return [];
    suit = best.suit;
    best.cards.forEach((i) => keep.add(i));
    for (const p of [best.start - 1, best.end + 1]) {
      if (p < 1 || p > 14) continue;
      const i = hand.findIndex((c, k) => !keep.has(k) && suitOf(c) === suit && rankOf(c) === rankAt(p));
      if (i >= 0) keep.add(i);
    }
    if (!best.wild) {
      const w = hand.findIndex((c, k) => !keep.has(k) && isWild(c));
      if (w >= 0) keep.add(w);
    }
  } else {
    suit = chooseSuit(hand, o);
    hand.forEach((c, i) => suitOf(c) === suit && keep.add(i));
    const w = hand.findIndex((c, k) => !keep.has(k) && isWild(c));
    if (w >= 0) keep.add(w);
  }
  const rest = hand.map((_, i) => i).filter((i) => !keep.has(i));
  // other suits go first, then the rest, in hand order
  rest.sort((x, y) => Number(suitOf(hand[x]) === suit) - Number(suitOf(hand[y]) === suit) || x - y);
  return rest.slice(0, max).sort((x, y) => x - y);
}

function chooseSuit(hand: Card[], o: CanastraOptions): number {
  let bestSuit = -1;
  let bestKey: number[] = [];
  const firstSeen = (s: number) => hand.findIndex((c) => suitOf(c) === s);
  for (let s = 0; s < 4; s++) {
    if (firstSeen(s) < 0) continue;
    const ranks = new Set(hand.filter((c) => suitOf(c) === s).map(rankOf));
    const positions = new Set<number>();
    for (const r of ranks) {
      if (r === 14) {
        if (o.aceLowEnabled) positions.add(1);
        if (o.aceHighEnabled) positions.add(14);
      } else positions.add(r);
    }
    let run = 0;
    let cur = 0;
    for (let p = 1; p <= 14; p++) {
      cur = positions.has(p) ? cur + 1 : 0;
      run = Math.max(run, cur);
    }
    const key = [ranks.size, run, -firstSeen(s)];
    if (bestSuit < 0 || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
      bestSuit = s;
      bestKey = key;
    }
  }
  return bestSuit;
}
