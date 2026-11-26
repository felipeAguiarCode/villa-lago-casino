import type { Card } from '../../core/cards';
import { best4, Cat4, type Hand4 } from '../../core/eval4';

/** Crazy 4 Poker: 5 cards each, best four play. */
export const C4 = { minBet: 5, maxBet: 1000 };

/** Dealer "opens" with King high or better. */
export const dealerOpens = (h: Hand4) => h.cat > Cat4.High || h.ranks[0] >= 13;

/** Super Bonus (mandatory, equal to the Ante) pays on straights or better. */
export function superBonusPays(h: Hand4): number {
  if (h.cat === Cat4.Quads) return h.ranks[0] === 14 ? 200 : 30;
  if (h.cat === Cat4.StraightFlush) return 15;
  if (h.cat === Cat4.Trips) return 2;
  if (h.cat === Cat4.Flush) return 1.5;
  if (h.cat === Cat4.Straight) return 1;
  return 0;
}

/** Queens Up (optional), paytable 4: on the player's best four cards. */
export function queensUpPays(h: Hand4): number {
  switch (h.cat) {
    case Cat4.Quads:
      return 50;
    case Cat4.StraightFlush:
      return 40;
    case Cat4.Trips:
      return 7;
    case Cat4.Flush:
      return 4;
    case Cat4.Straight:
      return 3;
    case Cat4.TwoPair:
      return 2;
    case Cat4.Pair:
      return h.ranks[0] >= 12 ? 1 : 0;
    default:
      return 0;
  }
}

/** 3× is allowed with a pair of Aces or better. */
export const canPlay3x = (h: Hand4) => h.cat > Cat4.Pair || (h.cat === Cat4.Pair && h.ranks[0] === 14);

/** Simple strategy (within 0.0001 % of optimal): 3× when allowed, 1× with K-Q-8-4 or better, else fold. */
export function c4Advice(player5: Card[]): 0 | 1 | 3 {
  const h = best4(player5);
  if (canPlay3x(h)) return 3;
  if (h.cat > Cat4.High) return 1;
  const min = [13, 12, 8, 4];
  for (let i = 0; i < 4; i++) {
    if (h.ranks[i] > min[i]) return 1;
    if (h.ranks[i] < min[i]) return 0;
  }
  return 1;
}

export interface C4Result {
  player: Hand4;
  dealer: Hand4;
  opens: boolean;
  cmp: number;
  ret: { ante: number; superBonus: number; play: number; queensUp: number };
}

/** `play` is the Play amount (0 = folded: Ante and Super Bonus are lost). */
export function settleC4(player5: Card[], dealer5: Card[], bets: { ante: number; superBonus: number; queensUp: number }, play: number): C4Result {
  const ph = best4(player5);
  const dh = best4(dealer5);
  const opens = dealerOpens(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, superBonus: 0, play: 0, queensUp: 0 };
  if (play > 0) {
    if (!opens) {
      ret.ante = bets.ante;
      ret.play = play * 2;
    } else if (cmp > 0) {
      ret.ante = bets.ante * 2;
      ret.play = play * 2;
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.play = play;
    }
    const sb = superBonusPays(ph);
    if (sb > 0) ret.superBonus = bets.superBonus * (1 + sb);
    else if (!opens || cmp >= 0) ret.superBonus = bets.superBonus;
  }
  const q = queensUpPays(ph);
  if (bets.queensUp > 0 && q > 0) ret.queensUp = bets.queensUp * (1 + q);
  return { player: ph, dealer: dh, opens, cmp, ret };
}
