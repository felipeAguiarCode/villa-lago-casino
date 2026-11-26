import type { AbyssConfig } from './config';

/**
 * Betting Engine: contributions, legal actions and their application for one heads-up hand.
 * It knows nothing about cards, skills or money movement.
 */
export type Street = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
export const STREETS: Street[] = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'];
export type Actor = 'player' | 'dealer';
export type ActionType = 'check' | 'bet' | 'call' | 'raise' | 'double' | 'fold' | 'allin';

export interface Action {
  type: ActionType;
  /** Chips added now (bet and raise). */
  amount?: number;
}

export interface BetState {
  ante: number;
  /** Largest total contribution either side may reach this hand (the player's effective limit). */
  limit: number;
  contrib: Record<Actor, number>;
  /** Size of the last bet or raise increment this street (minimum raise). */
  lastRaise: number;
  raisesLeft: number;
  /** A bet was opened this street. */
  betMade: boolean;
  acted: Record<Actor, boolean>;
  toAct: Actor;
  folded: Actor | null;
}

export interface Range {
  min: number;
  max: number;
}

/** What `actor` may do now. Amounts are chips added now. */
export interface Legal {
  check: boolean;
  bet: Range | null;
  call: number | null;
  raise: Range | null;
  double: number | null;
  fold: boolean;
  allin: number | null;
}

export const other = (a: Actor): Actor => (a === 'player' ? 'dealer' : 'player');

export function newBetState(ante: number, limit: number, cfg: AbyssConfig): BetState {
  return {
    ante,
    limit,
    contrib: { player: ante, dealer: ante },
    lastRaise: ante,
    raisesLeft: cfg.raisesPerStreet,
    betMade: false,
    acted: { player: false, dealer: false },
    toAct: 'player',
    folded: null,
  };
}

/** Resets the per-street fields when a new street starts. */
export function newStreet(s: BetState, first: Actor, cfg: AbyssConfig) {
  s.lastRaise = s.ante;
  s.raisesLeft = cfg.raisesPerStreet;
  s.betMade = false;
  s.acted = { player: false, dealer: false };
  s.toAct = first;
}

export const toCall = (s: BetState, a: Actor) => Math.max(0, s.contrib[other(a)] - s.contrib[a]);
export const remaining = (s: BetState, a: Actor) => Math.max(0, s.limit - s.contrib[a]);
/** Chips both sides have matched, counted once per side (the disputed pot is twice this). */
export const matched = (s: BetState) => Math.min(s.contrib.player, s.contrib.dealer);
export const matchedPot = (s: BetState) => 2 * matched(s);
export const totalPot = (s: BetState) => s.contrib.player + s.contrib.dealer;

export function legalActions(s: BetState, a: Actor): Legal {
  const owe = toCall(s, a);
  const left = remaining(s, a);
  const none: Legal = { check: false, bet: null, call: null, raise: null, double: null, fold: false, allin: null };
  if (s.folded || s.toAct !== a) return none;
  const L: Legal = { ...none, fold: true };
  if (owe === 0) {
    L.check = true;
    if (!s.betMade && left > 0) {
      L.bet = { min: Math.min(s.ante, left), max: left };
      const dbl = s.contrib[a];
      if (dbl >= s.ante && dbl <= left) L.double = dbl;
      L.allin = left;
    }
    return L;
  }
  L.call = Math.min(owe, left);
  if (s.raisesLeft > 0 && left > owe) {
    const minAdd = owe + Math.max(s.lastRaise, s.ante);
    L.raise = minAdd <= left ? { min: minAdd, max: left } : { min: left, max: left };
    const dbl = s.contrib[a];
    if (dbl >= minAdd && dbl <= left) L.double = dbl;
    L.allin = left;
  }
  return L;
}

export interface Applied {
  added: number;
  /** The kind of move it really was (Double and All-In resolve to bet, raise or call). */
  as: ActionType;
  streetClosed: boolean;
}

export class BettingError extends Error {}

/** Applies a legal action. Throws BettingError for anything the rules don't allow. */
export function applyAction(s: BetState, a: Actor, act: Action): Applied {
  const L = legalActions(s, a);
  const opp = other(a);
  const inRange = (r: Range | null, n: number | undefined): n is number => !!r && n !== undefined && Number.isFinite(n) && n >= r.min && n <= r.max;
  let type = act.type;
  let add = 0;
  switch (act.type) {
    case 'check':
      if (!L.check) throw new BettingError('check is not allowed now');
      break;
    case 'fold':
      if (!L.fold) throw new BettingError('not your turn');
      s.folded = a;
      return { added: 0, as: 'fold', streetClosed: true };
    case 'call':
      if (L.call === null) throw new BettingError('nothing to call');
      add = L.call;
      break;
    case 'bet':
      if (!inRange(L.bet, act.amount)) throw new BettingError('bet out of range');
      add = act.amount;
      break;
    case 'raise':
      if (!inRange(L.raise, act.amount)) throw new BettingError('raise out of range');
      add = act.amount;
      break;
    case 'double':
      if (L.double === null) throw new BettingError('double is not a valid bet now');
      add = L.double;
      type = toCall(s, a) === 0 ? 'bet' : 'raise';
      break;
    case 'allin':
      if (L.allin === null) throw new BettingError('all-in is not available now');
      add = L.allin;
      type = toCall(s, a) === 0 ? 'bet' : 'raise';
      break;
  }
  if (type === 'bet') {
    s.betMade = true;
    s.lastRaise = add;
    s.acted[opp] = false;
  } else if (type === 'raise') {
    const size = s.contrib[a] + add - s.contrib[opp];
    s.lastRaise = Math.max(s.lastRaise, size);
    s.raisesLeft--;
    s.acted[opp] = false;
  }
  s.contrib[a] += add;
  s.acted[a] = true;
  s.toAct = opp;
  // heads-up, a call always closes the street (a short all-in call leaves an unmatched excess)
  const closed = type === 'call' || (s.acted.player && s.acted.dealer && s.contrib.player === s.contrib.dealer);
  return { added: add, as: type, streetClosed: closed };
}

/** After a street closes: no more betting is possible because one side has nothing left to put in. */
export const bettingExhausted = (s: BetState) => remaining(s, 'player') === 0 || remaining(s, 'dealer') === 0;
