import { rankOf, type Card, type Shoe } from '../../core/cards';

export const BAC = { decks: 8, minBet: 5, maxBet: 5000, bankerCommission: 0.05, tiePays: 8 };

export const bacValue = (c: Card) => {
  const r = rankOf(c);
  return r === 14 ? 1 : r >= 10 ? 0 : r;
};

export const total = (cards: Card[]) => cards.reduce((a, c) => a + bacValue(c), 0) % 10;

/** Banker's third-card rule given the player's third card value (null when the player stood). */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThird !== 8;
  if (bankerTotal === 4) return playerThird >= 2 && playerThird <= 7;
  if (bankerTotal === 5) return playerThird >= 4 && playerThird <= 7;
  if (bankerTotal === 6) return playerThird === 6 || playerThird === 7;
  return false;
}

export type Side = 'player' | 'banker';
export type Winner = 'player' | 'banker' | 'tie';

export interface BacDeal {
  /** Order of dealing: P, B, P, B, then optional thirds. */
  steps: { side: Side; card: Card }[];
  player: Card[];
  banker: Card[];
  winner: Winner;
  natural: boolean;
}

export function playCoup(shoe: Shoe): BacDeal {
  const player: Card[] = [];
  const banker: Card[] = [];
  const steps: { side: Side; card: Card }[] = [];
  const give = (side: Side) => {
    const c = shoe.draw();
    (side === 'player' ? player : banker).push(c);
    steps.push({ side, card: c });
  };
  give('player');
  give('banker');
  give('player');
  give('banker');
  let pt = total(player);
  let bt = total(banker);
  const natural = pt >= 8 || bt >= 8;
  if (!natural) {
    let third: number | null = null;
    if (pt <= 5) {
      give('player');
      third = bacValue(player[2]);
      pt = total(player);
    }
    if (bankerDraws(bt, third)) {
      give('banker');
      bt = total(banker);
    }
  }
  const winner: Winner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
  return { steps, player, banker, winner, natural };
}

/** Amount returned per bet (stake + winnings). Player/Banker push on a tie. */
export function settleBac(winner: Winner, bets: { player: number; banker: number; tie: number }) {
  const ret = { player: 0, banker: 0, tie: 0 };
  if (winner === 'tie') {
    ret.player = bets.player;
    ret.banker = bets.banker;
    ret.tie = bets.tie * (1 + BAC.tiePays);
  } else if (winner === 'player') ret.player = bets.player * 2;
  else ret.banker = bets.banker * (2 - BAC.bankerCommission);
  return ret;
}
