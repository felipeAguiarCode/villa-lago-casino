import { rankOf, type Card } from '../../core/cards';

/** Casino War: 6 decks, aces high, tie bet 10:1, going to war wins the raise only. */
export const WAR = { decks: 6, minBet: 5, maxBet: 2500, tiePays: 10 };

export type WarChoice = 'war' | 'surrender';

/** -1 dealer higher, 0 tie, 1 player higher. */
export const cmpWar = (p: Card, d: Card) => Math.sign(rankOf(p) - rankOf(d));

export interface WarResult {
  ret: { bet: number; tie: number; war: number };
  outcome: 'win' | 'lose' | 'surrender' | 'warWin' | 'warLose';
}

/**
 * Settles a round. `war` holds the war cards when the player went to war.
 * The war raise equals the original bet; on a war win (or war tie) the raise pays 1:1 and the bet pushes.
 */
export function settleWar(p: Card, d: Card, bets: { bet: number; tie: number }, choice?: WarChoice, war?: { p: Card; d: Card }): WarResult {
  const c = cmpWar(p, d);
  const ret = { bet: 0, tie: 0, war: 0 };
  if (c === 0 && bets.tie > 0) ret.tie = bets.tie * (1 + WAR.tiePays);
  if (c > 0) {
    ret.bet = bets.bet * 2;
    return { ret, outcome: 'win' };
  }
  if (c < 0) return { ret, outcome: 'lose' };
  if (choice === 'surrender' || !war) {
    ret.bet = bets.bet / 2;
    return { ret, outcome: 'surrender' };
  }
  if (cmpWar(war.p, war.d) >= 0) {
    ret.bet = bets.bet;
    ret.war = bets.bet * 2;
    return { ret, outcome: 'warWin' };
  }
  return { ret, outcome: 'warLose' };
}
