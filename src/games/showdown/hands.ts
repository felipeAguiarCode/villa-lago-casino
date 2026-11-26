import { rankOf, type Card } from '../../core/cards';
import { Cat5, eval5, type Hand5 } from '../../core/eval5';

/**
 * Hand evaluation for Showdown Poker: final 5-card hands use the casino's eval5 (all the
 * traditional tie-breaks, A-2-3-4-5 and T-J-Q-K-A, suits never break ties); partial hands only
 * report what is already made.
 */

export interface PartialHand {
  cat: Cat5;
  /** Ranks that define the hand, most significant first. */
  ranks: number[];
  /** True only for a finished 5-card hand. */
  complete: boolean;
}

/**
 * What a set of 0–5 cards already is. Fewer than five cards can only be high card, pair, two pair,
 * trips or quads: straights, flushes and full houses need all five cards.
 */
export function partialEval(cards: Card[]): PartialHand {
  if (cards.length === 5) {
    const h = eval5(cards);
    return { cat: h.cat, ranks: h.ranks, complete: true };
  }
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ranks = groups.map((g) => g[0]);
  const top = groups[0]?.[1] ?? 0;
  const second = groups[1]?.[1] ?? 0;
  let cat = Cat5.High;
  if (top === 4) cat = Cat5.Quads;
  else if (top === 3) cat = Cat5.Trips;
  else if (top === 2 && second === 2) cat = Cat5.TwoPair;
  else if (top === 2) cat = Cat5.Pair;
  return { cat, ranks, complete: false };
}

/** >0 when a beats b, <0 when b wins, 0 for a tie (exactly 5 cards each). */
export function compareFinal(a: Card[], b: Card[]): number {
  return Math.sign(eval5(a).score - eval5(b).score);
}

export const finalHand = (cards: Card[]): Hand5 => eval5(cards);

// ------------------------------------------------------------------ fast scoring for simulations

const B5 = 15 ** 5;
const CNT = new Int32Array(15);
const GR = new Int32Array(5);
const GC = new Int32Array(5);

/** Same number as eval5(cards).score, without allocations (Monte Carlo inner loop). */
export function score5(h: ArrayLike<number>): number {
  const s0 = (h[0] / 13) | 0;
  let flush = true;
  for (let i = 0; i < 5; i++) {
    const c = h[i];
    CNT[(c % 13) + 2]++;
    if (((c / 13) | 0) !== s0) flush = false;
  }
  let n = 0;
  for (let r = 14; r >= 2; r--) {
    const k = CNT[r];
    if (k) {
      GR[n] = r;
      GC[n] = k;
      n++;
      CNT[r] = 0;
    }
  }
  // groups by count desc; ranks are already descending inside equal counts
  for (let i = 1; i < n; i++) {
    const c = GC[i];
    const r = GR[i];
    let j = i - 1;
    while (j >= 0 && GC[j] < c) {
      GC[j + 1] = GC[j];
      GR[j + 1] = GR[j];
      j--;
    }
    GC[j + 1] = c;
    GR[j + 1] = r;
  }
  let straight = 0;
  if (n === 5) {
    if (GR[0] - GR[4] === 4) straight = GR[0];
    else if (GR[0] === 14 && GR[1] === 5) straight = 5;
  }
  let cat: number;
  if (straight && flush) cat = straight === 14 ? Cat5.Royal : Cat5.StraightFlush;
  else if (GC[0] === 4) cat = Cat5.Quads;
  else if (GC[0] === 3 && GC[1] === 2) cat = Cat5.FullHouse;
  else if (flush) cat = Cat5.Flush;
  else if (straight) cat = Cat5.Straight;
  else if (GC[0] === 3) cat = Cat5.Trips;
  else if (GC[0] === 2 && GC[1] === 2) cat = Cat5.TwoPair;
  else if (GC[0] === 2) cat = Cat5.Pair;
  else cat = Cat5.High;
  let s = cat;
  if (straight && (cat === Cat5.Straight || cat === Cat5.StraightFlush || cat === Cat5.Royal)) {
    s = s * 15 + straight;
    for (let i = 1; i < 5; i++) s *= 15;
    return s;
  }
  for (let i = 0; i < 5; i++) s = s * 15 + (i < n ? GR[i] : 0);
  return s;
}

/**
 * Share of final hands a score beats (0..1), measured by simulation of the Monte Carlo strategy
 * (sim/showdown.sim.ts). Used as the "expected strength" the strategies maximise.
 * Index = Cat5; value = share of hands in a lower category.
 */
export const CAT_BELOW = [0, 0.125, 0.561, 0.807, 0.881, 0.928, 0.975, 0.9957, 0.999, 0.99995, 1];

/** Strength 0..1 of a final hand's packed score. */
export function strength(score: number): number {
  const cat = Math.floor(score / B5);
  const digits = (score - cat * B5) / B5;
  const f = Math.min(1, Math.max(0, (digits - 2 / 15) / (13 / 15)));
  return CAT_BELOW[cat] + (CAT_BELOW[cat + 1] - CAT_BELOW[cat]) * f;
}
