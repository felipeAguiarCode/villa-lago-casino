import type { Card } from '../../core/cards';
import { cryptoRng, type Rng } from '../../core/rng';
import { BetSlip } from './bets';
import { evaluateBet, mainResult, refundBet, type BetOutcome, type MainResult } from './evaluate';
import { DtHistory, type CardRecord, type KeyValueStore, type PendingRound, type RoundRecord } from './history';
import { ALL_BETS, makeRuleset, MODE_ID, type BetId, type DragonTigerRuleset } from './ruleset';
import { settleOutcomes, toCents, toChips, type DtSettlement } from './settlement';
import { CardShoe, type CardInstance } from './shoe';

/**
 * Dragon Tiger table: the round state machine. The dealer only runs the shoe, deals, reveals and
 * settles; outcomes depend on the cards alone.
 */
export type DtState =
  | 'INITIALIZING'
  | 'BETTING'
  | 'BETTING_LOCKED'
  | 'BURNING_CARD'
  | 'DEALING'
  | 'REVEALING_DRAGON'
  | 'REVEALING_TIGER'
  | 'EVALUATING'
  | 'SETTLING'
  | 'ROUND_COMPLETE'
  | 'SHUFFLING'
  | 'ROUND_VOIDED';

const NEXT: Record<DtState, DtState[]> = {
  INITIALIZING: ['BETTING'],
  BETTING: ['BETTING_LOCKED'],
  BETTING_LOCKED: ['BURNING_CARD', 'DEALING', 'ROUND_VOIDED'],
  BURNING_CARD: ['DEALING', 'ROUND_VOIDED'],
  DEALING: ['REVEALING_DRAGON', 'ROUND_VOIDED'],
  REVEALING_DRAGON: ['REVEALING_TIGER', 'ROUND_VOIDED'],
  REVEALING_TIGER: ['EVALUATING', 'ROUND_VOIDED'],
  EVALUATING: ['SETTLING', 'ROUND_VOIDED'],
  SETTLING: ['ROUND_COMPLETE'],
  ROUND_COMPLETE: ['INITIALIZING', 'SHUFFLING'],
  SHUFFLING: ['INITIALIZING'],
  ROUND_VOIDED: ['INITIALIZING', 'SHUFFLING'],
};

export class DtError extends Error {
  constructor(
    readonly code: 'state' | 'funds' | 'shoe',
    msg: string,
  ) {
    super(msg);
  }
}

/** The casino wallet (amounts in chips). */
export interface Bank {
  readonly balance: number;
  canAfford(n: number): boolean;
  debit(n: number): void;
  credit(n: number): void;
}

export interface TableOptions {
  bank: Bank;
  rng?: Rng;
  ruleset?: Partial<DragonTigerRuleset>;
  store: KeyValueStore;
  tableId?: string;
}

interface RoundData {
  id: string;
  slip: BetSlip;
  burn: CardInstance | null;
  dragon: CardInstance | null;
  tiger: CardInstance | null;
  result: MainResult | null;
  outcomes: BetOutcome[] | null;
  settlement: DtSettlement | null;
  balanceBefore: number;
  date: string;
}

let roundSeq = 0;
const rec = (c: CardInstance | null): CardRecord | null => (c ? { uid: c.uid, card: c.card } : null);

export class DragonTigerTable {
  state: DtState = 'INITIALIZING';
  /** States of the current round, in order. */
  readonly trail: DtState[] = [];
  readonly r: DragonTigerRuleset;
  readonly shoe: CardShoe;
  readonly log: DtHistory;
  readonly tableId: string;
  /** A round found unfinished at start-up and settled or voided then. */
  recovered: RoundRecord | null = null;
  private round!: RoundData;
  private readonly bank: Bank;

  constructor(o: TableOptions) {
    this.bank = o.bank;
    this.r = makeRuleset(o.ruleset);
    this.tableId = o.tableId ?? 'dt-1';
    this.log = new DtHistory(o.store);
    // every card is shuffled before the first round
    this.shoe = new CardShoe(this.r.deckCount, o.rng ?? cryptoRng);
    this.recovered = this.recover();
    this.begin();
  }

  // ---------------------------------------------------------------- read-only state
  get roundId() {
    return this.round.id;
  }
  get bets(): [BetId, number][] {
    return this.round.slip.entries;
  }
  get totalBet() {
    return this.round.slip.total;
  }
  get burnCard(): Card | null {
    return this.round.burn?.card ?? null;
  }
  /** The Dragon card, once revealed. */
  get dragon(): Card | null {
    return this.reached('REVEALING_DRAGON') ? this.round.dragon!.card : null;
  }
  /** The Tiger card, once revealed. */
  get tiger(): Card | null {
    return this.reached('REVEALING_TIGER') ? this.round.tiger!.card : null;
  }
  get result() {
    return this.round.result;
  }
  get outcomes() {
    return this.round.outcomes;
  }
  get settlement() {
    return this.round.settlement;
  }
  private reached(s: DtState) {
    return this.trail.includes(s);
  }

  // ---------------------------------------------------------------- betting
  placeBet(id: BetId, chips: number) {
    this.expect('BETTING');
    this.round.slip.add(id, chips, this.bank.balance);
  }

  removeBet(id: BetId, chips: number) {
    this.expect('BETTING');
    this.round.slip.remove(id, chips);
  }

  clearBets() {
    this.expect('BETTING');
    this.round.slip.clear();
  }

  /** Message of the first problem with the current bets, or '' (nothing is changed). */
  check(): string {
    return this.round.slip.problem(this.bank.balance)?.message ?? '';
  }

  /** Validates again, takes the chips once and fixes the bets for the round. */
  lockBets() {
    this.expect('BETTING');
    const slip = this.round.slip;
    slip.lock(this.bank.balance);
    const total = slip.total;
    if (!this.bank.canAfford(total)) throw new DtError('funds', 'not enough chips');
    this.round.balanceBefore = toCents(this.bank.balance);
    this.bank.debit(total);
    this.go('BETTING_LOCKED');
    this.persist();
  }

  // ---------------------------------------------------------------- dealing
  burn(): Card {
    if (!this.r.burnCardEnabled) throw new DtError('state', 'burn card is disabled');
    this.go('BURNING_CARD');
    this.round.burn = this.shoe.draw();
    this.persist();
    return this.round.burn.card;
  }

  /** First card to Dragon, second to Tiger. */
  deal() {
    if (this.r.burnCardEnabled && this.state === 'BETTING_LOCKED') throw new DtError('state', 'burn a card first');
    this.go('DEALING');
    this.round.dragon = this.shoe.draw();
    this.round.tiger = this.shoe.draw();
    this.persist();
  }

  revealDragon(): Card {
    this.go('REVEALING_DRAGON');
    return this.round.dragon!.card;
  }

  revealTiger(): Card {
    this.go('REVEALING_TIGER');
    return this.round.tiger!.card;
  }

  evaluate(): BetOutcome[] {
    this.go('EVALUATING');
    const d = this.round.dragon!.card;
    const t = this.round.tiger!.card;
    this.round.result = mainResult(d, t);
    this.round.outcomes = this.round.slip.entries.map(([id, chips]) => evaluateBet(id, toCents(chips), d, t, this.r));
    return this.round.outcomes;
  }

  /** Pays the round, once. */
  settle(): DtSettlement {
    this.go('SETTLING');
    const s = settleOutcomes(this.round.outcomes!, this.round.balanceBefore);
    this.round.settlement = s;
    this.pay(s.totalReturn);
    this.log.record(this.record('ROUND_COMPLETE', s));
    this.log.clearPending();
    this.go('ROUND_COMPLETE');
    return s;
  }

  /** Cancels a round that cannot finish: every committed chip comes back, once. */
  voidRound(): DtSettlement {
    if (!NEXT[this.state].includes('ROUND_VOIDED')) throw new DtError('state', `cannot void in ${this.state}`);
    const outcomes = this.round.slip.entries.map(([id, chips]) => refundBet(id, toCents(chips)));
    const s = settleOutcomes(outcomes, this.round.balanceBefore);
    this.round.outcomes = outcomes;
    this.round.settlement = s;
    this.pay(s.totalReturn);
    this.log.record(this.record('ROUND_VOIDED', s));
    this.log.clearPending();
    this.go('ROUND_VOIDED');
    return s;
  }

  /** Lock → burn → deal → reveal → evaluate → settle in one go (simulations, tests). */
  playOut(): DtSettlement {
    this.lockBets();
    if (this.r.burnCardEnabled) this.burn();
    this.deal();
    this.revealDragon();
    this.revealTiger();
    this.evaluate();
    return this.settle();
  }

  /** Between rounds: reshuffles when the shoe runs low, then opens betting. Returns true if it reshuffled. */
  nextRound(): boolean {
    if (this.state !== 'ROUND_COMPLETE' && this.state !== 'ROUND_VOIDED') throw new DtError('state', `the round is not over (${this.state})`);
    const need = (this.r.burnCardEnabled ? 1 : 0) + 2;
    let reshuffled = false;
    if (this.shoe.remaining < Math.max(this.r.reshuffleAt, need)) {
      this.go('SHUFFLING');
      this.shoe.shuffle();
      reshuffled = true;
    }
    this.begin();
    return reshuffled;
  }

  // ---------------------------------------------------------------- internals
  private begin() {
    this.trail.length = 0;
    if (this.state === 'INITIALIZING') this.trail.push('INITIALIZING');
    else this.go('INITIALIZING');
    this.round = {
      id: `dt-${Date.now().toString(36)}-${(++roundSeq).toString(36)}`,
      slip: new BetSlip(this.r),
      burn: null,
      dragon: null,
      tiger: null,
      result: null,
      outcomes: null,
      settlement: null,
      balanceBefore: toCents(this.bank.balance),
      date: new Date().toISOString(),
    };
    this.go('BETTING');
  }

  private pay(cents: number) {
    if (cents > 0) this.bank.credit(toChips(cents));
  }

  private persist() {
    const p: PendingRound = {
      roundId: this.round.id,
      shoeId: this.shoe.id,
      bets: this.round.slip.entries.map(([id, chips]) => ({ id, stake: toCents(chips) })),
      totalBet: toCents(this.round.slip.total),
      balanceBefore: this.round.balanceBefore,
      burn: rec(this.round.burn),
      dragon: rec(this.round.dragon),
      tiger: rec(this.round.tiger),
      date: this.round.date,
    };
    this.log.savePending(p);
  }

  private record(finalState: RoundRecord['finalState'], s: DtSettlement, shoeId = this.shoe.id): RoundRecord {
    return {
      roundId: this.round.id,
      mode: MODE_ID,
      dealerId: null,
      tableId: this.tableId,
      shoeId,
      dragon: rec(this.round.dragon),
      tiger: rec(this.round.tiger),
      result: this.round.result,
      bets: this.round.slip.entries.map(([id, chips]) => ({ id, stake: toCents(chips) })),
      outcomes: s.outcomes,
      totalBet: s.totalBet,
      totalReturn: s.totalReturn,
      net: s.net,
      balanceBefore: s.balanceBefore,
      balanceAfter: s.balanceAfter,
      date: this.round.date,
      finalState,
    };
  }

  /**
   * A round left unsettled by an interruption: finished with the cards it already had, or voided
   * (stakes back exactly once) when its cards were never dealt or the record is unreadable.
   */
  private recover(): RoundRecord | null {
    const raw = this.log.pending();
    if (!raw) return null;
    const p = raw as Partial<PendingRound>;
    const validCard = (c: unknown): c is CardRecord => !!c && Number.isInteger((c as CardRecord).card) && (c as CardRecord).card >= 0 && (c as CardRecord).card < 52;
    const bets = Array.isArray(p.bets) ? p.bets.filter((b) => b && ALL_BETS.includes(b.id) && Number.isInteger(b.stake) && b.stake > 0) : [];
    const stakes = bets.reduce((s, b) => s + b.stake, 0);
    const consistent = typeof p.roundId === 'string' && bets.length > 0 && bets.length === (p.bets?.length ?? -1) && stakes === p.totalBet && Number.isInteger(p.balanceBefore);
    const outcomes =
      consistent && validCard(p.dragon) && validCard(p.tiger)
        ? bets.map((b) => evaluateBet(b.id, b.stake, (p.dragon as CardRecord).card, (p.tiger as CardRecord).card, this.r))
        : bets.length && consistent
          ? bets.map((b) => refundBet(b.id, b.stake))
          : [];
    const before = Number.isInteger(p.balanceBefore) ? (p.balanceBefore as number) : toCents(this.bank.balance);
    const s = settleOutcomes(outcomes, before);
    this.pay(s.totalReturn);
    const finished = outcomes.length > 0 && outcomes[0].state !== 'REFUND';
    const record: RoundRecord = {
      roundId: typeof p.roundId === 'string' ? p.roundId : 'unknown',
      mode: MODE_ID,
      dealerId: null,
      tableId: this.tableId,
      shoeId: typeof p.shoeId === 'string' ? p.shoeId : 'unknown',
      dragon: validCard(p.dragon) ? p.dragon : null,
      tiger: validCard(p.tiger) ? p.tiger : null,
      result: finished ? mainResult((p.dragon as CardRecord).card, (p.tiger as CardRecord).card) : null,
      bets: consistent ? bets : [],
      outcomes,
      totalBet: s.totalBet,
      totalReturn: s.totalReturn,
      net: s.net,
      balanceBefore: s.balanceBefore,
      balanceAfter: s.balanceAfter,
      date: typeof p.date === 'string' ? p.date : new Date().toISOString(),
      finalState: finished ? 'ROUND_COMPLETE' : 'ROUND_VOIDED',
    };
    this.log.record(record);
    this.log.clearPending();
    return record;
  }

  private expect(s: DtState) {
    if (this.state !== s) throw new DtError('state', `expected ${s}, table is ${this.state}`);
  }

  /** Validated transition. */
  private go(next: DtState) {
    if (!NEXT[this.state].includes(next)) throw new DtError('state', `invalid transition ${this.state} → ${next}`);
    this.to(next);
  }

  private to(next: DtState) {
    this.state = next;
    this.trail.push(next);
  }
}

export { NEXT as DT_TRANSITIONS };
