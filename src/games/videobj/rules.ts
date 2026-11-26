import type { Card, Shoe } from '../../core/cards';
import { bjValue, handValue, isNatural, RULES, type BJHand, type Outcome } from '../blackjack/rules';

/**
 * Multi-hand video blackjack: one dealer hand in the middle against several player hands that are
 * played one after another. Dealer stands on all 17s, peeks for blackjack, one split per hand,
 * no insurance.
 */
export type MEvent =
  | { t: 'dealer'; card: Card; faceUp: boolean }
  | { t: 'peek'; dealerBJ: boolean }
  | { t: 'seat'; seat: number }
  | { t: 'card'; seat: number; hand: number; card: Card }
  | { t: 'split'; seat: number; hand: number; bet: number }
  | { t: 'double'; seat: number; hand: number; added: number }
  | { t: 'active'; seat: number; hand: number }
  | { t: 'handDone'; seat: number; hand: number; reason: 'bust' | '21' | 'stand' | 'double' | 'blackjack' | 'splitAces' }
  | { t: 'seatDone'; seat: number }
  | { t: 'flipHole' }
  | { t: 'dealerDone'; total: number; bust: boolean }
  | { t: 'settle'; results: { seat: number; hand: number; outcome: Outcome; bet: number; ret: number }[] };

export const MAX_SEATS = 5;
/** Hands per seat after splitting. */
const SPLIT_HANDS = 2;

export class MultiHandRound {
  dealer: Card[] = [];
  seats: BJHand[][];
  seat = 0;
  hand = 0;
  phase: 'player' | 'done' = 'player';
  holeRevealed = false;
  private evs: MEvent[] = [];

  constructor(
    private shoe: Shoe,
    bets: number[],
  ) {
    this.seats = bets.map((bet) => [{ cards: [], bet, doubled: false, done: false, fromSplit: false, splitAces: false }]);
  }

  get current(): BJHand {
    return this.seats[this.seat][this.hand];
  }

  get dealerUp(): Card {
    return this.dealer[0];
  }

  private emit(e: MEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }

  private give(seat: number, hand: number) {
    const card = this.shoe.draw();
    this.seats[seat][hand].cards.push(card);
    this.emit({ t: 'card', seat, hand, card });
  }

  /** Deals a seat's first two cards; a natural is finished right away. */
  private openSeat(s: number) {
    this.seat = s;
    this.hand = 0;
    this.emit({ t: 'seat', seat: s });
    this.give(s, 0);
    this.give(s, 0);
    const h = this.seats[s][0];
    if (isNatural(h.cards)) {
      h.done = true;
      this.emit({ t: 'handDone', seat: s, hand: 0, reason: 'blackjack' });
    }
  }

  start(): MEvent[] {
    for (const faceUp of [true, false]) {
      const card = this.shoe.draw();
      this.dealer.push(card);
      this.emit({ t: 'dealer', card, faceUp });
    }
    if (bjValue(this.dealerUp) >= 10) {
      const dealerBJ = isNatural(this.dealer);
      this.emit({ t: 'peek', dealerBJ });
      if (dealerBJ) {
        // every hand is dealt and settled against the dealer's blackjack
        for (let s = 0; s < this.seats.length; s++) {
          this.openSeat(s);
          this.seats[s][0].done = true;
          this.emit({ t: 'seatDone', seat: s });
        }
        this.revealHole();
        this.settle();
        return this.flush();
      }
    }
    this.openSeat(0);
    this.advance();
    return this.flush();
  }

  actions(balance: number) {
    const none = { hit: false, stand: false, double: false, split: false };
    if (this.phase !== 'player') return none;
    const h = this.current;
    if (!h || h.done) return none;
    const two = h.cards.length === 2;
    return {
      hit: !h.splitAces,
      stand: true,
      double: two && !h.splitAces && balance >= h.bet,
      split: two && bjValue(h.cards[0]) === bjValue(h.cards[1]) && this.seats[this.seat].length < SPLIT_HANDS && balance >= h.bet,
    };
  }

  hit(): MEvent[] {
    if (this.phase !== 'player') return [];
    this.give(this.seat, this.hand);
    const v = handValue(this.current.cards).total;
    if (v > 21) this.finish('bust');
    else if (v === 21) this.finish('21');
    return this.flush();
  }

  stand(): MEvent[] {
    if (this.phase !== 'player') return [];
    this.finish('stand');
    return this.flush();
  }

  double(): MEvent[] {
    if (this.phase !== 'player') return [];
    const h = this.current;
    const added = h.bet;
    h.bet *= 2;
    h.doubled = true;
    this.emit({ t: 'double', seat: this.seat, hand: this.hand, added });
    this.give(this.seat, this.hand);
    this.finish(handValue(h.cards).total > 21 ? 'bust' : 'double');
    return this.flush();
  }

  split(): MEvent[] {
    if (this.phase !== 'player') return [];
    const hands = this.seats[this.seat];
    const h = this.current;
    const moved = h.cards.pop()!;
    const aces = bjValue(moved) === 11;
    hands.splice(this.hand + 1, 0, { cards: [moved], bet: h.bet, doubled: false, done: false, fromSplit: true, splitAces: aces });
    h.fromSplit = true;
    h.splitAces = aces;
    this.emit({ t: 'split', seat: this.seat, hand: this.hand, bet: h.bet });
    this.give(this.seat, this.hand);
    if (aces) {
      h.done = true;
      this.emit({ t: 'handDone', seat: this.seat, hand: this.hand, reason: 'splitAces' });
      this.advance();
    } else if (handValue(h.cards).total === 21) this.finish('21');
    else this.emit({ t: 'active', seat: this.seat, hand: this.hand });
    return this.flush();
  }

  private finish(reason: 'bust' | '21' | 'stand' | 'double') {
    this.current.done = true;
    this.emit({ t: 'handDone', seat: this.seat, hand: this.hand, reason });
    this.advance();
  }

  /** Next unfinished hand of this seat, then the next seat, then the dealer. */
  private advance() {
    for (;;) {
      const hands = this.seats[this.seat];
      let found = false;
      for (let i = 0; i < hands.length; i++) {
        const h = hands[i];
        if (h.done) continue;
        this.hand = i;
        if (h.cards.length === 1) {
          this.give(this.seat, i);
          if (h.splitAces) {
            h.done = true;
            this.emit({ t: 'handDone', seat: this.seat, hand: i, reason: 'splitAces' });
            continue;
          }
          if (handValue(h.cards).total === 21) {
            h.done = true;
            this.emit({ t: 'handDone', seat: this.seat, hand: i, reason: '21' });
            continue;
          }
        }
        this.emit({ t: 'active', seat: this.seat, hand: i });
        found = true;
        break;
      }
      if (found) return;
      this.emit({ t: 'seatDone', seat: this.seat });
      if (this.seat + 1 >= this.seats.length) break;
      this.openSeat(this.seat + 1);
    }
    this.playDealer();
  }

  private revealHole() {
    if (this.holeRevealed) return;
    this.holeRevealed = true;
    this.emit({ t: 'flipHole' });
  }

  private playDealer() {
    this.revealHole();
    const live = this.seats.flat().some((h) => handValue(h.cards).total <= 21 && !(isNatural(h.cards) && !h.fromSplit));
    if (live) {
      while (handValue(this.dealer).total < 17) {
        const card = this.shoe.draw();
        this.dealer.push(card);
        this.emit({ t: 'dealer', card, faceUp: true });
      }
    }
    const dv = handValue(this.dealer).total;
    this.emit({ t: 'dealerDone', total: dv, bust: dv > 21 });
    this.settle();
  }

  private settle() {
    this.phase = 'done';
    const dealerBJ = isNatural(this.dealer);
    const dv = handValue(this.dealer).total;
    const results: { seat: number; hand: number; outcome: Outcome; bet: number; ret: number }[] = [];
    this.seats.forEach((hands, s) =>
      hands.forEach((h, i) => {
        const pv = handValue(h.cards).total;
        const natural = !h.fromSplit && isNatural(h.cards);
        let outcome: Outcome;
        let ret: number;
        if (pv > 21) {
          outcome = 'bust';
          ret = 0;
        } else if (dealerBJ) {
          outcome = natural ? 'push' : 'lose';
          ret = natural ? h.bet : 0;
        } else if (natural) {
          outcome = 'blackjack';
          ret = h.bet * (1 + RULES.blackjackPays);
        } else if (dv > 21 || pv > dv) {
          outcome = 'win';
          ret = h.bet * 2;
        } else if (pv === dv) {
          outcome = 'push';
          ret = h.bet;
        } else {
          outcome = 'lose';
          ret = 0;
        }
        h.outcome = outcome;
        h.ret = ret;
        results.push({ seat: s, hand: i, outcome, bet: h.bet, ret });
      }),
    );
    this.emit({ t: 'settle', results });
  }
}
