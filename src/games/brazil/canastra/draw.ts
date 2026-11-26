import type { Card } from '../../../core/cards';
import { RoundDeck } from '../shared/deck';
import { BaseRound, returnFor, RoundError, type BetLimits, type Outcome, type RoundEnv, type Snapshot } from '../shared/round';
import { bestSequence, canastraDealerDiscards, compareSequences, type CanastraClass, type CanastraOptions, type CanastraSequence } from './engine';

/** Canastra Draw: nine cards each from two decks, up to three replaced, best single sequence wins. */
export const CANASTRA_DRAW_RULES = {
  version: 'canastra-draw/1',
  deckCount: 2,
  deckType: 'STANDARD_52' as const,
  handSize: 9,
  maxDiscardCount: 3,
  minimumSequenceSize: 3,
  minimumCanastraSize: 7,
  wildRank: 2,
  maxSubstituteWildCards: 1,
  naturalTwoEnabled: true,
  aceLowEnabled: true,
  aceHighEnabled: true,
  circularSequencesEnabled: false,
  cleanCanastraPriority: true,
  shortSequencePayout: 1,
  longSequencePayout: 1,
  dirtyCanastraPayout: 2,
  cleanCanastraPayout: 3,
  tiePolicy: 'PUSH' as const,
  ante: { min: 5, max: 500, step: 5 } as BetLimits,
};
export type CanastraDrawRules = typeof CANASTRA_DRAW_RULES;
export const MODE_CANASTRA_DRAW = 'CANASTRA_DRAW';

export const canastraOptions = (r: CanastraDrawRules): CanastraOptions => ({
  minimumSequenceSize: r.minimumSequenceSize,
  minimumCanastraSize: r.minimumCanastraSize,
  wildRank: r.wildRank,
  maxSubstituteWildCards: r.maxSubstituteWildCards,
  naturalTwoEnabled: r.naturalTwoEnabled,
  aceLowEnabled: r.aceLowEnabled,
  aceHighEnabled: r.aceHighEnabled,
  cleanCanastraPriority: r.cleanCanastraPriority,
});

/** Net payout of a win, by the player's winning class. */
export function canastraPayout(c: CanastraClass, r: CanastraDrawRules = CANASTRA_DRAW_RULES): number {
  return { NO_SEQUENCE: r.shortSequencePayout, SHORT_SEQUENCE: r.shortSequencePayout, LONG_SEQUENCE: r.longSequencePayout, DIRTY_CANASTRA: r.dirtyCanastraPayout, CLEAN_CANASTRA: r.cleanCanastraPayout }[c];
}

export type CdState =
  | 'INITIALIZING'
  | 'ANTE_BETTING'
  | 'DEALING'
  | 'DRAW_DECISION'
  | 'DEALER_DRAW_DECISION'
  | 'REPLACING_CARDS'
  | 'SHOWDOWN'
  | 'EVALUATING'
  | 'SETTLEMENT'
  | 'ROUND_COMPLETE'
  | 'ROUND_VOIDED';

const T: Record<CdState, readonly CdState[]> = {
  INITIALIZING: ['ANTE_BETTING'],
  ANTE_BETTING: ['DEALING'],
  DEALING: ['DRAW_DECISION'],
  DRAW_DECISION: ['DEALER_DRAW_DECISION'],
  DEALER_DRAW_DECISION: ['REPLACING_CARDS'],
  REPLACING_CARDS: ['SHOWDOWN'],
  SHOWDOWN: ['EVALUATING'],
  EVALUATING: ['SETTLEMENT'],
  SETTLEMENT: ['ROUND_COMPLETE'],
  ROUND_COMPLETE: [],
  ROUND_VOIDED: [],
};

export interface CdData {
  player: number[];
  dealer: number[];
  playerDiscards: { index: number; uid: number; replacement: number }[];
  dealerDiscards: { index: number; uid: number; replacement: number }[];
  playerBest: CanastraSequence | null;
  dealerBest: CanastraSequence | null;
}

export class CanastraDrawRound extends BaseRound<CdState, CdData> {
  constructor(
    env: RoundEnv,
    readonly r: CanastraDrawRules = CANASTRA_DRAW_RULES,
    snap?: Snapshot<CdState, CdData>,
    private stack?: Card[],
  ) {
    super(env, MODE_CANASTRA_DRAW, r.version, T, 'INITIALIZING', { player: [], dealer: [], playerDiscards: [], dealerDiscards: [], playerBest: null, dealerBest: null }, snap);
    if (r.circularSequencesEnabled) throw new RoundError('integrity', 'circular sequences are not supported');
    if (snap) this.checkCards([this.data.player, this.data.dealer, [...this.data.playerDiscards, ...this.data.dealerDiscards].map((d) => d.uid)]);
    else this.go('ANTE_BETTING');
  }

  get playerCards(): Card[] {
    return this.data.player.map(this.cardOf);
  }
  get playerUids(): number[] {
    return [...this.data.player];
  }
  get dealerCards(): Card[] | null {
    return this.trail.includes('SHOWDOWN') ? this.data.dealer.map(this.cardOf) : null;
  }
  get dealerDiscardCount() {
    return this.data.dealerDiscards.length;
  }
  get playerBest() {
    return this.data.playerBest;
  }
  get dealerBest() {
    return this.data.dealerBest;
  }

  placeAnte(amount: number) {
    this.expect('ANTE_BETTING');
    this.takeBet('ANTE', amount, this.r.ante);
    this.go('DEALING');
    this.newDeck(() => (this.stack ? RoundDeck.stacked(this.r.deckType, this.r.deckCount, this.stack, this.rng) : RoundDeck.shuffled(this.r.deckType, this.r.deckCount, this.rng)));
    for (let i = 0; i < this.r.handSize; i++) {
      this.data.player.push(this.dealCard());
      this.data.dealer.push(this.dealCard());
    }
    this.go('DRAW_DECISION');
  }

  draw(discards: number[]) {
    this.expect('DRAW_DECISION');
    const uniq = [...new Set(discards)].sort((a, b) => a - b);
    if (uniq.length !== discards.length || uniq.length > this.r.maxDiscardCount || uniq.some((i) => !Number.isInteger(i) || i < 0 || i >= this.data.player.length)) throw new RoundError('action', `discard up to ${this.r.maxDiscardCount} different cards`);
    this.go('DEALER_DRAW_DECISION');
    const o = canastraOptions(this.r);
    const dealerPick = canastraDealerDiscards(this.data.dealer.map(this.cardOf), this.r.maxDiscardCount, o);
    this.go('REPLACING_CARDS');
    for (const i of uniq) {
      const uid = this.data.player[i];
      const replacement = this.dealCard();
      this.data.player[i] = replacement;
      this.data.playerDiscards.push({ index: i, uid, replacement });
    }
    for (const i of dealerPick) {
      const uid = this.data.dealer[i];
      const replacement = this.dealCard();
      this.data.dealer[i] = replacement;
      this.data.dealerDiscards.push({ index: i, uid, replacement });
    }
    this.go('SHOWDOWN');
    this.go('EVALUATING');
    this.data.playerBest = bestSequence(this.playerCards, o);
    this.data.dealerBest = bestSequence(this.data.dealer.map(this.cardOf), o);
    const cmp = compareSequences(this.data.playerBest, this.data.dealerBest, o);
    const out: Outcome = cmp > 0 ? 'WIN' : cmp < 0 ? 'LOSS' : 'PUSH';
    this.go('SETTLEMENT');
    const payout = canastraPayout(this.data.playerBest.cls, this.r);
    this.settle(out, { ANTE: { state: out, returned: returnFor(out, this.bets[0].amount, payout) } });
    this.go('ROUND_COMPLETE');
    this.archive();
  }
}
