import { rankOf, suitOf, type Card } from '../../core/cards';
import { bestOf, Cat5, eval5, type Hand5 } from '../../core/eval5';

export const RUS = { minBet: 5, maxBet: 1000 };

/** Call bet pays (to 1) when the player beats a qualifying dealer. Ace-King high pays 1:1. */
export const RUS_PAYS: Record<Cat5, number> = {
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

/** Dealer qualifies with Ace-King or better. */
export const dealerQualifies = (h: Hand5) => h.cat > Cat5.High || (h.ranks[0] === 14 && h.ranks[1] === 13);

export interface RusResult {
  player: Hand5;
  dealer: Hand5;
  qualifies: boolean;
  cmp: number;
  ret: { ante: number; call: number };
}

/**
 * Settles a called hand. `player` has 5 or 6 cards (best five play). `boughtOrSwapped` means the
 * player paid the house (sixth card or exchange): a win then returns the ante without paying it.
 */
export function settleRus(player: Card[], dealer: Card[], ante: number, called: boolean, boughtOrSwapped: boolean): RusResult {
  const ph = player.length > 5 ? bestOf(player) : eval5(player);
  const dh = eval5(dealer);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, call: 0 };
  if (called) {
    const call = ante * 2;
    if (!qualifies) {
      ret.ante = ante * 2;
      ret.call = call;
    } else if (cmp > 0) {
      ret.ante = boughtOrSwapped ? ante : ante * 2;
      ret.call = call * (1 + RUS_PAYS[ph.cat]);
    } else if (cmp === 0) {
      ret.ante = ante;
      ret.call = call;
    }
  }
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}

/**
 * "Buy a game": the dealer discards his highest card and draws a replacement. If the new card has
 * the same rank and makes no flush, he draws again. Returns the new dealer hand.
 */
export function dealerReplace(dealer: Card[], draw: () => Card): Card[] {
  const hand = dealer.slice();
  let idx = 0;
  for (let i = 1; i < hand.length; i++) if (rankOf(hand[i]) > rankOf(hand[idx])) idx = i;
  const old = hand[idx];
  for (let guard = 0; guard < 8; guard++) {
    const c = draw();
    hand[idx] = c;
    const flush = hand.every((x) => suitOf(x) === suitOf(hand[0]));
    if (rankOf(c) !== rankOf(old) || flush) break;
  }
  return hand;
}

/** Indices to exchange for a four-card flush or open straight draw, or null. */
export function drawCandidate(cards: Card[]): number[] | null {
  for (let s = 0; s < 4; s++) {
    const idx = cards.map((c, i) => (suitOf(c) === s ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 4) return [0, 1, 2, 3, 4].filter((i) => !idx.includes(i));
  }
  const ranks = cards.map(rankOf);
  for (let lo = 2; lo <= 10; lo++) {
    const pick: number[] = [];
    for (const r of [lo, lo + 1, lo + 2, lo + 3]) {
      const i = ranks.findIndex((x, k) => x === r && !pick.includes(k));
      if (i < 0) break;
      pick.push(i);
    }
    if (pick.length === 4) return [0, 1, 2, 3, 4].filter((i) => !pick.includes(i));
  }
  return null;
}

export type RusMove = 'call' | 'fold' | 'swap';

/** Simple strategy: call with a pair or better (or a strong Ace-King), chase four-card draws, else fold. */
export function rusAdvice(cards: Card[], dealerUp: Card): { move: RusMove; swap?: number[] } {
  const h = eval5(cards);
  if (h.cat >= Cat5.Pair) return { move: 'call' };
  if (h.ranks[0] === 14 && h.ranks[1] === 13) {
    const up = rankOf(dealerUp);
    if (h.ranks[2] >= 11 || cards.some((c) => rankOf(c) === up)) return { move: 'call' };
  }
  const d = drawCandidate(cards);
  if (d) return { move: 'swap', swap: d };
  return { move: 'fold' };
}
