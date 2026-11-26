/**
 * Financial Settlement: what the player gets back at the end of a hand. Skill costs are never part
 * of the pot; they only enter the net result.
 */
export type Outcome = 'win' | 'lose' | 'tie' | 'playerFold' | 'dealerFold';

export interface Settlement {
  outcome: Outcome;
  /** Chips both sides matched, counted once per side. */
  matched: number;
  /** The disputed pot (2 × matched). */
  pot: number;
  /** Player's share of the pot. */
  grossPayout: number;
  /** Player's unmatched bet returned before the pot is resolved. */
  refund: number;
  /** Everything the player wagered this hand. */
  wagered: number;
  skillCosts: number;
  /** payout − wagered + refund − skills. */
  net: number;
}

export function settle(contrib: { player: number; dealer: number }, outcome: Outcome, skillCosts: number, rake = 0): Settlement {
  const matched = Math.min(contrib.player, contrib.dealer);
  const pot = 2 * matched;
  const refund = contrib.player - matched;
  const share = outcome === 'win' || outcome === 'dealerFold' ? 1 : outcome === 'tie' ? 0.5 : 0;
  const grossPayout = pot * share * (1 - rake);
  const wagered = contrib.player;
  return { outcome, matched, pot, grossPayout, refund, wagered, skillCosts, net: grossPayout - wagered + refund - skillCosts };
}

/** Chips credited to the wallet at the end (payout and refund, each counted once). */
export const credited = (s: Settlement) => s.grossPayout + s.refund;
