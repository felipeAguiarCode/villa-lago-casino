import { rankOf, type Card } from '../../core/cards';

export const RD = { decks: 6, minBet: 5, maxBet: 2500, tripsPays: 11 };

/** Pays (to 1) by spread: the number of ranks strictly between the two cards. */
export function spreadPays(spread: number): number {
  if (spread <= 0) return 0;
  if (spread === 1) return 5;
  if (spread === 2) return 4;
  if (spread === 3) return 2;
  return 1;
}

export type RdKind = 'pair' | 'consecutive' | 'spread';

export function classify(a: Card, b: Card): { kind: RdKind; spread: number; lo: number; hi: number } {
  const x = rankOf(a);
  const y = rankOf(b);
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  if (lo === hi) return { kind: 'pair', spread: 0, lo, hi };
  if (hi - lo === 1) return { kind: 'consecutive', spread: 0, lo, hi };
  return { kind: 'spread', spread: hi - lo - 1, lo, hi };
}

/** Strategy: raise when the spread is 7 or more. */
export const shouldRaise = (spread: number) => spread >= 7;

/** Amount returned on each bet. */
export function settleRd(a: Card, b: Card, third: Card | null, bets: { bet: number; raise: number }) {
  const c = classify(a, b);
  const ret = { bet: 0, raise: 0 };
  if (c.kind === 'consecutive') {
    ret.bet = bets.bet;
    return { c, ret, win: false, push: true };
  }
  if (c.kind === 'pair') {
    if (third !== null && rankOf(third) === c.lo) {
      ret.bet = bets.bet * (1 + RD.tripsPays);
      return { c, ret, win: true, push: false };
    }
    ret.bet = bets.bet;
    return { c, ret, win: false, push: true };
  }
  const r = third === null ? 0 : rankOf(third);
  if (r > c.lo && r < c.hi) {
    const m = spreadPays(c.spread);
    ret.bet = bets.bet * (1 + m);
    ret.raise = bets.raise * (1 + m);
    return { c, ret, win: true, push: false };
  }
  return { c, ret, win: false, push: false };
}
