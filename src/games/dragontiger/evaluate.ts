import { suitOf, type Card } from '../../core/cards';
import { isMainBet, payoutOf, type BetId, type DragonTigerRuleset, type SideKind } from './ruleset';
import { dtValue, isRedCard } from './shoe';

/** Evaluation of a dealt round: no poker evaluator, only Dragon Tiger values and suits. */
export type MainResult = 'DRAGON_WIN' | 'TIGER_WIN' | 'TIE' | 'SUITED_TIE';
export type BetState = 'WIN' | 'LOSS' | 'HALF_LOSS' | 'REFUND';

export function mainResult(dragon: Card, tiger: Card): MainResult {
  const d = dtValue(dragon);
  const t = dtValue(tiger);
  if (d > t) return 'DRAGON_WIN';
  if (t > d) return 'TIGER_WIN';
  return suitOf(dragon) === suitOf(tiger) ? 'SUITED_TIE' : 'TIE';
}

export const isTie = (r: MainResult) => r === 'TIE' || r === 'SUITED_TIE';

/** Whether a side bet's condition holds for one card. */
export function sideWins(kind: SideKind, card: Card, r: DragonTigerRuleset): boolean {
  const v = dtValue(card);
  switch (kind) {
    case 'BIG':
      return v !== r.excludedBigSmallRank && v >= 8;
    case 'SMALL':
      return v !== r.excludedBigSmallRank && v <= 6;
    case 'ODD':
      return v !== r.excludedOddRank && v % 2 === 1;
    case 'EVEN':
      return v % 2 === 0;
    case 'RED':
      return isRedCard(card);
    case 'BLACK':
      return !isRedCard(card);
  }
}

export interface BetOutcome {
  id: BetId;
  /** Amount bet, in cents. */
  stake: number;
  state: BetState;
  /** Everything paid back (stake included), in cents. */
  returned: number;
}

/** Cents returned for `stake` cents at a net payout with up to two decimals (exact). */
const winReturn = (stake: number, payout: number) => stake + Math.round(stake * payout);

export function evaluateBet(id: BetId, stake: number, dragon: Card, tiger: Card, r: DragonTigerRuleset): BetOutcome {
  const result = mainResult(dragon, tiger);
  let state: BetState;
  if (isMainBet(id)) {
    if (id === 'DRAGON' || id === 'TIGER') {
      const mine = id === 'DRAGON' ? 'DRAGON_WIN' : 'TIGER_WIN';
      state = result === mine ? 'WIN' : isTie(result) ? 'HALF_LOSS' : 'LOSS';
    } else if (id === 'TIE') state = isTie(result) ? 'WIN' : 'LOSS';
    else state = result === 'SUITED_TIE' ? 'WIN' : 'LOSS';
  } else {
    const [side, kind] = id.split('_') as ['DRAGON' | 'TIGER', SideKind];
    state = sideWins(kind, side === 'DRAGON' ? dragon : tiger, r) ? 'WIN' : 'LOSS';
  }
  const returned = state === 'WIN' ? winReturn(stake, payoutOf(id, r)) : state === 'HALF_LOSS' ? Math.round(stake * r.tieRefundPercentage) : 0;
  return { id, stake, state, returned };
}

/** A bet of a voided round: the stake comes back in full. */
export const refundBet = (id: BetId, stake: number): BetOutcome => ({ id, stake, state: 'REFUND', returned: stake });
