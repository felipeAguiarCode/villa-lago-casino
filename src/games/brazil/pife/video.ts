import type { Card } from '../../../core/cards';
import type { Rng } from '../../../core/rng';
import { RoundDeck } from '../shared/deck';
import { BaseRound, RoundError, type BetLimits, type RoundEnv, type Snapshot } from '../shared/round';
import { evaluatePife, type PifeResult } from './engine';
import { pifeOptions } from './express';

/** Video Pife: nine cards, up to three replaced, paid by the number of groups (no dealer hand). */
export const VIDEO_PIFE_RULES = {
  version: 'video-pife/1',
  deckCount: 1,
  deckType: 'STANDARD_52' as const,
  handSize: 9,
  maxDiscardCount: 3,
  maxGroups: 3,
  cardsPerGroup: 3,
  dealerHandEnabled: false,
  jokersEnabled: false,
  setsEnabled: true,
  sequencesEnabled: true,
  aceLowEnabled: true,
  aceHighEnabled: true,
  noSetReturnMultiplier: 0,
  singleSetReturnMultiplier: 0,
  doubleSetReturnMultiplier: 2,
  perfectPifeReturnMultiplier: 7,
  bet: { min: 5, max: 500, step: 5 } as BetLimits,
};
export type VideoPifeRules = typeof VIDEO_PIFE_RULES;
export const MODE_VIDEO_PIFE = 'VIDEO_PIFE';

export type VpClass = 'NO_SET' | 'SINGLE_SET' | 'DOUBLE_SET' | 'PERFECT_PIFE';
export const VP_CLASSES: VpClass[] = ['NO_SET', 'SINGLE_SET', 'DOUBLE_SET', 'PERFECT_PIFE'];
export const vpClass = (r: PifeResult): VpClass => VP_CLASSES[Math.min(3, r.groups.length)];

/** Total return multiplier (stake included) of a class: only the best class is paid. */
export function vpReturnMultiplier(c: VpClass, r: VideoPifeRules = VIDEO_PIFE_RULES): number {
  return { NO_SET: r.noSetReturnMultiplier, SINGLE_SET: r.singleSetReturnMultiplier, DOUBLE_SET: r.doubleSetReturnMultiplier, PERFECT_PIFE: r.perfectPifeReturnMultiplier }[c];
}

export type VpState = 'INITIALIZING' | 'BETTING' | 'DEALING' | 'HOLD_DECISION' | 'DRAWING' | 'EVALUATING' | 'PAYTABLE_RESOLUTION' | 'SETTLEMENT' | 'ROUND_COMPLETE' | 'ROUND_VOIDED';

const T: Record<VpState, readonly VpState[]> = {
  INITIALIZING: ['BETTING'],
  BETTING: ['DEALING'],
  DEALING: ['HOLD_DECISION'],
  HOLD_DECISION: ['DRAWING'],
  DRAWING: ['EVALUATING'],
  EVALUATING: ['PAYTABLE_RESOLUTION'],
  PAYTABLE_RESOLUTION: ['SETTLEMENT'],
  SETTLEMENT: ['ROUND_COMPLETE'],
  ROUND_COMPLETE: [],
  ROUND_VOIDED: [],
};

export interface VpData {
  hand: number[];
  discards: { index: number; uid: number; replacement: number }[];
  eval: PifeResult | null;
  cls: VpClass | null;
}

export class VideoPifeRound extends BaseRound<VpState, VpData> {
  constructor(
    env: RoundEnv,
    readonly r: VideoPifeRules = VIDEO_PIFE_RULES,
    snap?: Snapshot<VpState, VpData>,
    private stack?: Card[],
  ) {
    super(env, MODE_VIDEO_PIFE, r.version, T, 'INITIALIZING', { hand: [], discards: [], eval: null, cls: null }, snap);
    if (snap) this.checkCards([this.data.hand, this.data.discards.map((d) => d.uid)]);
    else this.go('BETTING');
  }

  get cards(): Card[] {
    return this.data.hand.map(this.cardOf);
  }
  get result() {
    return this.data.eval;
  }
  get cls() {
    return this.data.cls;
  }

  placeBet(amount: number) {
    this.expect('BETTING');
    this.takeBet('BET', amount, this.r.bet);
    this.go('DEALING');
    this.newDeck(() => (this.stack ? RoundDeck.stacked(this.r.deckType, this.r.deckCount, this.stack, this.rng) : RoundDeck.shuffled(this.r.deckType, this.r.deckCount, this.rng)));
    for (let i = 0; i < this.r.handSize; i++) this.data.hand.push(this.dealCard());
    this.go('HOLD_DECISION');
  }

  /** Keeps between six and nine cards: the discards (0..3) are replaced in one go, free. */
  draw(discards: number[]) {
    this.expect('HOLD_DECISION');
    const uniq = [...new Set(discards)].sort((a, b) => a - b);
    if (uniq.length !== discards.length || uniq.length > this.r.maxDiscardCount || uniq.some((i) => !Number.isInteger(i) || i < 0 || i >= this.data.hand.length)) throw new RoundError('action', `replace up to ${this.r.maxDiscardCount} different cards`);
    this.go('DRAWING');
    for (const i of uniq) {
      const uid = this.data.hand[i];
      const replacement = this.dealCard();
      this.data.hand[i] = replacement;
      this.data.discards.push({ index: i, uid, replacement });
    }
    this.go('EVALUATING');
    this.data.eval = evaluatePife(this.cards, pifeOptions(this.r));
    this.data.cls = vpClass(this.data.eval);
    this.go('PAYTABLE_RESOLUTION');
    const stake = this.bets[0].amount;
    const returned = stake * vpReturnMultiplier(this.data.cls, this.r);
    this.go('SETTLEMENT');
    const state = returned > stake ? 'WIN' : returned === stake ? 'PUSH' : 'LOSS';
    this.settle(state, { BET: { state, returned } });
    this.go('ROUND_COMPLETE');
    this.archive();
  }
}

/**
 * Hold advice by Monte Carlo (hint lamp and simulations): the discard set (0..3) with the best
 * estimated return. Uses the same evaluator; an estimate, not a proven optimum.
 */
export function videoPifeAdvice(hand: Card[], rng: Rng, samples = 120, r: VideoPifeRules = VIDEO_PIFE_RULES): { discard: number[]; ev: number } {
  const o = pifeOptions(r);
  const seen = new Set(hand);
  const unknown: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) unknown.push(c);
  const start = evaluatePife(hand, o);
  // cards already in groups are never worth throwing
  const loose = start.residual;
  let best = { discard: [] as number[], ev: vpReturnMultiplier(vpClass(start), r) };
  const tryIt = (d: number[]) => {
    const keep = hand.filter((_, i) => !d.includes(i));
    let sum = 0;
    for (let s = 0; s < samples; s++) {
      const pool = [...unknown];
      const extra = d.map(() => pool.splice(rng(pool.length), 1)[0]);
      sum += vpReturnMultiplier(vpClass(evaluatePife([...keep, ...extra], o)), r);
    }
    const ev = sum / samples;
    if (ev > best.ev + 1e-9) best = { discard: d, ev };
  };
  const pool = loose.length >= 3 ? loose : hand.map((_, i) => i);
  for (let a = 0; a < pool.length; a++) {
    tryIt([pool[a]]);
    for (let b = a + 1; b < pool.length; b++) {
      tryIt([pool[a], pool[b]]);
      for (let c = b + 1; c < pool.length; c++) tryIt([pool[a], pool[b], pool[c]]);
    }
  }
  return best;
}
