import type { Card } from '../../../core/cards';
import { shuffle } from '../../../core/rng';
import { RoundDeck } from '../shared/deck';
import { BaseRound, returnFor, RoundError, type BetLimits, type Outcome, type RoundEnv, type Snapshot } from '../shared/round';
import { baseStrength, compareCards, isManilha, manilhaRank, strength } from './engine';

/** Manilha Draw: three cards each, Play or Fold, one optional draw, then three duels. */
export const MANILHA_DRAW_RULES = {
  version: 'manilha-draw/1',
  deckCount: 1,
  deckType: 'TRUCO_40' as const,
  playerHandSize: 3,
  dealerHandSize: 3,
  dynamicManilhaEnabled: true,
  maxDiscardCount: 1,
  dealerMaxDiscardCount: 1,
  /** The dealer replaces its weakest card when it is not a manilha and its base strength is at most this. */
  dealerDiscardThreshold: 4,
  duelCount: 3,
  playBetMultiplier: 1,
  winPayout: 1,
  tiePolicy: 'PUSH' as const,
  ante: { min: 5, max: 500, step: 5 } as BetLimits,
};
export type ManilhaDrawRules = typeof MANILHA_DRAW_RULES;
export const MODE_MANILHA_DRAW = 'MANILHA_DRAW';

export type MdState =
  | 'INITIALIZING'
  | 'ANTE_BETTING'
  | 'DEALING'
  | 'PLAY_DECISION'
  | 'FOLDED'
  | 'DRAW_DECISION'
  | 'REPLACING_CARDS'
  | 'PREPARING_DUELS'
  | 'SELECTING_CARD'
  | 'RESOLVING_DUEL'
  | 'EVALUATING'
  | 'SETTLEMENT'
  | 'ROUND_COMPLETE'
  | 'ROUND_VOIDED';

const T: Record<MdState, readonly MdState[]> = {
  INITIALIZING: ['ANTE_BETTING'],
  ANTE_BETTING: ['DEALING'],
  DEALING: ['PLAY_DECISION'],
  PLAY_DECISION: ['FOLDED', 'DRAW_DECISION'],
  DRAW_DECISION: ['REPLACING_CARDS'],
  REPLACING_CARDS: ['PREPARING_DUELS'],
  PREPARING_DUELS: ['SELECTING_CARD'],
  SELECTING_CARD: ['RESOLVING_DUEL'],
  RESOLVING_DUEL: ['SELECTING_CARD', 'EVALUATING'],
  EVALUATING: ['SETTLEMENT'],
  SETTLEMENT: ['ROUND_COMPLETE'],
  FOLDED: ['SETTLEMENT'],
  ROUND_COMPLETE: [],
  ROUND_VOIDED: [],
};

export type DuelResult = 'PLAYER_WIN' | 'DEALER_WIN' | 'DRAW';

export interface MdData {
  vira: number | null;
  player: number[];
  dealer: number[];
  playerDiscard: { index: number; uid: number; replacement: number } | null;
  dealerDiscard: { index: number; uid: number; replacement: number } | null;
  /** Dealer cards in the order they will be played (fixed before the first duel). */
  dealerOrder: number[];
  /** Player card indices still unplayed. */
  duels: { player: number; dealer: number; result: DuelResult }[];
}

/**
 * Dealer draw policy: its weakest card (first one on equal strength) is replaced when it is not a
 * manilha and its base strength is at most the threshold. Only the dealer's own cards are used.
 */
export function dealerDiscardIndex(hand: Card[], manilha: number, threshold: number): number | null {
  let weakest = 0;
  for (let i = 1; i < hand.length; i++) if (strength(hand[i], manilha) < strength(hand[weakest], manilha)) weakest = i;
  const c = hand[weakest];
  return !isManilha(c, manilha) && baseStrength(c) <= threshold ? weakest : null;
}

/** Overall result from the duel tally: more duels won wins. */
export function duelOutcome(duels: DuelResult[]): 'WIN' | 'LOSS' | 'PUSH' {
  const p = duels.filter((d) => d === 'PLAYER_WIN').length;
  const d = duels.filter((x) => x === 'DEALER_WIN').length;
  return p > d ? 'WIN' : p < d ? 'LOSS' : 'PUSH';
}

export class ManilhaDrawRound extends BaseRound<MdState, MdData> {
  constructor(
    env: RoundEnv,
    readonly r: ManilhaDrawRules = MANILHA_DRAW_RULES,
    snap?: Snapshot<MdState, MdData>,
    private stack?: Card[],
  ) {
    super(env, MODE_MANILHA_DRAW, r.version, T, 'INITIALIZING', { vira: null, player: [], dealer: [], playerDiscard: null, dealerDiscard: null, dealerOrder: [], duels: [] }, snap);
    if (snap) this.checkCards([this.data.vira === null ? [] : [this.data.vira], this.data.player, this.data.dealer, this.discarded()]);
    else this.go('ANTE_BETTING');
  }

  private discarded() {
    return [this.data.playerDiscard?.uid, this.data.dealerDiscard?.uid].filter((u): u is number => u !== undefined);
  }

  get vira(): Card | null {
    return this.data.vira === null ? null : this.cardOf(this.data.vira);
  }
  get manilha(): number | null {
    return this.vira === null ? null : manilhaRank(this.vira);
  }
  get playerCards(): Card[] {
    return this.data.player.map(this.cardOf);
  }
  /** The dealer's cards are only exposed one by one through the duels, and all at the end. */
  get dealerCards(): Card[] | null {
    return this.state === 'ROUND_COMPLETE' ? this.data.dealer.map(this.cardOf) : null;
  }
  get playedIndices(): number[] {
    return this.data.duels.map((d) => d.player);
  }

  /** Takes the Ante and deals: Vira, then three cards each, alternately. */
  placeAnte(amount: number) {
    this.expect('ANTE_BETTING');
    this.takeBet('ANTE', amount, this.r.ante);
    this.go('DEALING');
    this.newDeck(() => (this.stack ? RoundDeck.stacked(this.r.deckType, this.r.deckCount, this.stack, this.rng) : RoundDeck.shuffled(this.r.deckType, this.r.deckCount, this.rng)));
    this.data.vira = this.dealCard();
    for (let i = 0; i < this.r.playerHandSize; i++) {
      this.data.player.push(this.dealCard());
      this.data.dealer.push(this.dealCard());
    }
    this.go('PLAY_DECISION');
  }

  fold() {
    this.expect('PLAY_DECISION');
    this.go('FOLDED');
    this.go('SETTLEMENT');
    this.settle('FOLD', { ANTE: { state: 'FOLD', returned: 0 } });
    this.go('ROUND_COMPLETE');
    this.archive();
  }

  /** Play bet equal to the Ante; rejected when the wallet can't cover it. */
  play() {
    this.expect('PLAY_DECISION');
    const ante = this.bets[0].amount;
    const amount = ante * this.r.playBetMultiplier;
    if (!this.bank.canAfford(amount)) throw new RoundError('funds', 'not enough chips for Play');
    this.takeBet('PLAY', amount, { min: amount, max: amount, step: 1 });
    this.go('DRAW_DECISION');
  }

  /**
   * The player keeps the hand (null) or replaces one card. The dealer decides from its own cards
   * first; then the player's replacement is dealt, then the dealer's.
   */
  draw(discardIndex: number | null) {
    this.expect('DRAW_DECISION');
    if (discardIndex !== null && (!Number.isInteger(discardIndex) || discardIndex < 0 || discardIndex >= this.data.player.length)) throw new RoundError('action', 'invalid card to discard');
    const m = this.manilha!;
    const dealerIdx = dealerDiscardIndex(this.data.dealer.map(this.cardOf), m, this.r.dealerDiscardThreshold);
    this.go('REPLACING_CARDS');
    if (discardIndex !== null) {
      const uid = this.data.player[discardIndex];
      const replacement = this.dealCard();
      this.data.player[discardIndex] = replacement;
      this.data.playerDiscard = { index: discardIndex, uid, replacement };
    }
    if (dealerIdx !== null) {
      const uid = this.data.dealer[dealerIdx];
      const replacement = this.dealCard();
      this.data.dealer[dealerIdx] = replacement;
      this.data.dealerDiscard = { index: dealerIdx, uid, replacement };
    }
    this.go('PREPARING_DUELS');
    // the dealer's playing order is drawn at random once and never changes
    this.data.dealerOrder = shuffle([...this.data.dealer], this.rng);
    this.go('SELECTING_CARD');
  }

  /** Plays one of the player's remaining cards against the dealer's next card. */
  duel(playerIndex: number): { player: Card; dealer: Card; result: DuelResult } {
    this.expect('SELECTING_CARD');
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= this.data.player.length || this.playedIndices.includes(playerIndex)) throw new RoundError('action', 'that card is not available');
    this.go('RESOLVING_DUEL');
    const k = this.data.duels.length;
    const pc = this.cardOf(this.data.player[playerIndex]);
    const dc = this.cardOf(this.data.dealerOrder[k]);
    const cmp = compareCards(pc, dc, this.manilha!);
    const result: DuelResult = cmp > 0 ? 'PLAYER_WIN' : cmp < 0 ? 'DEALER_WIN' : 'DRAW';
    this.data.duels.push({ player: playerIndex, dealer: this.data.dealerOrder[k], result });
    if (this.data.duels.length < this.r.duelCount) this.go('SELECTING_CARD');
    else this.finish();
    return { player: pc, dealer: dc, result };
  }

  private finish() {
    this.go('EVALUATING');
    const o = duelOutcome(this.data.duels.map((d) => d.result));
    this.go('SETTLEMENT');
    const pay = (stake: number) => ({ state: o as Outcome, returned: returnFor(o, stake, this.r.winPayout) });
    this.settle(o, Object.fromEntries(this.bets.map((b) => [b.name, pay(b.amount)])));
    this.go('ROUND_COMPLETE');
    this.archive();
  }
}
