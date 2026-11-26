import { rankOf, suitOf, type Card } from '../../core/cards';
import type { Street } from './betting';
import type { Knowledge } from './dealerAI';
import { categoryOf } from './evaluator';
import { connected, isHighRank, type SkillInfo } from './skills';

const BOARD_AT: Record<Street, number> = { PRE_FLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

/** Turns what the player discovered with skills into constraints on the dealer's hand. */
export function knowledgeFrom(revealed: readonly SkillInfo[], community: readonly Card[]): Knowledge {
  const k: Required<Knowledge> = { oppCards: [], nextBoard: [], tests: [] };
  for (const info of revealed) {
    switch (info.id) {
      case 'sharpEye':
        k.tests.push((o) => (rankOf(o[0]) === rankOf(o[1])) === info.pair);
        break;
      case 'suitReader':
        k.tests.push((o) => (suitOf(o[0]) === suitOf(o[1])) === info.suited);
        break;
      case 'highCardReader':
        k.tests.push((o) => (isHighRank(rankOf(o[0])) || isHighRank(rankOf(o[1]))) === info.high);
        break;
      case 'connectionReader':
        k.tests.push((o) => connected(o[0], o[1]) === info.connected);
        break;
      case 'handReader': {
        const board = community.slice(0, BOARD_AT[info.street]);
        k.tests.push((o) => categoryOf([...o, ...board]) === info.category);
        break;
      }
      case 'revealCard':
        k.oppCards.push(info.card);
        break;
      case 'peek':
        if (!community.includes(info.card)) k.nextBoard.push(info.card);
        break;
    }
  }
  return k;
}
