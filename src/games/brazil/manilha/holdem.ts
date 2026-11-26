import type { Card } from '../../../core/cards';
import { RoundDeck } from '../shared/deck';
import { BaseRound, returnFor, RoundError, type BetLimits, type Outcome, type RoundEnv, type Snapshot } from '../shared/round';
import { bestThree, compareStrengths, manilhaRank, type ThreeCardHand } from './engine';

/** Manilha Hold'em: two hole cards each, three board cards, best three with at least one hole card. */
export const MANILHA_HOLDEM_RULES = {
  version: 'manilha-holdem/1',
  deckCount: 1,
  deckType: 'TRUCO_40' as const,
  holeCardCount: 2,
  communityCardCount: 3,
  finalHandSize: 3,
  minimumHoleCards: 1,
  dynamicManilhaEnabled: true,
  communityCardsBeforePlay: 1,
  playBetMultiplier: 1,
  winPayout: 1,
  tiePolicy: 'PUSH' as const,
  ante: { min: 5, max: 500, step: 5 } as BetLimits,
};
export type ManilhaHoldemRules = typeof MANILHA_HOLDEM_RULES;
export const MODE_MANILHA_HOLDEM = 'MANILHA_HOLDEM';

export type MhState =
  | 'INITIALIZING'
  | 'ANTE_BETTING'
  | 'DEALING'
  | 'FIRST_BOARD_CARD'
  | 'PLAY_DECISION'
  | 'FOLDED'
  | 'SECOND_BOARD_CARD'
  | 'THIRD_BOARD_CARD'
  | 'SHOWDOWN'
  | 'EVALUATING'
  | 'SETTLEMENT'
  | 'ROUND_COMPLETE'
  | 'ROUND_VOIDED';

const T: Record<MhState, readonly MhState[]> = {
  INITIALIZING: ['ANTE_BETTING'],
  ANTE_BETTING: ['DEALING'],
  DEALING: ['FIRST_BOARD_CARD'],
  FIRST_BOARD_CARD: ['PLAY_DECISION'],
  PLAY_DECISION: ['FOLDED', 'SECOND_BOARD_CARD'],
  SECOND_BOARD_CARD: ['THIRD_BOARD_CARD'],
  THIRD_BOARD_CARD: ['SHOWDOWN'],
  SHOWDOWN: ['EVALUATING'],
  EVALUATING: ['SETTLEMENT'],
  SETTLEMENT: ['ROUND_COMPLETE'],
  FOLDED: ['SETTLEMENT'],
  ROUND_COMPLETE: [],
  ROUND_VOIDED: [],
};

export interface MhData {
  vira: number | null;
  player: number[];
  dealer: number[];
  board: number[];
  playerBest: { cards: number[]; strengths: number[] } | null;
  dealerBest: { cards: number[]; strengths: number[] } | null;
}

export class ManilhaHoldemRound extends BaseRound<MhState, MhData> {
  constructor(
    env: RoundEnv,
    readonly r: ManilhaHoldemRules = MANILHA_HOLDEM_RULES,
    snap?: Snapshot<MhState, MhData>,
    private stack?: Card[],
  ) {
    super(env, MODE_MANILHA_HOLDEM, r.version, T, 'INITIALIZING', { vira: null, player: [], dealer: [], board: [], playerBest: null, dealerBest: null }, snap);
    if (snap) this.checkCards([this.data.vira === null ? [] : [this.data.vira], this.data.player, this.data.dealer, this.data.board]);
    else this.go('ANTE_BETTING');
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
  get board(): Card[] {
    return this.data.board.map(this.cardOf);
  }
  get dealerCards(): Card[] | null {
    return this.trail.includes('SHOWDOWN') ? this.data.dealer.map(this.cardOf) : null;
  }

  /** Ante, then Vira, two hole cards each (alternately) and the first board card. */
  placeAnte(amount: number) {
    this.expect('ANTE_BETTING');
    this.takeBet('ANTE', amount, this.r.ante);
    this.go('DEALING');
    this.newDeck(() => (this.stack ? RoundDeck.stacked(this.r.deckType, this.r.deckCount, this.stack, this.rng) : RoundDeck.shuffled(this.r.deckType, this.r.deckCount, this.rng)));
    this.data.vira = this.dealCard();
    for (let i = 0; i < this.r.holeCardCount; i++) {
      this.data.player.push(this.dealCard());
      this.data.dealer.push(this.dealCard());
    }
    this.go('FIRST_BOARD_CARD');
    for (let i = 0; i < this.r.communityCardsBeforePlay; i++) this.data.board.push(this.dealCard());
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

  /** Play (1× Ante), then the last board cards, the showdown and the settlement. */
  play() {
    this.expect('PLAY_DECISION');
    const amount = this.bets[0].amount * this.r.playBetMultiplier;
    if (!this.bank.canAfford(amount)) throw new RoundError('funds', 'not enough chips for Play');
    this.takeBet('PLAY', amount, { min: amount, max: amount, step: 1 });
    this.go('SECOND_BOARD_CARD');
    this.data.board.push(this.dealCard());
    this.go('THIRD_BOARD_CARD');
    this.data.board.push(this.dealCard());
    this.go('SHOWDOWN');
    this.go('EVALUATING');
    const m = this.manilha!;
    const ph = bestThree(this.playerCards, this.board, m, this.r.minimumHoleCards);
    const dh = bestThree(this.data.dealer.map(this.cardOf), this.board, m, this.r.minimumHoleCards);
    const uids = (h: ThreeCardHand, own: number[]) => h.cards.map((c) => [...own, ...this.data.board].find((u) => this.cardOf(u) === c)!);
    this.data.playerBest = { cards: uids(ph, this.data.player), strengths: ph.strengths };
    this.data.dealerBest = { cards: uids(dh, this.data.dealer), strengths: dh.strengths };
    const cmp = compareStrengths(ph.strengths, dh.strengths);
    const o: Outcome = cmp > 0 ? 'WIN' : cmp < 0 ? 'LOSS' : 'PUSH';
    this.go('SETTLEMENT');
    this.settle(o, Object.fromEntries(this.bets.map((b) => [b.name, { state: o, returned: returnFor(o, b.amount, this.r.winPayout) }])));
    this.go('ROUND_COMPLETE');
    this.archive();
  }

  get playerBest(): ThreeCardHand | null {
    const b = this.data.playerBest;
    return b ? { cards: b.cards.map(this.cardOf), strengths: b.strengths, holeUsed: 0 } : null;
  }
  get dealerBest(): ThreeCardHand | null {
    const b = this.data.dealerBest;
    return b ? { cards: b.cards.map(this.cardOf), strengths: b.strengths, holeUsed: 0 } : null;
  }
}
