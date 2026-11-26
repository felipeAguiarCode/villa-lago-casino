import type { Card } from '../../../core/cards';
import { RoundDeck } from '../shared/deck';
import { BaseRound, returnFor, RoundError, type BetLimits, type Outcome, type RoundEnv, type Snapshot } from '../shared/round';
import { comparePife, evaluatePife, type PifeOptions, type PifeResult } from './engine';
import { pifeDiscardPlan } from './strategy';

/** Pife Express: six cards each, up to two replaced, two groups of three to win. */
export const PIFE_EXPRESS_RULES = {
  version: 'pife-express/1',
  deckCount: 1,
  deckType: 'STANDARD_52' as const,
  handSize: 6,
  maxDiscardCount: 2,
  maxGroups: 2,
  cardsPerGroup: 3,
  sequencesEnabled: true,
  setsEnabled: true,
  jokersEnabled: false,
  aceLowEnabled: true,
  aceHighEnabled: true,
  deadwoodTieBreakerEnabled: true,
  winPayout: 1,
  tiePolicy: 'PUSH' as const,
  ante: { min: 5, max: 500, step: 5 } as BetLimits,
  /** Replacement combinations the dealer looks at (null = all of them, exactly). */
  dealerSamples: null as number | null,
};
export type PifeExpressRules = typeof PIFE_EXPRESS_RULES;
export const MODE_PIFE_EXPRESS = 'PIFE_EXPRESS';

export type PifeClass = 'NO_SET' | 'SINGLE_SET' | 'PERFECT_PIFE';
export const pifeExpressClass = (r: PifeResult): PifeClass => (r.groups.length >= 2 ? 'PERFECT_PIFE' : r.groups.length === 1 ? 'SINGLE_SET' : 'NO_SET');

export type PeState =
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

const T: Record<PeState, readonly PeState[]> = {
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

export interface PeData {
  player: number[];
  dealer: number[];
  playerDiscards: { index: number; uid: number; replacement: number }[];
  dealerDiscards: { index: number; uid: number; replacement: number }[];
  playerEval: PifeResult | null;
  dealerEval: PifeResult | null;
}

export const pifeOptions = (r: { setsEnabled: boolean; sequencesEnabled: boolean; aceLowEnabled: boolean; aceHighEnabled: boolean; maxGroups: number }): PifeOptions => ({
  setsEnabled: r.setsEnabled,
  sequencesEnabled: r.sequencesEnabled,
  aceLowEnabled: r.aceLowEnabled,
  aceHighEnabled: r.aceHighEnabled,
  maxGroups: r.maxGroups,
});

export class PifeExpressRound extends BaseRound<PeState, PeData> {
  constructor(
    env: RoundEnv,
    readonly r: PifeExpressRules = PIFE_EXPRESS_RULES,
    snap?: Snapshot<PeState, PeData>,
    private stack?: Card[],
  ) {
    super(env, MODE_PIFE_EXPRESS, r.version, T, 'INITIALIZING', { player: [], dealer: [], playerDiscards: [], dealerDiscards: [], playerEval: null, dealerEval: null }, snap);
    if (snap) this.checkCards([this.data.player, this.data.dealer, [...this.data.playerDiscards, ...this.data.dealerDiscards].map((d) => d.uid)]);
    else this.go('ANTE_BETTING');
  }

  get playerCards(): Card[] {
    return this.data.player.map(this.cardOf);
  }
  get dealerCards(): Card[] | null {
    return this.trail.includes('SHOWDOWN') ? this.data.dealer.map(this.cardOf) : null;
  }
  get dealerDiscardCount() {
    return this.data.dealerDiscards.length;
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

  /** Stand (no indices) or replace up to two cards; then the dealer's draw, the showdown and the pay. */
  draw(discards: number[]) {
    this.expect('DRAW_DECISION');
    const uniq = [...new Set(discards)].sort((a, b) => a - b);
    if (uniq.length !== discards.length || uniq.length > this.r.maxDiscardCount || uniq.some((i) => !Number.isInteger(i) || i < 0 || i >= this.data.player.length)) throw new RoundError('action', `discard up to ${this.r.maxDiscardCount} different cards`);
    this.go('DEALER_DRAW_DECISION');
    // decided from the dealer's own cards only, before any replacement is dealt
    const plan = pifeDiscardPlan(this.data.dealer.map(this.cardOf), this.r.maxDiscardCount, this.r.maxGroups, pifeOptions(this.r), this.rng, this.r.dealerSamples ?? undefined);
    this.go('REPLACING_CARDS');
    for (const i of uniq) {
      const uid = this.data.player[i];
      const replacement = this.dealCard();
      this.data.player[i] = replacement;
      this.data.playerDiscards.push({ index: i, uid, replacement });
    }
    for (const i of plan.discard) {
      const uid = this.data.dealer[i];
      const replacement = this.dealCard();
      this.data.dealer[i] = replacement;
      this.data.dealerDiscards.push({ index: i, uid, replacement });
    }
    this.go('SHOWDOWN');
    this.go('EVALUATING');
    const o = pifeOptions(this.r);
    this.data.playerEval = evaluatePife(this.playerCards, o);
    this.data.dealerEval = evaluatePife(this.data.dealer.map(this.cardOf), o);
    let cmp = comparePife(this.data.playerEval, this.data.dealerEval);
    if (!this.r.deadwoodTieBreakerEnabled && this.data.playerEval.groups.length === this.data.dealerEval.groups.length) cmp = 0;
    const out: Outcome = cmp > 0 ? 'WIN' : cmp < 0 ? 'LOSS' : 'PUSH';
    this.go('SETTLEMENT');
    this.settle(out, { ANTE: { state: out, returned: returnFor(out, this.bets[0].amount, this.r.winPayout) } });
    this.go('ROUND_COMPLETE');
    this.archive();
  }

  get playerEval() {
    return this.data.playerEval;
  }
  get dealerEval() {
    return this.data.dealerEval;
  }
}
