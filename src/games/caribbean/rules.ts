import { rankOf, type Card } from '../../core/cards';
import { Cat5, eval5, type Hand5 } from '../../core/eval5';

/** Call bet pays (to 1) when the player beats a qualifying dealer. */
export const CALL_PAYS: Record<Cat5, number> = {
  [Cat5.High]: 1,
  [Cat5.Pair]: 1,
  [Cat5.TwoPair]: 2,
  [Cat5.Trips]: 3,
  [Cat5.Straight]: 4,
  [Cat5.Flush]: 5,
  [Cat5.FullHouse]: 7,
  [Cat5.Quads]: 20,
  [Cat5.StraightFlush]: 50,
  [Cat5.Royal]: 100,
};

export const CSP = { minBet: 5, maxBet: 1000, jackpotBet: 5, jackpotSeed: 25000, jackpotGrow: 2 };

/** Jackpot side bet: share of the meter, or fixed amounts (in chips) for the smaller hands. */
export const JACKPOT_PAYS: Partial<Record<Cat5, { share?: number; fixed?: number }>> = {
  [Cat5.Royal]: { share: 1 },
  [Cat5.StraightFlush]: { share: 0.1 },
  [Cat5.Quads]: { fixed: 2500 },
  [Cat5.FullHouse]: { fixed: 500 },
  [Cat5.Flush]: { fixed: 250 },
};

/** Dealer needs Ace-King or better. */
export function dealerQualifies(h: Hand5): boolean {
  if (h.cat > Cat5.High) return true;
  return h.ranks[0] === 14 && h.ranks[1] === 13;
}

/**
 * Near-optimal strategy (within ~0.1% of perfect play):
 * call with a pair or better; with Ace-King high, call with A-K-J-8-3 or better,
 * or when the dealer's up card (2..Q) matches one of your cards (it is less likely to pair him).
 */
export const MIN_AK = [14, 13, 11, 8, 3];

export function shouldCall(player: Card[], dealerUp: Card): boolean {
  const h = eval5(player);
  if (h.cat >= Cat5.Pair) return true;
  if (h.ranks[0] !== 14 || h.ranks[1] !== 13) return false;
  for (let i = 0; i < 5; i++) {
    if (h.ranks[i] > MIN_AK[i]) return true;
    if (h.ranks[i] < MIN_AK[i]) break;
    if (i === 4) return true;
  }
  const up = rankOf(dealerUp);
  return up <= 12 && player.some((c) => rankOf(c) === up);
}

export interface CspResult {
  player: Hand5;
  dealer: Hand5;
  qualifies: boolean;
  cmp: number;
  ret: { ante: number; call: number; jackpot: number };
}

export function settleCsp(player: Card[], dealer: Card[], bets: { ante: number; jackpot: number }, called: boolean, meter: number): CspResult {
  const ph = eval5(player);
  const dh = eval5(dealer);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, call: 0, jackpot: 0 };
  if (called) {
    const call = bets.ante * 2;
    if (!qualifies) {
      ret.ante = bets.ante * 2;
      ret.call = call;
    } else if (cmp > 0) {
      ret.ante = bets.ante * 2;
      ret.call = call * (1 + CALL_PAYS[ph.cat]);
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.call = call;
    }
  }
  if (bets.jackpot > 0) {
    const jp = JACKPOT_PAYS[ph.cat];
    if (jp) ret.jackpot = (jp.share ? Math.floor(meter * jp.share) : jp.fixed!) + bets.jackpot;
  }
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}
