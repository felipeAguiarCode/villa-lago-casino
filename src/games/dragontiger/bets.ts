import { ALL_BETS, isMainBet, limitOf, type BetId, type DragonTigerRuleset } from './ruleset';

/**
 * The bets of one round, in whole chips per bet id (bets on the same id are consolidated).
 * Changes are only possible until the slip is locked.
 */
export type BetErrorCode = 'locked' | 'invalid' | 'disabled' | 'min' | 'max' | 'funds' | 'empty' | 'main' | 'single' | 'sideLimit';

export class BetError extends Error {
  constructor(
    readonly code: BetErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

const isWholeChips = (n: number) => Number.isFinite(n) && n > 0 && Number.isInteger(n);

export class BetSlip {
  private bets = new Map<BetId, number>();
  locked = false;

  constructor(private r: DragonTigerRuleset) {}

  get entries(): [BetId, number][] {
    return [...this.bets.entries()].filter(([, n]) => n > 0);
  }

  amount(id: BetId) {
    return this.bets.get(id) ?? 0;
  }

  get total() {
    let n = 0;
    for (const v of this.bets.values()) n += v;
    return n;
  }

  /** Adds chips to a bet (consolidated with what is already there). */
  add(id: BetId, chips: number, balance: number) {
    this.assertOpen();
    if (!ALL_BETS.includes(id)) throw new BetError('invalid', `unknown bet ${id}`);
    if (!isWholeChips(chips)) throw new BetError('invalid', 'bets are positive whole chips');
    if (!this.r.enabled[id] || (!isMainBet(id) && !this.r.sideBetsEnabled)) throw new BetError('disabled', `${id} is not offered at this table`);
    if (!this.r.multipleBetsEnabled && this.entries.some(([b]) => b !== id)) throw new BetError('single', 'only one bet per round at this table');
    const next = this.amount(id) + chips;
    if (next > limitOf(id, this.r).max) throw new BetError('max', `maximum on ${id} is ${limitOf(id, this.r).max}`);
    if (this.total + chips > balance) throw new BetError('funds', 'not enough chips');
    if (!isMainBet(id) && this.r.sideBetRoundLimit !== null && this.sideTotal + chips > this.r.sideBetRoundLimit) throw new BetError('sideLimit', 'side bet limit for the round reached');
    this.bets.set(id, next);
  }

  /** Takes chips back off a bet before the slip is locked. */
  remove(id: BetId, chips: number) {
    this.assertOpen();
    if (!isWholeChips(chips)) throw new BetError('invalid', 'bets are positive whole chips');
    const left = this.amount(id) - chips;
    if (left < 0) throw new BetError('invalid', 'cannot remove more than was bet');
    if (left === 0) this.bets.delete(id);
    else this.bets.set(id, left);
  }

  clear() {
    this.assertOpen();
    this.bets.clear();
  }

  private get sideTotal() {
    return this.entries.filter(([b]) => !isMainBet(b)).reduce((s, [, n]) => s + n, 0);
  }

  /** Full check before locking: returns the first problem or null. */
  problem(balance: number): BetError | null {
    const e = this.entries;
    if (!e.length) return new BetError('empty', 'place at least one bet');
    if (this.r.mainBetRequired && !e.some(([b]) => isMainBet(b))) return new BetError('main', 'a main bet is required');
    if (!this.r.multipleBetsEnabled && e.length > 1) return new BetError('single', 'only one bet per round at this table');
    for (const [id, n] of e) {
      if (!this.r.enabled[id] || (!isMainBet(id) && !this.r.sideBetsEnabled)) return new BetError('disabled', `${id} is not offered at this table`);
      const lim = limitOf(id, this.r);
      if (n < lim.min) return new BetError('min', `minimum on ${id} is ${lim.min}`);
      if (n > lim.max) return new BetError('max', `maximum on ${id} is ${lim.max}`);
    }
    if (this.r.sideBetRoundLimit !== null && this.sideTotal > this.r.sideBetRoundLimit) return new BetError('sideLimit', 'side bet limit for the round reached');
    if (this.total > balance) return new BetError('funds', 'not enough chips');
    return null;
  }

  lock(balance: number) {
    this.assertOpen();
    const p = this.problem(balance);
    if (p) throw p;
    this.locked = true;
  }

  private assertOpen() {
    if (this.locked) throw new BetError('locked', 'bets are locked for this round');
  }
}
