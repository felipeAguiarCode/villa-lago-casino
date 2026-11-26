import type { BetOutcome } from './evaluate';

/**
 * Financial result of a round, in cents (integers: no rounding can create or destroy chips).
 * Net Result = Total Return − Total Bet; Final Balance = Initial Balance − Total Bet + Total Return.
 */
export interface DtSettlement {
  outcomes: BetOutcome[];
  totalBet: number;
  totalReturn: number;
  net: number;
  balanceBefore: number;
  balanceAfter: number;
}

export const toCents = (chips: number) => Math.round(chips * 100);
export const toChips = (cents: number) => cents / 100;

export function settleOutcomes(outcomes: BetOutcome[], balanceBeforeCents: number): DtSettlement {
  const totalBet = outcomes.reduce((s, o) => s + o.stake, 0);
  const totalReturn = outcomes.reduce((s, o) => s + o.returned, 0);
  return { outcomes, totalBet, totalReturn, net: totalReturn - totalBet, balanceBefore: balanceBeforeCents, balanceAfter: balanceBeforeCents - totalBet + totalReturn };
}
