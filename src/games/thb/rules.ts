import { rankOf, suitOf, type Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';

/** Texas Hold'em Bonus (Las Vegas rules). */
export const THB = { minBet: 5, maxBet: 1000 };

/** Bonus side bet on the player's two hole cards (AA + dealer AA pays 1000). */
export function bonusPays(hole: Card[], dealer: Card[]): number {
  const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  if (a === 14 && b === 14) {
    const [c, d] = dealer.map(rankOf);
    return c === 14 && d === 14 ? 1000 : 30;
  }
  if (a === 14 && b === 13) return suited ? 25 : 15;
  if (a === 14 && (b === 12 || b === 11)) return suited ? 20 : 5;
  if (a === b) return a >= 11 ? 10 : 3;
  return 0;
}

export interface ThbResult {
  player: Hand5;
  dealer: Hand5;
  cmp: number;
  ret: { ante: number; flop: number; turn: number; river: number; bonus: number };
}

/** Ante pays even money only when the winning hand is a straight or better (otherwise it pushes). */
export function settleThb(hole: Card[], dealer: Card[], board: Card[], bets: { ante: number; flop: number; turn: number; river: number; bonus: number }, folded: boolean): ThbResult {
  const ph = bestOf([...hole, ...board]);
  const dh = bestOf([...dealer, ...board]);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, flop: 0, turn: 0, river: 0, bonus: 0 };
  if (!folded) {
    if (cmp > 0) {
      ret.ante = ph.cat >= Cat5.Straight ? bets.ante * 2 : bets.ante;
      ret.flop = bets.flop * 2;
      ret.turn = bets.turn * 2;
      ret.river = bets.river * 2;
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.flop = bets.flop;
      ret.turn = bets.turn;
      ret.river = bets.river;
    }
  }
  const bp = bonusPays(hole, dealer);
  if (bets.bonus > 0 && bp > 0) ret.bonus = bets.bonus * (1 + bp);
  return { player: ph, dealer: dh, cmp, ret };
}

/** Pre-flop: fold only unsuited 2-3 … 2-7 (Las Vegas optimal strategy). */
export function playPreflop(hole: Card[]): boolean {
  const [a, b] = hole.map(rankOf).sort((x, y) => x - y);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  return !(!suited && a === 2 && b >= 3 && b <= 7);
}

/** Turn / river: bet when the hand already uses a hole card for a pair or better, or holds a strong draw. */
export function betStreet(hole: Card[], board: Card[]): boolean {
  const h = bestOf([...hole, ...board]);
  const b = board.length >= 5 ? bestOf(board) : null;
  if (h.cat >= Cat5.Pair && (!b || h.score > b.score)) {
    // a pair must involve a hole card (not just the board)
    if (h.cat === Cat5.Pair) return hole.some((c) => rankOf(c) === h.ranks[0]) || h.ranks[0] >= 12;
    return true;
  }
  if (board.length < 5) {
    for (let s = 0; s < 4; s++) if ([...hole, ...board].filter((c) => suitOf(c) === s).length >= 4 && hole.some((c) => suitOf(c) === s)) return true;
    if (hole.every((c) => rankOf(c) >= 12)) return true;
  }
  return false;
}
