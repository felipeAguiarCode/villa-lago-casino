import { rankOf, suitOf, type Card } from '../../core/cards';
import { cryptoRng, type Rng } from '../../core/rng';
import type { Action, Actor, ActionType, Legal, Street } from './betting';
import { ABYSS, type DealerProfile, type ProfileId } from './config';
import { bestScore } from './evaluator';
import type { DealerLimits } from './skills';

/**
 * Dealer AI. Decisions use only what the dealer may know: its own hole cards, the board, the pot,
 * the legal actions, the public action history and the active skill restrictions. Never the
 * player's cards or the deck order.
 */
export interface PublicAction {
  who: Actor;
  type: ActionType;
  added: number;
  street: Street;
}

export interface DealerView {
  hole: readonly Card[];
  community: readonly Card[];
  street: Street;
  toCall: number;
  matchedPot: number;
  totalPot: number;
  ante: number;
  legal: Legal;
  limits: DealerLimits;
  history: readonly PublicAction[];
  profile: ProfileId;
}

export function pickProfile(rng: Rng, weights = ABYSS.profileWeights): ProfileId {
  const ids = Object.keys(weights) as ProfileId[];
  const total = ids.reduce((s, k) => s + weights[k], 0);
  let r = (rng(1_000_000) / 1_000_000) * total;
  for (const k of ids) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return ids[ids.length - 1];
}

/** Knowledge that narrows the opponent's possible hole cards (used by the player's hint). */
export interface Knowledge {
  /** Opponent cards that are known. */
  oppCards?: Card[];
  /** Next community cards known in order (Peek). */
  nextBoard?: Card[];
  /** Every condition the opponent's hole cards satisfy. */
  tests?: ((opp: Card[]) => boolean)[];
}

const rand01 = (rng: Rng) => rng(1_000_000) / 1_000_000;

/**
 * Win probability (ties count half) of `hole` against an unknown hand, by Monte Carlo over the
 * cards it cannot see. Optional knowledge narrows the opponent's range by rejection sampling.
 */
export function equity(hole: readonly Card[], board: readonly Card[], rng: Rng = cryptoRng, samples = ABYSS.dealerSamples, know: Knowledge = {}): number {
  const seen = new Set<Card>([...hole, ...board, ...(know.oppCards ?? []), ...(know.nextBoard ?? [])]);
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) deck.push(c);
  const needBoard = 5 - board.length - (know.nextBoard?.length ?? 0);
  const needOpp = 2 - (know.oppCards?.length ?? 0);
  const me = new Array<number>(7);
  const op = new Array<number>(7);
  const tests = know.tests ?? [];
  let score = 0;
  let done = 0;
  let tries = 0;
  const maxTries = samples * 40;
  while (done < samples && tries < maxTries) {
    tries++;
    const draw = needOpp + Math.max(0, needBoard);
    for (let i = 0; i < draw; i++) {
      const j = i + rng(deck.length - i);
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    const opp = [...(know.oppCards ?? []), ...deck.slice(0, needOpp)];
    if (tests.length && !tests.every((f) => f(opp))) continue;
    let n = 0;
    for (const c of board) {
      me[n] = c;
      op[n] = c;
      n++;
    }
    for (const c of know.nextBoard ?? []) {
      me[n] = c;
      op[n] = c;
      n++;
    }
    for (let i = 0; i < needBoard; i++) {
      me[n] = deck[needOpp + i];
      op[n] = deck[needOpp + i];
      n++;
    }
    me[n] = hole[0];
    me[n + 1] = hole[1];
    op[n] = opp[0];
    op[n + 1] = opp[1];
    const a = bestScore(me, 7);
    const b = bestScore(op, 7);
    score += a > b ? 1 : a === b ? 0.5 : 0;
    done++;
  }
  return done ? score / done : 0.5;
}

/** A board that lets a bettor represent a strong hand (high cards, three of a suit, connected). */
export function scaryBoard(board: readonly Card[]): number {
  if (!board.length) return 0;
  let s = 0;
  if (board.some((c) => rankOf(c) >= 13)) s += 0.3;
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[suitOf(c)]++;
  if (Math.max(...suits) >= 3) s += 0.4;
  const ranks = [...new Set(board.map(rankOf))].sort((a, b) => a - b);
  for (let i = 0; i + 2 < ranks.length; i++) if (ranks[i + 2] - ranks[i] <= 4) s += 0.2;
  return Math.min(1, s);
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const round5 = (x: number) => Math.round(x / 5) * 5;

function jittered(p: DealerProfile, rng: Rng): DealerProfile {
  if (!p.jitter) return p;
  const j = () => (rand01(rng) * 2 - 1) * p.jitter;
  return {
    ...p,
    foldBias: p.foldBias + j() * 0.6,
    aggression: clamp(p.aggression + j(), 0.05, 0.95),
    bluff: clamp(p.bluff + j() * 0.6, 0, 0.5),
    callBias: p.callBias + j() * 0.5,
    sizing: clamp(p.sizing + j(), 0.35, 1.2),
  };
}

function sized(range: { min: number; max: number }, want: number) {
  return clamp(round5(want), range.min, range.max);
}

/** Probability of folding when facing a bet, before skill modifiers. */
export function foldChance(eq: number, potOdds: number, p: DealerProfile): number {
  const margin = eq - (potOdds - p.callBias);
  return clamp(1 / (1 + Math.exp(margin * 14)) + p.foldBias, 0, 1);
}

/** The dealer's move. `eqOverride` lets tests pin the equity. */
export function decide(v: DealerView, rng: Rng = cryptoRng, eqOverride?: number): Action {
  const p = jittered(ABYSS.profiles[v.profile], rng);
  const eq = eqOverride ?? equity(v.hole, v.community, rng);
  const playerAggro = v.history.filter((h) => h.who === 'player' && (h.type === 'bet' || h.type === 'raise')).length;
  const late = v.street === 'PRE_FLOP' ? 0.7 : v.street === 'FLOP' ? 1 : 1.15;
  const L = v.legal;
  if (v.toCall > 0) {
    const potOdds = v.toCall / (v.totalPot + v.toCall);
    // a player who keeps betting is given credit for a stronger range
    const eqAdj = eq - 0.025 * playerAggro;
    let pFold = foldChance(eqAdj, potOdds, p);
    pFold = clamp(pFold + v.limits.foldBoost, 0, 1);
    if (v.limits.noFold) pFold = 0;
    if (L.call === null) return { type: 'fold' };
    if (rand01(rng) < pFold) return { type: 'fold' };
    if (L.raise && !v.limits.noRaise) {
      const valueRaise = eqAdj > 0.72 - 0.12 * p.aggression && rand01(rng) < 0.35 + 0.5 * p.aggression;
      const bluffRaise = eqAdj < 0.45 && rand01(rng) < p.bluff * 0.35 * late;
      if (valueRaise || bluffRaise) return { type: 'raise', amount: sized(L.raise, v.toCall + (v.totalPot + v.toCall) * p.sizing) };
    }
    return { type: 'call' };
  }
  if (L.bet && !v.limits.noBet) {
    const valueBet = eq > 0.62 - 0.1 * p.aggression && rand01(rng) < 0.4 + 0.5 * p.aggression;
    const checkedTo = v.history.some((h) => h.who === 'player' && h.street === v.street && h.type === 'check');
    const bluffP = p.bluff * late * (1 + scaryBoard(v.community)) * (checkedTo ? 1.4 : 1) * (playerAggro ? 0.6 : 1);
    const bluff = eq < 0.5 && rand01(rng) < bluffP;
    if (valueBet || bluff) return { type: 'bet', amount: sized(L.bet, v.matchedPot * p.sizing * (bluff ? 0.8 : 1)) };
  }
  return { type: 'check' };
}
