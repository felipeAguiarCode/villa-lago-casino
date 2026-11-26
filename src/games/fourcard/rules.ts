import type { Card } from '../../core/cards';
import { best4, Cat4, type Hand4 } from '../../core/eval4';

export const FCP = { minBet: 5, maxBet: 1000 };

/** Ante bonus (to 1), paid whenever the player plays. */
export const ANTE_BONUS4: Partial<Record<Cat4, number>> = { [Cat4.Quads]: 25, [Cat4.StraightFlush]: 20, [Cat4.Trips]: 2 };

/** Aces Up side bet (to 1) on the player's best four cards. A pair pays only when it is Aces. */
export const ACES_UP: Partial<Record<Cat4, number>> = {
  [Cat4.Quads]: 50,
  [Cat4.StraightFlush]: 40,
  [Cat4.Trips]: 9,
  [Cat4.Flush]: 5,
  [Cat4.Straight]: 4,
  [Cat4.TwoPair]: 3,
  [Cat4.Pair]: 1,
};

export function acesUpMult(h: Hand4): number {
  if (h.cat === Cat4.Pair) return h.ranks[0] === 14 ? 1 : 0;
  if (h.cat === Cat4.High) return 0;
  return ACES_UP[h.cat] ?? 0;
}

/** Simple near-optimal strategy: 3× with a pair of Tens or better, 1× with a pair of 3s to 9s, otherwise fold. */
export function playMultiple(player5: Card[]): 0 | 1 | 3 {
  const h = best4(player5);
  if (h.cat >= Cat4.TwoPair) return 3;
  if (h.cat === Cat4.Pair) return h.ranks[0] >= 10 ? 3 : h.ranks[0] >= 3 ? 1 : 0;
  return 0;
}

export interface FcpResult {
  player: Hand4;
  dealer: Hand4;
  win: boolean;
  ret: { ante: number; play: number; acesUp: number };
  bonus: number;
}

/** `play` is the amount bet on Play (0 = folded). The player wins ties; the dealer always qualifies. */
export function settleFcp(player5: Card[], dealer6: Card[], bets: { ante: number; acesUp: number }, play: number): FcpResult {
  const ph = best4(player5);
  const dh = best4(dealer6);
  const win = ph.score >= dh.score;
  const ret = { ante: 0, play: 0, acesUp: 0 };
  let bonus = 0;
  if (play > 0) {
    bonus = bets.ante * (ANTE_BONUS4[ph.cat] ?? 0);
    if (win) {
      ret.ante = bets.ante * 2;
      ret.play = play * 2;
    }
    ret.ante += bonus;
  }
  const m = acesUpMult(ph);
  if (bets.acesUp > 0 && m > 0) ret.acesUp = bets.acesUp * (1 + m);
  return { player: ph, dealer: dh, win, ret, bonus };
}
