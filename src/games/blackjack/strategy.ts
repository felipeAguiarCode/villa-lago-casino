import { rankOf, type Card } from '../../core/cards';
import { bjValue, handValue } from './rules';

export type Move = 'hit' | 'stand' | 'double' | 'split';

/**
 * Basic strategy for 6 decks, dealer stands on soft 17, double after split, no surrender.
 * `up` is the dealer up card value (2..11).
 */
export function basicStrategy(cards: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean): Move {
  const up = bjValue(dealerUp);
  const v = handValue(cards);

  if (canSplit && cards.length === 2 && bjValue(cards[0]) === bjValue(cards[1])) {
    const p = rankOf(cards[0]) === 14 ? 11 : bjValue(cards[0]);
    let split = false;
    switch (p) {
      case 11:
      case 8:
        split = true;
        break;
      case 9:
        split = (up >= 2 && up <= 6) || up === 8 || up === 9;
        break;
      case 7:
        split = up <= 7;
        break;
      case 6:
        split = up <= 6;
        break;
      case 4:
        split = up === 5 || up === 6;
        break;
      case 3:
      case 2:
        split = up <= 7;
        break;
    }
    if (split) return 'split';
  }

  const dbl = (m: Move): Move => (canDouble ? 'double' : m);

  if (v.soft) {
    const t = v.total;
    if (t >= 20) return 'stand';
    if (t === 19) return 'stand';
    if (t === 18) {
      if (up >= 3 && up <= 6) return dbl('stand');
      if (up === 2 || up === 7 || up === 8) return 'stand';
      return 'hit';
    }
    if (t === 17) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
    if (t === 15 || t === 16) return up >= 4 && up <= 6 ? dbl('hit') : 'hit';
    if (t === 13 || t === 14) return up === 5 || up === 6 ? dbl('hit') : 'hit';
    return 'hit';
  }

  const t = v.total;
  if (t >= 17) return 'stand';
  if (t >= 13) return up <= 6 ? 'stand' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t === 11) return up <= 10 ? dbl('hit') : 'hit';
  if (t === 10) return up <= 9 ? dbl('hit') : 'hit';
  if (t === 9) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
  return 'hit';
}
