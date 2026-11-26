/** Money side of Showdown Poker, kept apart from hand evaluation. */
export type RoundResult = 'win' | 'lose' | 'push' | 'fold';

/**
 * Chips returned for a finished round (stake included). The total bet was already debited while
 * betting, so a loss or a fold returns nothing and debits nothing more.
 */
export function payoutFor(result: RoundResult, totalBet: number, winPays = 1): number {
  switch (result) {
    case 'win':
      return totalBet * (1 + winPays);
    case 'push':
      return totalBet;
    default:
      return 0;
  }
}
