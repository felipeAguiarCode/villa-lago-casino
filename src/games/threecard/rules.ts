import type { Card } from '../../core/cards';
import { Cat3, eval3, type Hand3 } from '../../core/eval3';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';

/** Pair Plus pays (to 1), independent of the dealer. */
export const PAIR_PLUS: Partial<Record<Cat3, number>> = {
  [Cat3.StraightFlush]: 40,
  [Cat3.Trips]: 30,
  [Cat3.Straight]: 6,
  [Cat3.Flush]: 3,
  [Cat3.Pair]: 1,
};

/** Ante bonus (to 1), paid on the ante whenever the player plays, win or lose. */
export const ANTE_BONUS: Partial<Record<Cat3, number>> = {
  [Cat3.StraightFlush]: 5,
  [Cat3.Trips]: 4,
  [Cat3.Straight]: 1,
};

export const TCP = { minBet: 5, maxBet: 2500 };

/** Lucky 6 (six-card bonus): best five of the player's three plus the dealer's three cards. */
export const LUCKY6: Partial<Record<Cat5, number>> = {
  [Cat5.Royal]: 1000,
  [Cat5.StraightFlush]: 200,
  [Cat5.Quads]: 100,
  [Cat5.FullHouse]: 20,
  [Cat5.Flush]: 15,
  [Cat5.Straight]: 10,
  [Cat5.Trips]: 7,
};

/** Dealer needs Queen-high or better. */
export const dealerQualifies = (h: Hand3) => h.cat > Cat3.High || h.ranks[0] >= 12;

/** Optimal strategy: play Q-6-4 or better. */
export function shouldPlay(h: Hand3): boolean {
  if (h.cat > Cat3.High) return true;
  const [a, b, c] = h.ranks;
  if (a !== 12) return a > 12;
  if (b !== 6) return b > 6;
  return c >= 4;
}

export interface TcpResult {
  player: Hand3;
  dealer: Hand3;
  qualifies: boolean;
  /** -1 dealer wins, 0 tie, 1 player wins (only meaningful when played). */
  cmp: number;
  ret: { ante: number; play: number; pairPlus: number; lucky6: number };
  anteBonus: number;
  pairPlusMult: number;
  six: Hand5;
  lucky6Mult: number;
}

/** Settles a hand. Returns the amount returned on each spot (stake + winnings). */
export function settleTcp(player: Card[], dealer: Card[], bets: { ante: number; pairPlus: number; lucky6?: number }, played: boolean): TcpResult {
  const ph = eval3(player);
  const dh = eval3(dealer);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, play: 0, pairPlus: 0, lucky6: 0 };
  let anteBonus = 0;
  if (played && bets.ante > 0) {
    const play = bets.ante;
    anteBonus = bets.ante * (ANTE_BONUS[ph.cat] ?? 0);
    if (!qualifies) {
      ret.ante = bets.ante * 2;
      ret.play = play;
    } else if (cmp > 0) {
      ret.ante = bets.ante * 2;
      ret.play = play * 2;
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.play = play;
    }
    ret.ante += anteBonus;
  }
  const mult = PAIR_PLUS[ph.cat] ?? 0;
  if (bets.pairPlus > 0 && mult > 0) ret.pairPlus = bets.pairPlus * (1 + mult);
  // Lucky 6 is settled even when the player folds (the dealer's cards are always shown)
  const six = bestOf([...player, ...dealer]);
  const l6 = LUCKY6[six.cat] ?? 0;
  if ((bets.lucky6 ?? 0) > 0 && l6 > 0) ret.lucky6 = bets.lucky6! * (1 + l6);
  return { player: ph, dealer: dh, qualifies, cmp, ret, anteBonus, pairPlusMult: mult, six, lucky6Mult: l6 };
}
