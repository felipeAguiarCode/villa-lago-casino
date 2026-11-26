import { freshDeck, type Card } from '../../core/cards';
import type { Hand5 } from '../../core/eval5';
import { cryptoRng, shuffle, type Rng } from '../../core/rng';
import { SHOWDOWN, type ShowdownConfig } from './config';
import { finalHand } from './hands';
import { payoutFor, type RoundResult } from './payout';
import { monteCarloStrategy, type PickStrategy, type SeatView } from './strategy';

/**
 * Showdown Poker round: both sides hold four cards and confirm one per turn, each confirmation
 * refilled from the deck, until five cards are confirmed. Betting windows after turns 2 and 4
 * (Check, Double, Fold), then a showdown at 1:1 on the total bet.
 */
export type SdState =
  | 'BETTING'
  | 'DEALING'
  | 'PLAYER_SELECTION'
  | 'PLAYER_REFILL'
  | 'DEALER_SELECTION'
  | 'DEALER_REFILL'
  | 'TURN_COMPLETE'
  | 'FIRST_BETTING_ROUND'
  | 'FINAL_BETTING_ROUND'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'FOLDED'
  | 'ROUND_COMPLETE';

export type BetDecision = 'check' | 'double' | 'fold';

/**
 * Events for the presentation layer. Dealer cards never carry their identity until `reveal`.
 * `slot` is the index in the side's available hand.
 */
export type SdEvent =
  | { t: 'state'; state: SdState }
  | { t: 'deal'; who: 'player'; slot: number; card: Card }
  | { t: 'deal'; who: 'dealer'; slot: number }
  | { t: 'commit'; who: 'player'; slot: number; index: number; card: Card }
  | { t: 'commit'; who: 'dealer'; slot: number; index: number }
  | { t: 'refill'; who: 'player'; slot: number; card: Card }
  | { t: 'refill'; who: 'dealer'; slot: number }
  | { t: 'window'; n: 1 | 2 }
  | { t: 'bet'; n: 1 | 2; decision: BetDecision; added: number; total: number }
  | { t: 'reveal'; cards: Card[] }
  | { t: 'showdown'; player: Hand5; dealer: Hand5; result: 'win' | 'lose' | 'push' }
  | { t: 'settle'; result: RoundResult; total: number; payout: number };

export type SdErrorCode = 'state' | 'card' | 'ante' | 'funds' | 'limit' | 'deck' | 'strategy';

export class ShowdownError extends Error {
  constructor(
    readonly code: SdErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

/** The chip bank the round debits and credits (the casino wallet). */
export interface Bank {
  canAfford(n: number): boolean;
  debit(n: number): void;
  credit(n: number): void;
}

export interface RoundOptions {
  bank: Bank;
  /** Dealer's selection strategy. Default: Monte Carlo. */
  dealer?: PickStrategy;
  rng?: Rng;
  cfg?: Partial<ShowdownConfig>;
  /** Cards dealt first, in order (tests); the rest of the deck is shuffled behind them. */
  stack?: Card[];
  id?: string;
}

interface Seat {
  available: Card[];
  final: Card[];
  seen: Card[];
}

const WINDOW_STATE = { 1: 'FIRST_BETTING_ROUND', 2: 'FINAL_BETTING_ROUND' } as const;
let roundSeq = 0;

export class ShowdownRound {
  readonly id: string;
  readonly cfg: ShowdownConfig;
  state: SdState = 'BETTING';
  /** Every state the round went through, in order. */
  readonly history: SdState[] = ['BETTING'];
  /** Completed selection turns (0..5). */
  turn = 0;
  ante = 0;
  totalBet = 0;
  readonly decisions: [BetDecision | null, BetDecision | null] = [null, null];
  playerHand: Hand5 | null = null;
  result: RoundResult | null = null;
  payout = 0;

  private deck: Card[] = [];
  private pos = 0;
  private readonly p: Seat = { available: [], final: [], seen: [] };
  private readonly d: Seat = { available: [], final: [], seen: [] };
  private dealerHandValue: Hand5 | null = null;
  private settled = false;
  private evs: SdEvent[] = [];
  private readonly bank: Bank;
  private readonly dealerPick: PickStrategy;
  private readonly rng: Rng;
  private readonly stack: Card[];

  constructor(o: RoundOptions) {
    this.bank = o.bank;
    this.rng = o.rng ?? cryptoRng;
    this.dealerPick = o.dealer ?? monteCarloStrategy();
    this.cfg = { ...SHOWDOWN, ...o.cfg };
    this.stack = o.stack ?? [];
    this.id = o.id ?? `sd-${Date.now().toString(36)}-${(++roundSeq).toString(36)}`;
  }

  // ---------------------------------------------------------------- public read-only state
  get playerAvailable(): readonly Card[] {
    return this.p.available;
  }
  get playerFinal(): readonly Card[] {
    return this.p.final;
  }
  /** Dealer card counts: the only dealer information shown before the showdown. */
  get dealerCounts() {
    return { available: this.d.available.length, final: this.d.final.length };
  }
  /** The dealer's confirmed cards, available only once revealed. */
  get dealerFinal(): readonly Card[] | null {
    return this.revealed ? this.d.final : null;
  }
  get dealerHand(): Hand5 | null {
    return this.revealed ? this.dealerHandValue : null;
  }
  get remainingCards() {
    return this.deck.length - this.pos;
  }
  get inWindow(): 1 | 2 | 0 {
    return this.state === 'FIRST_BETTING_ROUND' ? 1 : this.state === 'FINAL_BETTING_ROUND' ? 2 : 0;
  }
  private get revealed() {
    return this.history.includes('SHOWDOWN');
  }

  /** What the player knows (for the hint lamp): the same kind of view the dealer gets. */
  playerView(): SeatView {
    return viewOf(this.p, this.cfg.finalCards);
  }

  canSelect(card: Card) {
    return this.state === 'PLAYER_SELECTION' && this.p.available.includes(card);
  }

  /** '' when Double is allowed now, otherwise the reason. */
  doubleBlock(): '' | SdErrorCode {
    if (!this.inWindow) return 'state';
    if (this.totalBet * 2 > this.cfg.maxTotal) return 'limit';
    if (!this.bank.canAfford(this.totalBet)) return 'funds';
    return '';
  }

  // ---------------------------------------------------------------- actions
  /** Takes the Ante, builds and shuffles the deck and deals four cards each, alternately. */
  start(ante: number): SdEvent[] {
    this.expect('BETTING');
    if (!Number.isInteger(ante) || ante < this.cfg.minAnte || ante > this.cfg.maxAnte) throw new ShowdownError('ante', `ante must be ${this.cfg.minAnte}..${this.cfg.maxAnte}`);
    if (!this.bank.canAfford(ante)) throw new ShowdownError('funds', 'insufficient balance for the ante');
    this.bank.debit(ante);
    this.ante = ante;
    this.totalBet = ante;
    this.to('DEALING');
    this.deck = this.buildDeck();
    this.pos = 0;
    for (let i = 0; i < this.cfg.handCards; i++) {
      const pc = this.draw(this.p);
      this.p.available.push(pc);
      this.emit({ t: 'deal', who: 'player', slot: i, card: pc });
      this.d.available.push(this.draw(this.d));
      this.emit({ t: 'deal', who: 'dealer', slot: i });
    }
    this.turn = 0;
    this.to('PLAYER_SELECTION');
    return this.flush();
  }

  /** The player confirms one available card; the dealer then confirms one of its own. */
  select(card: Card): SdEvent[] {
    this.expect('PLAYER_SELECTION');
    const slot = this.p.available.indexOf(card);
    if (slot < 0) throw new ShowdownError('card', 'that card is not in your available hand');
    const last = this.turn + 1 >= this.cfg.finalCards;
    this.p.available.splice(slot, 1);
    this.p.final.push(card);
    this.emit({ t: 'commit', who: 'player', slot, index: this.p.final.length - 1, card });
    if (!last) {
      this.to('PLAYER_REFILL');
      const c = this.draw(this.p);
      this.p.available.splice(slot, 0, c);
      this.emit({ t: 'refill', who: 'player', slot, card: c });
    }
    this.to('DEALER_SELECTION');
    const di = this.dealerPick(viewOf(this.d, this.cfg.finalCards));
    if (!Number.isInteger(di) || di < 0 || di >= this.d.available.length) throw new ShowdownError('strategy', 'dealer strategy returned an invalid card');
    const dc = this.d.available.splice(di, 1)[0];
    this.d.final.push(dc);
    this.emit({ t: 'commit', who: 'dealer', slot: di, index: this.d.final.length - 1 });
    if (!last) {
      this.to('DEALER_REFILL');
      this.d.available.splice(di, 0, this.draw(this.d));
      this.emit({ t: 'refill', who: 'dealer', slot: di });
    }
    this.to('TURN_COMPLETE');
    this.turn++;
    const w = this.cfg.windows.indexOf(this.turn);
    if (w === 0 || w === 1) {
      this.to(WINDOW_STATE[(w + 1) as 1 | 2]);
      this.emit({ t: 'window', n: (w + 1) as 1 | 2 });
    } else if (this.turn >= this.cfg.finalCards) this.showdown();
    else this.to('PLAYER_SELECTION');
    return this.flush();
  }

  check(): SdEvent[] {
    const n = this.window();
    this.decisions[n - 1] = 'check';
    this.emit({ t: 'bet', n, decision: 'check', added: 0, total: this.totalBet });
    this.to('PLAYER_SELECTION');
    return this.flush();
  }

  /** Doubles the total bet: the added amount equals everything already committed. */
  double(): SdEvent[] {
    const n = this.window();
    const block = this.doubleBlock();
    if (block === 'limit') throw new ShowdownError('limit', 'the total bet would pass the table limit');
    if (block === 'funds') throw new ShowdownError('funds', 'insufficient balance to double');
    const added = this.totalBet;
    this.bank.debit(added);
    this.totalBet += added;
    this.decisions[n - 1] = 'double';
    this.emit({ t: 'bet', n, decision: 'double', added, total: this.totalBet });
    this.to('PLAYER_SELECTION');
    return this.flush();
  }

  /** Gives up: everything bet is lost; no more cards, no showdown. */
  fold(): SdEvent[] {
    const n = this.window();
    this.decisions[n - 1] = 'fold';
    this.emit({ t: 'bet', n, decision: 'fold', added: 0, total: this.totalBet });
    this.to('FOLDED');
    this.settle('fold');
    return this.flush();
  }

  // ---------------------------------------------------------------- internals
  private showdown() {
    this.to('SHOWDOWN');
    this.emit({ t: 'reveal', cards: [...this.d.final] });
    const ph = finalHand(this.p.final);
    const dh = finalHand(this.d.final);
    this.playerHand = ph;
    this.dealerHandValue = dh;
    const cmp = ph.score - dh.score;
    const result = cmp > 0 ? 'win' : cmp < 0 ? 'lose' : 'push';
    this.emit({ t: 'showdown', player: ph, dealer: dh, result });
    this.to('SETTLEMENT');
    this.settle(result);
  }

  /** The only place chips are paid back. Runs once per round. */
  private settle(result: RoundResult) {
    if (this.settled) throw new ShowdownError('state', 'round already settled');
    this.settled = true;
    this.result = result;
    this.payout = payoutFor(result, this.totalBet, this.cfg.winPays);
    if (this.payout > 0) this.bank.credit(this.payout);
    this.emit({ t: 'settle', result, total: this.totalBet, payout: this.payout });
    this.to('ROUND_COMPLETE');
  }

  private window(): 1 | 2 {
    const n = this.inWindow;
    if (!n) throw new ShowdownError('state', `no betting window in state ${this.state}`);
    return n;
  }

  private buildDeck(): Card[] {
    const st = this.stack;
    if (new Set(st).size !== st.length || st.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) throw new ShowdownError('deck', 'stacked cards must be unique cards 0..51');
    const rest = shuffle(
      freshDeck(1).filter((c) => !st.includes(c)),
      this.rng,
    );
    return [...st, ...rest];
  }

  private draw(seat: Seat): Card {
    if (this.pos >= this.deck.length) throw new ShowdownError('deck', 'deck exhausted');
    const c = this.deck[this.pos++];
    seat.seen.push(c);
    return c;
  }

  private expect(s: SdState) {
    if (this.state !== s) throw new ShowdownError('state', `expected ${s}, round is ${this.state}`);
  }

  private to(s: SdState) {
    this.state = s;
    this.history.push(s);
    this.emit({ t: 'state', state: s });
  }

  private emit(e: SdEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }
}

/** A frozen copy of what one seat knows. */
function viewOf(s: Seat, finalCards: number): SeatView {
  return Object.freeze({
    available: Object.freeze([...s.available]),
    final: Object.freeze([...s.final]),
    picksLeft: finalCards - s.final.length,
    seen: Object.freeze([...s.seen]),
  });
}
