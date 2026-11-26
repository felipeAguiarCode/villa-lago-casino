import type { Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';
import { score5 } from '../showdown/hands';

/**
 * Hand Evaluator: Texas Hold'em best five of up to seven cards. Zero, one or both hole cards may
 * play. `bestHand` (casino evaluator) is used for the showdown and display; `bestScore` returns the
 * same comparable number without allocations for the AI and simulations.
 */
export const bestHand = (cards: Card[]): Hand5 => bestOf(cards);

const B5 = 15 ** 5;
const pick = new Array<number>(5);

/** Best packed score of 5–7 cards (equal to bestOf(cards).score). */
export function bestScore(cards: ArrayLike<number>, n = cards.length): number {
  if (n === 5) return score5(cards);
  let best = 0;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            pick[0] = cards[a];
            pick[1] = cards[b];
            pick[2] = cards[c];
            pick[3] = cards[d];
            pick[4] = cards[e];
            const s = score5(pick);
            if (s > best) best = s;
          }
  return best;
}

export const categoryOfScore = (score: number): Cat5 => Math.floor(score / B5) as Cat5;

/** Category of the best hand of 5–7 cards. */
export const categoryOf = (cards: Card[]): Cat5 => categoryOfScore(bestScore(cards));
