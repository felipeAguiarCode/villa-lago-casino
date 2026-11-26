import { isRed, rankOf, type Card } from '../../core/cards';
import { Cat3, eval3, type Hand3 } from '../../core/eval3';
import { best3 } from '../holdem3/rules';
import { ANTE_BONUS, dealerQualifies } from './rules';

/** Three Card Poker table variants (selectable at the table). */
export type TcpMode = 'classic' | 'ultimate' | 'faceup' | 'prime' | 'draw' | 'holdem';
export const TCP_MODES: TcpMode[] = ['classic', 'ultimate', 'faceup', 'prime', 'draw', 'holdem'];

export interface ModeRules {
  /** Ante bonus (straight / trips / straight flush) paid when the player plays. */
  anteBonus: boolean;
  /** Ante result when the dealer does not qualify (the Play bet always pushes). */
  noQualAnte: 'win' | 'push';
  /** Exact ties go to the dealer. */
  tiesDealer: boolean;
  /** The dealer always qualifies (Ante and Play are always in action). */
  alwaysQualify: boolean;
}

/**
 * Rules tuned by simulation so every variant keeps a house edge of roughly 2–4 %:
 * classic 3.4 % · ultimate 2.9 % · face up 3.4 % · prime 3.4 % (+ Prime bet 3.6 %) · draw 3.9 % · hold'em 2 %.
 */
export const MODE_RULES: Record<TcpMode, ModeRules> = {
  classic: { anteBonus: true, noQualAnte: 'win', tiesDealer: false, alwaysQualify: false },
  ultimate: { anteBonus: true, noQualAnte: 'push', tiesDealer: false, alwaysQualify: false },
  faceup: { anteBonus: false, noQualAnte: 'win', tiesDealer: true, alwaysQualify: false },
  prime: { anteBonus: true, noQualAnte: 'win', tiesDealer: false, alwaysQualify: false },
  draw: { anteBonus: false, noQualAnte: 'push', tiesDealer: false, alwaysQualify: false },
  holdem: { anteBonus: false, noQualAnte: 'win', tiesDealer: false, alwaysQualify: true },
};

/** Play multiples allowed with a hand (Ultimate: 2× with Ace high or better, 3× with a pair or better). */
export function allowedMultiples(mode: TcpMode, h: Hand3): number[] {
  if (mode !== 'ultimate') return [1];
  const out = [1];
  if (h.cat >= Cat3.Pair || h.ranks[0] === 14) out.push(2);
  if (h.cat >= Cat3.Pair) out.push(3);
  return out;
}

export interface MainResult {
  qualifies: boolean;
  cmp: number;
  bonus: number;
  /** Amount returned on each spot (stake + winnings). */
  ante: number;
  play: number;
}

/** Settles Ante + Play. `play` is the amount on Play (0 = folded). */
export function settleMain(mode: TcpMode, ph: Hand3, dh: Hand3, ante: number, play: number): MainResult {
  const R = MODE_RULES[mode];
  const qualifies = R.alwaysQualify || dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  if (play <= 0) return { qualifies, cmp, bonus: 0, ante: 0, play: 0 };
  const bonus = R.anteBonus ? ante * (ANTE_BONUS[ph.cat] ?? 0) : 0;
  let a = 0;
  let p = 0;
  if (!qualifies) {
    a = R.noQualAnte === 'win' ? ante * 2 : ante;
    p = play;
  } else if (cmp > 0) {
    a = ante * 2;
    p = play * 2;
  } else if (cmp === 0 && !R.tiesDealer) {
    a = ante;
    p = play;
  }
  return { qualifies, cmp, bonus, ante: a + bonus, play: p };
}

/** Prime side bet: all six cards the same colour 4:1, the player's three the same colour 3:1. */
export function primeMult(player: Card[], dealer: Card[]): number {
  const same = (cs: Card[]) => cs.every((c) => isRed(c) === isRed(cs[0]));
  if (same([...player, ...dealer])) return 4;
  if (same(player)) return 3;
  return 0;
}

/** Draw mode house way: with less than a pair the dealer replaces his lowest card. Returns the index or -1. */
export function dealerDrawIndex(cards: Card[]): number {
  if (eval3(cards).cat >= Cat3.Pair) return -1;
  let lo = 0;
  for (let i = 1; i < cards.length; i++) if (rankOf(cards[i]) < rankOf(cards[lo])) lo = i;
  return lo;
}

// ---------------------------------------------------------------- Monte Carlo hints (any mode)

type Rand = (n: number) => number;
const mathRand: Rand = (n) => Math.floor(Math.random() * n);

function pick(pool: Card[], k: number, rnd: Rand, avoid: Card[] = []): Card[] {
  const out: Card[] = [];
  while (out.length < k) {
    const c = pool[rnd(pool.length)];
    if (!out.includes(c) && !avoid.includes(c)) out.push(c);
  }
  return out;
}

const net = (r: MainResult, ante: number, play: number) => r.ante + r.play - ante - play;

export interface Situation {
  mode: TcpMode;
  /** Player's three cards (or two hole cards in Hold'em). */
  player: Card[];
  /** Dealer's up card (Face Up). */
  up?: Card;
  /** Community cards already showing (Hold'em). */
  board?: Card[];
  /** Cards that can still come (not seen by the player). */
  pool: Card[];
}

/** Expected net (in antes) of playing `m`× in a situation, by sampling the unseen cards. */
export function evPlay(s: Situation, m: number, n = 300, rnd: Rand = mathRand): number {
  let sum = 0;
  for (let k = 0; k < n; k++) {
    let ph: Hand3;
    let dh: Hand3;
    if (s.mode === 'holdem') {
      const [d1, d2, c2] = pick(s.pool, 3, rnd);
      const board = [...(s.board ?? []), c2];
      ph = best3([...s.player, ...board]);
      dh = best3([d1, d2, ...board]);
    } else {
      ph = eval3(s.player);
      const known = s.up !== undefined ? [s.up] : [];
      let dc = [...known, ...pick(s.pool, 3 - known.length, rnd)];
      if (s.mode === 'draw') {
        const i = dealerDrawIndex(dc);
        if (i >= 0) dc = dc.map((c, j) => (j === i ? pick(s.pool, 1, rnd, dc)[0] : c));
      }
      dh = eval3(dc);
    }
    sum += net(settleMain(s.mode, ph, dh, 1, m), 1, m);
  }
  return sum / n;
}

/** Best decision: 0 = fold, otherwise the play multiple. */
export function bestPlay(s: Situation, n = 300, rnd: Rand = mathRand): { m: number; ev: number } {
  const h = s.mode === 'holdem' ? best3([...s.player, ...(s.board ?? [])]) : eval3(s.player);
  let best = { m: 0, ev: -1 };
  for (const m of allowedMultiples(s.mode, h)) {
    const ev = evPlay(s, m, n, rnd);
    if (ev > best.ev) best = { m, ev };
  }
  return best;
}

/** Draw mode: which card to replace (-1 keeps the hand), averaging over every possible replacement. */
export function bestDiscard(player: Card[], pool: Card[], n = 40, rnd: Rand = mathRand): number {
  let best = { i: -1, ev: Math.max(-1, bestPlay({ mode: 'draw', player, pool }, n * 3, rnd).ev) };
  for (let i = 0; i < player.length; i++) {
    let sum = 0;
    const tries = pool.length > 24 ? 24 : pool.length;
    for (let k = 0; k < tries; k++) {
      const c = pool[Math.floor((k * pool.length) / tries)];
      const hand = player.map((x, j) => (j === i ? c : x));
      sum += bestPlay({ mode: 'draw', player: hand, pool: pool.filter((x) => x !== c) }, n, rnd).ev;
    }
    const ev = sum / tries;
    if (ev > best.ev) best = { i, ev };
  }
  return best.i;
}
