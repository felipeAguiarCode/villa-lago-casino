import type { Card } from '../../../core/cards';
import { cryptoRng, type Rng } from '../../../core/rng';
import { RoundDeck, type DeckState } from './deck';
import type { ModeStore } from './store';

/**
 * Base of every Brazilian-game round: explicit state machine, bets on the shared wallet (one debit
 * per bet, one settlement per round), a deck kept in order for the whole round, and a snapshot
 * saved after every transition so an interrupted round can be resumed or voided.
 */
export interface Bank {
  readonly balance: number;
  canAfford(n: number): boolean;
  debit(n: number): void;
  credit(n: number): void;
}

export type Outcome = 'WIN' | 'LOSS' | 'PUSH' | 'FOLD' | 'VOID';
export type RoundErrorCode = 'state' | 'bet' | 'funds' | 'action' | 'integrity';

export class RoundError extends Error {
  constructor(
    readonly code: RoundErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

export interface BetLimits {
  min: number;
  max: number;
  /** Bets are whole multiples of this (the smallest chip). */
  step: number;
}

/** '' when the stake is acceptable, otherwise the reason. */
export function betProblem(amount: number, lim: BetLimits, balance: number): string {
  if (!Number.isInteger(amount) || amount <= 0) return 'bets are positive whole chips';
  if (amount % lim.step !== 0) return `bets go in steps of ${lim.step}`;
  if (amount < lim.min) return `minimum bet is ${lim.min}`;
  if (amount > lim.max) return `maximum bet is ${lim.max}`;
  if (amount > balance) return 'not enough chips';
  return '';
}

export interface BetLine {
  name: string;
  amount: number;
  /** Set once at settlement. */
  state: Outcome | null;
  returned: number | null;
}

export interface RoundEnv {
  bank: Bank;
  store: ModeStore;
  rng?: Rng;
  tableId?: string;
  dealerId?: string;
  now?: () => Date;
}

export interface Snapshot<S extends string, D> {
  v: 1;
  mode: string;
  rulesetVersion: string;
  id: string;
  tableId: string;
  dealerId: string;
  state: S;
  trail: S[];
  deck: DeckState | null;
  bets: BetLine[];
  balanceBefore: number;
  balanceAfter: number | null;
  outcome: Outcome | null;
  settled: boolean;
  created: string;
  completed: string | null;
  data: D;
}

let seq = 0;

export abstract class BaseRound<S extends string, D extends object> {
  state: S;
  trail: S[];
  data: D;
  deck: RoundDeck | null = null;
  bets: BetLine[] = [];
  outcome: Outcome | null = null;
  settled = false;
  readonly id: string;
  protected balanceBefore: number;
  protected balanceAfter: number | null = null;
  protected created: string;
  protected completed: string | null = null;
  protected readonly rng: Rng;
  protected readonly bank: Bank;
  protected readonly store: ModeStore;

  protected constructor(
    protected readonly env: RoundEnv,
    readonly mode: string,
    readonly rulesetVersion: string,
    private readonly transitions: Record<S, readonly S[]>,
    initial: S,
    data: D,
    snap?: Snapshot<S, D>,
  ) {
    this.bank = env.bank;
    this.store = env.store;
    this.rng = env.rng ?? cryptoRng;
    const now = (env.now ?? (() => new Date()))().toISOString();
    if (snap) {
      if (snap.mode !== mode || snap.rulesetVersion !== rulesetVersion) throw new RoundError('integrity', 'saved round belongs to another mode or ruleset version');
      this.id = snap.id;
      this.state = snap.state;
      this.trail = [...snap.trail];
      this.deck = snap.deck ? RoundDeck.restore(snap.deck) : null;
      this.bets = snap.bets.map((b) => ({ ...b }));
      this.balanceBefore = snap.balanceBefore;
      this.balanceAfter = snap.balanceAfter;
      this.outcome = snap.outcome;
      this.settled = snap.settled;
      this.created = snap.created;
      this.completed = snap.completed;
      this.data = snap.data;
    } else {
      this.id = `${mode.toLowerCase()}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
      this.state = initial;
      this.trail = [initial];
      this.balanceBefore = env.bank.balance;
      this.created = now;
      this.data = data;
    }
  }

  // ---------------------------------------------------------------- state machine
  protected can(next: S) {
    return this.transitions[this.state].includes(next);
  }

  /** Validated transition; the round is saved after each one. */
  protected go(next: S) {
    if (!this.can(next)) throw new RoundError('state', `invalid transition ${this.state} → ${next}`);
    this.state = next;
    this.trail.push(next);
    this.persist();
  }

  protected expect(...states: S[]) {
    if (!states.includes(this.state)) throw new RoundError('state', `not allowed in ${this.state}`);
  }

  // ---------------------------------------------------------------- money
  get totalBet() {
    return this.bets.reduce((s, b) => s + b.amount, 0);
  }

  get totalReturn() {
    return this.bets.reduce((s, b) => s + (b.returned ?? 0), 0);
  }

  get net() {
    return this.totalReturn - this.totalBet;
  }

  /** Takes a bet from the wallet once and records it. */
  protected takeBet(name: string, amount: number, lim: BetLimits) {
    if (this.bets.some((b) => b.name === name)) throw new RoundError('bet', `${name} is already confirmed`);
    const why = betProblem(amount, lim, this.bank.balance);
    if (why) throw new RoundError(why === 'not enough chips' ? 'funds' : 'bet', why);
    this.bank.debit(amount);
    this.bets.push({ name, amount, state: null, returned: null });
  }

  /** Pays the round, exactly once: every bet gets its state and return in whole chips. */
  protected settle(outcome: Outcome, results: Record<string, { state: Outcome; returned: number }>) {
    if (this.settled) throw new RoundError('integrity', 'round already settled');
    for (const b of this.bets) {
      const r = results[b.name];
      if (!r || !Number.isInteger(r.returned) || r.returned < 0) throw new RoundError('integrity', `no valid result for ${b.name}`);
      b.state = r.state;
      b.returned = r.returned;
    }
    this.settled = true;
    this.outcome = outcome;
    const back = this.totalReturn;
    if (back > 0) this.bank.credit(back);
    this.balanceAfter = this.balanceBefore - this.totalBet + back;
    this.completed = (this.env.now ?? (() => new Date()))().toISOString();
  }

  /** Called by subclasses after the final transition. */
  protected archive() {
    this.store.record({ ...this.snapshot(), outcome: this.outcome ?? 'VOID', totalBet: this.totalBet, totalReturn: this.totalReturn });
    this.store.clearPending();
  }

  /** Cancels an unfinished round and returns every committed chip, once. */
  void(): void {
    if (this.settled) throw new RoundError('integrity', 'a settled round cannot be voided');
    this.settle(
      'VOID',
      Object.fromEntries(this.bets.map((b) => [b.name, { state: 'VOID' as Outcome, returned: b.amount }])),
    );
    this.state = 'ROUND_VOIDED' as S;
    this.trail.push(this.state);
    this.archive();
  }

  // ---------------------------------------------------------------- cards
  protected newDeck(make: () => RoundDeck) {
    if (this.deck) throw new RoundError('integrity', 'the round already has its deck');
    this.deck = make();
  }

  protected dealCard(): number {
    if (!this.deck) throw new RoundError('integrity', 'no deck');
    return this.deck.draw();
  }

  cardOf = (uid: number): Card => {
    if (!this.deck) throw new RoundError('integrity', 'no deck');
    return this.deck.cardOf(uid);
  };

  // ---------------------------------------------------------------- persistence
  snapshot(): Snapshot<S, D> {
    return {
      v: 1,
      mode: this.mode,
      rulesetVersion: this.rulesetVersion,
      id: this.id,
      tableId: this.env.tableId ?? `${this.mode.toLowerCase()}-1`,
      dealerId: this.env.dealerId ?? 'house',
      state: this.state,
      trail: [...this.trail],
      deck: this.deck?.state() ?? null,
      bets: this.bets.map((b) => ({ ...b })),
      balanceBefore: this.balanceBefore,
      balanceAfter: this.balanceAfter,
      outcome: this.outcome,
      settled: this.settled,
      created: this.created,
      completed: this.completed,
      data: JSON.parse(JSON.stringify(this.data)) as D,
    };
  }

  protected persist() {
    // nothing to recover until chips are committed
    if (!this.settled && this.bets.length) this.store.savePending(this.snapshot());
  }

  /** Every uid in the hands is a dealt card and appears in one place only. */
  protected checkCards(groups: number[][]) {
    if (!this.deck) return;
    const dealt = new Set(this.deck.dealt);
    const seen = new Set<number>();
    for (const g of groups)
      for (const u of g) {
        if (!dealt.has(u) || seen.has(u)) throw new RoundError('integrity', 'a card is out of place');
        seen.add(u);
      }
  }
}

/** Outcome of a single-bet result for a stake at a net payout (integers only). */
export function returnFor(state: Outcome, stake: number, payout = 1): number {
  if (!Number.isInteger(payout) || payout < 0) throw new RoundError('integrity', 'payouts are whole multipliers');
  switch (state) {
    case 'WIN':
      return stake * (1 + payout);
    case 'PUSH':
    case 'VOID':
      return stake;
    default:
      return 0;
  }
}

/**
 * Picks up the round left unsettled in the store: rebuilt as it was (same cards, decisions and
 * deck order), dropped if it was already settled, or voided with its committed chips refunded
 * exactly once when it can't be rebuilt safely.
 */
export function resumeRound<R>(env: RoundEnv, build: (snap: Snapshot<string, object>) => R): { round: R | null; refunded: number | null } {
  const raw = env.store.pending() as Partial<Snapshot<string, object>> | null;
  if (!raw) return { round: null, refunded: null };
  if (raw.settled) {
    env.store.clearPending();
    return { round: null, refunded: null };
  }
  try {
    return { round: build(raw as Snapshot<string, object>), refunded: null };
  } catch {
    const bets = Array.isArray(raw.bets) ? raw.bets.filter((b) => b && Number.isInteger(b.amount) && b.amount > 0) : [];
    const refunded = bets.reduce((s, b) => s + b.amount, 0);
    if (refunded > 0) env.bank.credit(refunded);
    env.store.record({ ...raw, outcome: 'VOID', totalBet: refunded, totalReturn: refunded, voidReason: 'unrecoverable' });
    env.store.clearPending();
    return { round: null, refunded };
  }
}
