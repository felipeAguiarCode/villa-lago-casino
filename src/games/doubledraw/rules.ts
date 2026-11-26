import { isJoker, rankOf, suitOf, type Card } from '../../core/cards';
import { Cat5, eval5 } from '../../core/eval5';

/** Double Draw Poker (New Jersey rules): 52 cards + 2 jokers, paid by a table, no dealer hand. */
export const DD = { minBet: 5, maxBet: 1000, firstDraw: 3, secondDraw: 1 };

export type DDKey = 'fiveAces' | 'naturalRoyal' | 'wildRoyal' | 'straightFlush' | 'quads' | 'fullHouse' | 'flush' | 'straight' | 'trips' | 'twoPair' | 'none';

/** Bonus paytable (to 1), table 1. Two pair pushes the bonus. Ante and draw wagers pay 1:1 on two pair or better. */
export const DD_ROWS: { key: DDKey; bonus: number }[] = [
  { key: 'fiveAces', bonus: 500 },
  { key: 'naturalRoyal', bonus: 100 },
  { key: 'wildRoyal', bonus: 50 },
  { key: 'straightFlush', bonus: 50 },
  { key: 'quads', bonus: 20 },
  { key: 'fullHouse', bonus: 5 },
  { key: 'flush', bonus: 3 },
  { key: 'straight', bonus: 2 },
  { key: 'trips', bonus: 1 },
  { key: 'twoPair', bonus: 0 },
];

const RANK_OF_KEY: Record<DDKey, number> = {
  fiveAces: 11,
  naturalRoyal: 10,
  wildRoyal: 9,
  straightFlush: 8,
  quads: 7,
  fullHouse: 6,
  flush: 5,
  straight: 4,
  trips: 3,
  twoPair: 2,
  none: 0,
};

const keyOfCat = (cat: Cat5): DDKey =>
  cat === Cat5.Royal
    ? 'naturalRoyal'
    : cat === Cat5.StraightFlush
      ? 'straightFlush'
      : cat === Cat5.Quads
        ? 'quads'
        : cat === Cat5.FullHouse
          ? 'fullHouse'
          : cat === Cat5.Flush
            ? 'flush'
            : cat === Cat5.Straight
              ? 'straight'
              : cat === Cat5.Trips
                ? 'trips'
                : cat === Cat5.TwoPair
                  ? 'twoPair'
                  : 'none';

export interface DDHand {
  key: DDKey;
  /** Higher is better (category only: the game pays a table, kickers never matter). */
  rank: number;
  /** Concrete cards the hand was evaluated as (jokers replaced). */
  as: Card[];
}

const card = (rank: number, suit: number) => suit * 13 + (rank - 2);
const WILD_CATS = new Set([Cat5.Royal, Cat5.StraightFlush, Cat5.Flush, Cat5.Straight]);

/**
 * Jokers complete a royal flush, straight flush, flush or straight; for every other hand a joker
 * counts as an Ace. Four Aces plus a joker (or three plus two) is Five Aces, the top hand.
 */
export function ddEval(cards: Card[]): DDHand {
  const nat = cards.filter((c) => !isJoker(c));
  const jokers = cards.length - nat.length;
  if (jokers === 0) {
    const h = eval5(cards);
    const key = keyOfCat(h.cat);
    return { key, rank: RANK_OF_KEY[key], as: cards.slice() };
  }
  const aces = nat.filter((c) => rankOf(c) === 14).length;
  if (aces + jokers >= 5) return { key: 'fiveAces', rank: RANK_OF_KEY.fiveAces, as: cards.slice() };

  let best: DDHand = { key: 'none', rank: -1, as: cards.slice() };
  const consider = (subs: Card[], asAce: boolean) => {
    const h = eval5([...nat, ...subs]);
    if (!asAce && !WILD_CATS.has(h.cat)) return;
    let key = keyOfCat(h.cat);
    if (key === 'naturalRoyal') key = 'wildRoyal';
    const r = RANK_OF_KEY[key];
    if (r > best.rank) best = { key, rank: r, as: [...nat, ...subs] };
  };
  // jokers as aces (suits chosen to avoid accidental flushes; flushes are covered below)
  const offSuit = [0, 1, 2, 3].find((s) => !nat.every((c) => suitOf(c) === s)) ?? 0;
  consider(Array.from({ length: jokers }, (_, i) => card(14, (offSuit + i) % 4)), true);
  // jokers completing straights / flushes
  const suits = [...new Set(nat.map(suitOf))];
  const flushSuit = suits.length === 1 ? suits[0] : -1;
  const pool: Card[] = [];
  for (let r = 2; r <= 14; r++) {
    pool.push(card(r, flushSuit >= 0 ? flushSuit : offSuit));
    if (flushSuit >= 0) pool.push(card(r, (flushSuit + 1) % 4));
  }
  if (jokers === 1) for (const a of pool) consider([a], false);
  else for (const a of pool) for (const b of pool) consider([a, b], false);
  return best;
}

export interface DDResult {
  hand: DDHand;
  /** Amount returned per wager. */
  ret: { ante: number; bonus: number; draw1: number; draw2: number };
}

export function settleDD(cards: Card[], bets: { ante: number; bonus: number; draw1: number; draw2: number }): DDResult {
  const hand = ddEval(cards);
  const ret = { ante: 0, bonus: 0, draw1: 0, draw2: 0 };
  if (hand.rank >= RANK_OF_KEY.twoPair) {
    ret.ante = bets.ante * 2;
    ret.draw1 = bets.draw1 * 2;
    ret.draw2 = bets.draw2 * 2;
    const row = DD_ROWS.find((r) => r.key === hand.key)!;
    ret.bonus = bets.bonus * (1 + row.bonus);
  }
  return { hand, ret };
}

// ---------------------------------------------------------------- hints

/** Units won (+) or lost (−) at the end for a final hand, with ante = bonus = draw1 = draw2 = 1. */
export function finalUnits(cards: Card[]): number {
  const h = ddEval(cards);
  if (h.rank < RANK_OF_KEY.twoPair) return -4;
  const row = DD_ROWS.find((r) => r.key === h.key)!;
  return 3 + row.bonus;
}

/**
 * Second decision, computed exactly: best card to replace (or none) and whether continuing beats
 * folding (folding loses ante, bonus and first draw = −3 units).
 */
export function secondDrawAdvice(cards: Card[], unseen: Card[]): { cont: boolean; discard: number | null; ev: number } {
  let best = { discard: null as number | null, ev: finalUnits(cards) };
  for (let i = 0; i < 5; i++) {
    if (isJoker(cards[i])) continue;
    let sum = 0;
    for (const c of unseen) {
      const h = cards.slice();
      h[i] = c;
      sum += finalUnits(h);
    }
    const ev = sum / unseen.length;
    if (ev > best.ev) best = { discard: i, ev };
  }
  return { cont: best.ev > -3, ...best };
}

/** First decision heuristic: which cards to hold, and whether to continue at all. */
export function firstDrawAdvice(cards: Card[]): { cont: boolean; hold: number[] } {
  const idx = [0, 1, 2, 3, 4];
  const jokers = idx.filter((i) => isJoker(cards[i]));
  const nat = idx.filter((i) => !isJoker(cards[i]));
  const h = ddEval(cards);
  if (h.rank >= RANK_OF_KEY.straight) return { cont: true, hold: idx };
  const byRank = new Map<number, number[]>();
  for (const i of nat) byRank.set(rankOf(cards[i]), [...(byRank.get(rankOf(cards[i])) ?? []), i]);
  const groups = [...byRank.values()].filter((g) => g.length >= 2);
  if (groups.length) return { cont: true, hold: [...jokers, ...groups.flat()] };
  // four to a flush / straight (jokers count)
  for (let s = 0; s < 4; s++) {
    const f = nat.filter((i) => suitOf(cards[i]) === s);
    if (f.length + jokers.length >= 4) return { cont: true, hold: [...jokers, ...f].slice(0, 4) };
  }
  for (let lo = 1; lo <= 10; lo++) {
    const inRange = nat.filter((i) => {
      const r = rankOf(cards[i]) === 14 && lo === 1 ? 1 : rankOf(cards[i]);
      return r >= lo && r <= lo + 4;
    });
    const uniq = [...new Map(inRange.map((i) => [rankOf(cards[i]), i])).values()];
    if (uniq.length + jokers.length >= 4) return { cont: true, hold: [...jokers, ...uniq].slice(0, 4) };
  }
  if (jokers.length) {
    // a joker is an ace: keep it with the highest card
    const hi = nat.sort((a, b) => rankOf(cards[b]) - rankOf(cards[a]))[0];
    return { cont: true, hold: [...jokers, hi] };
  }
  for (let s = 0; s < 4; s++) {
    const f = nat.filter((i) => suitOf(cards[i]) === s);
    if (f.length >= 3) return { cont: true, hold: f.slice(0, 3) };
  }
  return { cont: false, hold: [] };
}
