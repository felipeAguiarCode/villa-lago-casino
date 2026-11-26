import { rankOf, type Card, type Shoe } from '../../core/cards';

/** Blackjack point value of a card (aces count 11 here; hand logic demotes them). */
export const bjValue = (c: Card) => {
  const r = rankOf(c);
  return r === 14 ? 11 : r >= 10 ? 10 : r;
};

export interface HandValue {
  total: number;
  soft: boolean;
}

export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = bjValue(c);
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isNatural = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

/** "7/17" style label used by the total bubbles. */
export function totalLabel(cards: Card[]): string {
  if (!cards.length) return '';
  const v = handValue(cards);
  if (v.soft && v.total < 21) return `${v.total - 10}/${v.total}`;
  return String(v.total);
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  outcome?: Outcome;
  /** Amount returned to the player (stake + winnings). */
  ret?: number;
}

export type BJEvent =
  | { t: 'deal'; to: 'player'; hand: number; card: Card }
  | { t: 'deal'; to: 'dealer'; card: Card; faceUp: boolean }
  | { t: 'flipHole' }
  | { t: 'split'; from: number; to: number; bet: number }
  | { t: 'double'; hand: number; added: number }
  | { t: 'active'; hand: number }
  | { t: 'handDone'; hand: number; reason: 'bust' | '21' | 'stand' | 'double' | 'blackjack' | 'splitAces' }
  | { t: 'insuranceOffer'; evenMoney: boolean }
  | { t: 'insurance'; taken: boolean; amount: number }
  | { t: 'peek'; dealerBJ: boolean }
  | { t: 'dealerDone'; total: number; bust: boolean }
  | { t: 'settle'; hands: { hand: number; outcome: Outcome; bet: number; ret: number }[]; insuranceRet: number };

export type Phase = 'insurance' | 'player' | 'done';

export interface Actions {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}

export const RULES = {
  decks: 6,
  maxHands: 4,
  blackjackPays: 1.5,
  dealerStandsSoft17: true,
  minBet: 5,
  maxBet: 5000,
};

/**
 * One round of blackjack. Pure logic: every call returns the events that happened,
 * in order, so the view can animate them. Money moves are implied by the events
 * (the view debits the wallet on double/split/insurance and credits on settle).
 */
export class BlackjackRound {
  phase: Phase = 'player';
  hands: BJHand[];
  dealer: Card[] = [];
  active = 0;
  insuranceBet = 0;
  holeRevealed = false;
  private evs: BJEvent[] = [];

  /** Hands allowed after splitting (video machines allow a single split). */
  readonly maxHands: number;

  constructor(
    private shoe: Shoe,
    bet: number,
    opts: { maxHands?: number } = {},
  ) {
    this.maxHands = opts.maxHands ?? RULES.maxHands;
    this.hands = [{ cards: [], bet, doubled: false, done: false, fromSplit: false, splitAces: false }];
  }

  get dealerUp(): Card {
    return this.dealer[0];
  }

  get current(): BJHand {
    return this.hands[this.active];
  }

  private emit(e: BJEvent) {
    this.evs.push(e);
  }

  private flush(): BJEvent[] {
    const out = this.evs;
    this.evs = [];
    return out;
  }

  private dealPlayer(h: number) {
    const card = this.shoe.draw();
    this.hands[h].cards.push(card);
    this.emit({ t: 'deal', to: 'player', hand: h, card });
  }

  private dealDealer(faceUp: boolean) {
    const card = this.shoe.draw();
    this.dealer.push(card);
    this.emit({ t: 'deal', to: 'dealer', card, faceUp });
  }

  start(): BJEvent[] {
    this.dealPlayer(0);
    this.dealDealer(true);
    this.dealPlayer(0);
    this.dealDealer(false);

    const up = bjValue(this.dealerUp);
    if (up === 11) {
      this.phase = 'insurance';
      this.emit({ t: 'insuranceOffer', evenMoney: isNatural(this.hands[0].cards) });
      return this.flush();
    }
    if (up === 10 && this.peek()) return this.flush();
    this.afterPeek();
    return this.flush();
  }

  /** Resolves the insurance / even-money offer. */
  insurance(take: boolean): BJEvent[] {
    if (this.phase !== 'insurance') return [];
    this.insuranceBet = take ? this.hands[0].bet / 2 : 0;
    this.emit({ t: 'insurance', taken: take, amount: this.insuranceBet });
    this.phase = 'player';
    if (!this.peek()) this.afterPeek();
    return this.flush();
  }

  /** Dealer checks the hole card. Returns true when the round ended on a dealer blackjack. */
  private peek(): boolean {
    const dealerBJ = isNatural(this.dealer);
    this.emit({ t: 'peek', dealerBJ });
    if (dealerBJ) {
      this.revealHole();
      this.hands[0].done = true;
      this.settle();
      return true;
    }
    return false;
  }

  private afterPeek() {
    const h = this.hands[0];
    if (isNatural(h.cards)) {
      h.done = true;
      this.emit({ t: 'handDone', hand: 0, reason: 'blackjack' });
      this.revealHole();
      this.settle();
      return;
    }
    this.phase = 'player';
    this.emit({ t: 'active', hand: 0 });
  }

  actions(balance: number): Actions {
    const none = { hit: false, stand: false, double: false, split: false };
    if (this.phase !== 'player') return none;
    const h = this.current;
    if (!h || h.done) return none;
    const two = h.cards.length === 2;
    return {
      hit: !h.splitAces,
      stand: true,
      double: two && !h.splitAces && balance >= h.bet,
      split:
        two &&
        bjValue(h.cards[0]) === bjValue(h.cards[1]) &&
        this.hands.length < this.maxHands &&
        !(h.splitAces || (h.fromSplit && rankOf(h.cards[0]) === 14)) &&
        balance >= h.bet,
    };
  }

  hit(): BJEvent[] {
    if (this.phase !== 'player') return [];
    const i = this.active;
    this.dealPlayer(i);
    const v = handValue(this.hands[i].cards).total;
    if (v > 21) this.finishHand('bust');
    else if (v === 21) this.finishHand('21');
    return this.flush();
  }

  stand(): BJEvent[] {
    if (this.phase !== 'player') return [];
    this.finishHand('stand');
    return this.flush();
  }

  double(): BJEvent[] {
    if (this.phase !== 'player') return [];
    const i = this.active;
    const h = this.hands[i];
    const added = h.bet;
    h.bet *= 2;
    h.doubled = true;
    this.emit({ t: 'double', hand: i, added });
    this.dealPlayer(i);
    this.finishHand(handValue(h.cards).total > 21 ? 'bust' : 'double');
    return this.flush();
  }

  split(): BJEvent[] {
    if (this.phase !== 'player') return [];
    const i = this.active;
    const h = this.hands[i];
    const moved = h.cards.pop()!;
    const aces = rankOf(moved) === 14;
    const nh: BJHand = { cards: [moved], bet: h.bet, doubled: false, done: false, fromSplit: true, splitAces: aces };
    h.fromSplit = true;
    h.splitAces = aces;
    this.hands.splice(i + 1, 0, nh);
    this.emit({ t: 'split', from: i, to: i + 1, bet: nh.bet });
    this.dealPlayer(i);
    if (aces) {
      h.done = true;
      this.emit({ t: 'handDone', hand: i, reason: 'splitAces' });
      this.dealPlayer(i + 1);
      nh.done = true;
      this.emit({ t: 'handDone', hand: i + 1, reason: 'splitAces' });
      this.advance();
    } else if (handValue(h.cards).total === 21) {
      this.finishHand('21');
    }
    return this.flush();
  }

  private finishHand(reason: 'bust' | '21' | 'stand' | 'double') {
    const i = this.active;
    this.hands[i].done = true;
    this.emit({ t: 'handDone', hand: i, reason });
    this.advance();
  }

  /** Moves to the next unfinished hand, or plays the dealer when none remain. */
  private advance() {
    for (let i = 0; i < this.hands.length; i++) {
      const h = this.hands[i];
      if (h.done) continue;
      this.active = i;
      this.emit({ t: 'active', hand: i });
      if (h.cards.length === 1) {
        this.dealPlayer(i);
        if (handValue(h.cards).total === 21) {
          h.done = true;
          this.emit({ t: 'handDone', hand: i, reason: '21' });
          continue;
        }
      }
      return;
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
    const live = this.hands.some((h) => handValue(h.cards).total <= 21);
    if (live) {
      for (;;) {
        const v = handValue(this.dealer);
        const stand = v.total > 17 || (v.total === 17 && (!v.soft || RULES.dealerStandsSoft17));
        if (stand) break;
        this.dealDealer(true);
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
    const out: { hand: number; outcome: Outcome; bet: number; ret: number }[] = [];
    this.hands.forEach((h, i) => {
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
      out.push({ hand: i, outcome, bet: h.bet, ret });
    });
    const insuranceRet = this.insuranceBet > 0 && dealerBJ ? this.insuranceBet * 3 : 0;
    this.emit({ t: 'settle', hands: out, insuranceRet });
  }
}
