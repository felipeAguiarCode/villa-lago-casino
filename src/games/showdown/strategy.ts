import { rankOf, suitOf, type Card } from '../../core/cards';
import { cryptoRng, type Rng } from '../../core/rng';
import { SHOWDOWN } from './config';
import { score5, strength } from './hands';

/**
 * Card-selection strategies. A strategy only ever receives a SeatView: the cards that seat
 * legitimately knows (its own hand). It never sees the opponent, the deck order or the bets.
 */
export interface SeatView {
  /** Cards that can be confirmed this turn. */
  readonly available: readonly Card[];
  /** Cards already confirmed, in order. */
  readonly final: readonly Card[];
  /** Confirmations still to make, this one included (5..1). */
  readonly picksLeft: number;
  /** Every card this seat has been dealt (available, confirmed or already passed over). */
  readonly seen: readonly Card[];
}

/** Returns the index (into `available`) of the card to confirm. */
export type PickStrategy = (view: SeatView) => number;

/** Baseline: any card. */
export const randomStrategy =
  (rng: Rng = cryptoRng): PickStrategy =>
  (v) =>
    rng(v.available.length);

/** Baseline the dealer must NOT use: always the highest card. */
export const highCardStrategy = (): PickStrategy => (v) => {
  let best = 0;
  v.available.forEach((c, i) => {
    if (rankOf(c) > rankOf(v.available[best])) best = i;
  });
  return best;
};

/**
 * Simple heuristic without sampling: how well a card fits the cards already confirmed and the
 * other cards in hand (pairs, suits, connectors), plus a little for its rank.
 */
export const heuristicStrategy = (): PickStrategy => (v) => {
  let best = 0;
  let bestScore = -Infinity;
  v.available.forEach((c, i) => {
    const s = fitScore(c, v.final, v.available.filter((_, k) => k !== i), v.picksLeft);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
};

function fitScore(c: Card, final: readonly Card[], spare: Card[], picksLeft: number): number {
  const r = rankOf(c);
  const s = suitOf(c);
  let score = r / 14;
  const sameFinal = final.filter((x) => rankOf(x) === r).length;
  const sameSpare = spare.filter((x) => rankOf(x) === r).length;
  score += sameFinal * 3 + sameSpare * 1.6;
  if (final.length >= 2 && final.every((x) => suitOf(x) === s)) score += 0.6 * final.length;
  if (final.length && sameFinal === 0) {
    const ranks = [...final.map(rankOf), r];
    const distinct = new Set(ranks).size === ranks.length;
    const span = Math.max(...ranks) - Math.min(...ranks);
    if (distinct && span <= 4) score += 0.45 * final.length;
  }
  // late in the hand a lone card that pairs nothing is worth less
  if (picksLeft <= 2 && sameFinal === 0 && sameSpare === 0) score -= 0.3;
  return score;
}

/**
 * The dealer's strategy: Monte Carlo over the cards this seat has not seen.
 * For every candidate it simulates the inclusion, samples the refills still to come, completes
 * the hand with the best remaining choices and averages the strength of the finished hand
 * (pairs, two pair, trips, quads, full houses, straights, flushes, straight flushes and kickers are
 * all scored by the 5-card evaluator). The fifth pick compares the four finished hands directly.
 */
export function monteCarloStrategy(rng: Rng = cryptoRng, samples = SHOWDOWN.dealerSamples): PickStrategy {
  return (v) => mcValues(v, rng, samples).indexOfMax;
}

export interface McResult {
  /** Expected strength (0..1) per available card. */
  values: number[];
  indexOfMax: number;
}

const hand = new Array<number>(5);

/** Expected final strength of confirming each available card. */
export function mcValues(v: SeatView, rng: Rng = cryptoRng, samples = SHOWDOWN.dealerSamples): McResult {
  const L = v.picksLeft;
  const n = v.available.length;
  const values = new Array<number>(n).fill(0);
  const base = v.final.length;
  for (let k = 0; k < base; k++) hand[k] = v.final[k];
  if (L <= 1) {
    for (let i = 0; i < n; i++) {
      hand[base] = v.available[i];
      values[i] = strength(score5(hand));
    }
    return { values, indexOfMax: argmax(values) };
  }
  const seen = new Set(v.seen);
  const unknown: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) unknown.push(c);
  const draws = L - 1;
  const need = L - 1;
  const pool = new Array<number>(n - 1 + draws);
  const sample = new Array<number>(draws);
  for (let s = 0; s < samples; s++) {
    // the same sampled refills are used for every candidate (common random numbers)
    for (let d = 0; d < draws; d++) {
      const j = d + rng(unknown.length - d);
      const t = unknown[d];
      unknown[d] = unknown[j];
      unknown[j] = t;
      sample[d] = unknown[d];
    }
    for (let i = 0; i < n; i++) {
      hand[base] = v.available[i];
      let p = 0;
      for (let k = 0; k < n; k++) if (k !== i) pool[p++] = v.available[k];
      for (let d = 0; d < draws; d++) pool[p++] = sample[d];
      values[i] += bestCompletion(base + 1, need, pool, p);
    }
  }
  for (let i = 0; i < n; i++) values[i] /= samples;
  return { values, indexOfMax: argmax(values) };
}

/** Best strength of `hand[0..filled)` completed with `need` cards out of pool[0..len). */
function bestCompletion(filled: number, need: number, pool: number[], len: number): number {
  let best = 0;
  const rec = (start: number, at: number, left: number) => {
    if (left === 0) {
      const st = strength(score5(hand));
      if (st > best) best = st;
      return;
    }
    for (let i = start; i <= len - left; i++) {
      hand[at] = pool[i];
      rec(i + 1, at + 1, left - 1);
    }
  };
  rec(0, filled, need);
  return best;
}

function argmax(xs: number[]): number {
  let b = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[b]) b = i;
  return b;
}

/**
 * Estimated strength (0..1) of the hand a seat is building, for betting decisions: the expected
 * value of its best confirmation.
 */
export function estimateStrength(v: SeatView, rng: Rng = cryptoRng, samples = SHOWDOWN.hintSamples): number {
  const r = mcValues(v, rng, samples);
  return r.values[r.indexOfMax];
}
