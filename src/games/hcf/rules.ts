import { rankOf, suitOf, type Card } from '../../core/cards';

/** High Card Flush: seven cards each; the longest flush wins, then its high cards. */
export const HCF = { minBet: 5, maxBet: 1000 };

export interface FlushHand {
  suit: number;
  /** Ranks of the flush cards, high to low. */
  ranks: number[];
  cards: Card[];
  score: number;
}

/** Best flush out of seven cards: the most cards of one suit, ties broken by the ranks. */
export function bestFlush(cards: Card[]): FlushHand {
  let best: FlushHand | null = null;
  for (let s = 0; s < 4; s++) {
    const cs = cards.filter((c) => suitOf(c) === s).sort((a, b) => rankOf(b) - rankOf(a));
    if (!cs.length) continue;
    const ranks = cs.map(rankOf);
    let score = cs.length;
    for (let i = 0; i < 7; i++) score = score * 15 + (ranks[i] ?? 0);
    if (!best || score > best.score) best = { suit: s, ranks, cards: cs, score };
  }
  return best!;
}

/** Dealer qualifies with a three-card flush, nine high, or better. */
export const dealerQualifies = (h: FlushHand) => h.ranks.length > 3 || (h.ranks.length === 3 && h.ranks[0] >= 9);

/** Largest raise allowed (in antes) for a flush size. */
export const maxRaise = (size: number) => (size >= 6 ? 3 : size === 5 ? 2 : 1);

/** Mousseau strategy: raise the maximum with any 4+ card flush or a 3-card flush of T-8-6 or better; otherwise fold. */
export function hcfAdvice(h: FlushHand): number {
  const n = h.ranks.length;
  if (n >= 4) return maxRaise(n);
  if (n < 3) return 0;
  const min = [10, 8, 6];
  for (let i = 0; i < 3; i++) {
    if (h.ranks[i] > min[i]) return 1;
    if (h.ranks[i] < min[i]) return 0;
  }
  return 1;
}

/** Flush side bet (pay table 1). */
export function flushBetPays(size: number): number {
  return size >= 7 ? 300 : size === 6 ? 100 : size === 5 ? 10 : size === 4 ? 1 : 0;
}

/** Longest straight flush among seven cards (Aces count high and low). */
export function longestStraightFlush(cards: Card[]): number {
  let best = 0;
  for (let s = 0; s < 4; s++) {
    const has = new Set(cards.filter((c) => suitOf(c) === s).map(rankOf));
    if (has.has(14)) has.add(1);
    let run = 0;
    for (let r = 1; r <= 14; r++) {
      run = has.has(r) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}

/** Straight Flush side bet. */
export function sfBetPays(len: number): number {
  return len >= 7 ? 8000 : len === 6 ? 1000 : len === 5 ? 100 : len === 4 ? 60 : len === 3 ? 7 : 0;
}

export interface HcfResult {
  player: FlushHand;
  dealer: FlushHand;
  qualifies: boolean;
  cmp: number;
  ret: { ante: number; raise: number; flush: number; sflush: number };
}

export function settleHcf(player: Card[], dealer: Card[], bets: { ante: number; flush: number; sflush: number }, raise: number): HcfResult {
  const ph = bestFlush(player);
  const dh = bestFlush(dealer);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, raise: 0, flush: 0, sflush: 0 };
  if (raise > 0) {
    if (!qualifies) {
      ret.ante = bets.ante * 2;
      ret.raise = raise;
    } else if (cmp > 0) {
      ret.ante = bets.ante * 2;
      ret.raise = raise * 2;
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.raise = raise;
    }
  }
  const fp = flushBetPays(ph.ranks.length);
  if (bets.flush > 0 && fp > 0) ret.flush = bets.flush * (1 + fp);
  const sp = sfBetPays(longestStraightFlush(player));
  if (bets.sflush > 0 && sp > 0) ret.sflush = bets.sflush * (1 + sp);
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}
