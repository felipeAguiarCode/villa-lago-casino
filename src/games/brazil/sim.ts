import type { Card } from '../../core/cards';
import { seededRng, type Rng } from '../../core/rng';
import type { KeyValueStore } from '../../core/storage';
import { canastraDealerDiscards } from './canastra/engine';
import { CanastraDrawRound } from './canastra/draw';
import { baseStrength, isManilha, strength } from './manilha/engine';
import { ManilhaDrawRound } from './manilha/draw';
import { ManilhaHoldemRound } from './manilha/holdem';
import { deadwoodValue, evaluatePife } from './pife/engine';
import { PifeExpressRound, PIFE_EXPRESS_RULES, pifeOptions } from './pife/express';
import { pifeDiscardPlan } from './pife/strategy';
import { videoPifeAdvice, VideoPifeRound } from './pife/video';
import type { BaseRound } from './shared/round';
import { ModeStore } from './shared/store';

/**
 * Balance simulation for the Brazilian games. It drives the real round classes (same deck,
 * evaluators, dealer policies and settlement) with a bottomless test wallet.
 */
export interface SimSummary {
  mode: string;
  strategy: string;
  rounds: number;
  win: number;
  loss: number;
  push: number;
  fold: number;
  avgBet: number;
  avgReturn: number;
  /** Net per round in units of the base bet. */
  netPerRound: number;
  rtp: number;
  /** 95% half-width of the RTP estimate. */
  rtpCi: number;
  /** Standard deviation of the net per round, in base bets. */
  sd: number;
  classes: Record<string, number>;
  /** Total return / base bet → count. */
  payouts: Record<string, number>;
}

type Strategy<R> = { name: string; play: (r: R, rng: Rng) => void; cls?: (r: R) => string };

/**
 * Storage is skipped here: persistence and recovery have their own tests, and rewriting the
 * 100-round history after every simulated round would take most of the run time.
 */
const NO_STORAGE: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function run<R extends BaseRound<string, object>>(mode: string, make: (env: ConstructorParameters<typeof ManilhaDrawRound>[0]) => R, start: (r: R) => void, s: Strategy<R>, rounds: number, seed: number, unit: number): SimSummary {
  const deckRng = seededRng(seed);
  const botRng = seededRng(seed * 31 + 7);
  const bank = { balance: 1e12, canAfford: () => true, debit: (n: number) => void (bank.balance -= n), credit: (n: number) => void (bank.balance += n) };
  const store = new ModeStore(mode, NO_STORAGE);
  const out: SimSummary = { mode, strategy: s.name, rounds, win: 0, loss: 0, push: 0, fold: 0, avgBet: 0, avgReturn: 0, netPerRound: 0, rtp: 0, rtpCi: 0, sd: 0, classes: {}, payouts: {} };
  const bets: number[] = [];
  const rets: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const r = make({ bank, store, rng: deckRng });
    start(r);
    s.play(r, botRng);
    const o = r.outcome!;
    if (o === 'WIN') out.win++;
    else if (o === 'LOSS') out.loss++;
    else if (o === 'PUSH') out.push++;
    else if (o === 'FOLD') out.fold++;
    bets.push(r.totalBet);
    rets.push(r.totalReturn);
    const k = String(r.totalReturn / unit);
    out.payouts[k] = (out.payouts[k] ?? 0) + 1;
    if (s.cls) {
      const c = s.cls(r);
      out.classes[c] = (out.classes[c] ?? 0) + 1;
    }
  }
  const sb = bets.reduce((a, b) => a + b, 0);
  const sr = rets.reduce((a, b) => a + b, 0);
  out.avgBet = sb / rounds / unit;
  out.avgReturn = sr / rounds / unit;
  out.rtp = sr / sb;
  out.netPerRound = (sr - sb) / rounds / unit;
  const nets = rets.map((x, i) => (x - bets[i]) / unit);
  const mean = nets.reduce((a, b) => a + b, 0) / rounds;
  out.sd = Math.sqrt(nets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rounds - 1));
  // delta method for a ratio of sums
  const resid = rets.map((x, i) => x - out.rtp * bets[i]);
  out.rtpCi = (1.96 * Math.sqrt(resid.reduce((a, b) => a + b * b, 0))) / sb;
  return out;
}

const UNIT = 10;

// ------------------------------------------------------------------ Manilha Draw
const mdDiscard = (r: ManilhaDrawRound) => {
  const m = r.manilha!;
  const hand = r.playerCards;
  let w = 0;
  for (let i = 1; i < 3; i++) if (strength(hand[i], m) < strength(hand[w], m)) w = i;
  return !isManilha(hand[w], m) && baseStrength(hand[w]) <= 4 ? w : null;
};
const mdDuels = (r: ManilhaDrawRound, order: 'desc' | 'asc' | 'given') => {
  const m = r.manilha!;
  const idx = [0, 1, 2].sort((a, b) => (order === 'given' ? a - b : (order === 'desc' ? -1 : 1) * (strength(r.playerCards[a], m) - strength(r.playerCards[b], m))));
  for (const i of idx) r.duel(i);
};
export const MANILHA_DRAW_STRATEGIES: Strategy<ManilhaDrawRound>[] = [
  {
    name: 'Random',
    play: (r, rng) => {
      if (rng(2)) return r.fold();
      r.play();
      r.draw(rng(2) ? null : rng(3));
      for (const i of [0, 1, 2].sort(() => rng(3) - 1)) r.duel(i);
    },
  },
  { name: 'Always play, no draw, cards in order', play: (r) => (r.play(), r.draw(null), mdDuels(r, 'given')) },
  { name: 'Always play, dealer-style draw, strongest first', play: (r) => (r.play(), r.draw(mdDiscard(r)), mdDuels(r, 'desc')) },
  { name: 'Always play, dealer-style draw, weakest first', play: (r) => (r.play(), r.draw(mdDiscard(r)), mdDuels(r, 'asc')) },
  {
    name: 'Conservative: fold without a 2, 3 or manilha',
    play: (r) => {
      const m = r.manilha!;
      if (!r.playerCards.some((c) => strength(c, m) >= 9)) return r.fold();
      r.play();
      r.draw(mdDiscard(r));
      mdDuels(r, 'desc');
    },
  },
];

// ------------------------------------------------------------------ Manilha Hold'em
export const MANILHA_HOLDEM_STRATEGIES: Strategy<ManilhaHoldemRound>[] = [
  { name: 'Random', play: (r, rng) => (rng(2) ? r.fold() : r.play()) },
  { name: 'Always play', play: (r) => r.play() },
  {
    name: 'Conservative: play with a 2, 3 or manilha in hand or on the board',
    play: (r) => {
      const m = r.manilha!;
      return [...r.playerCards, ...r.board].some((c) => strength(c, m) >= 9) ? r.play() : r.fold();
    },
  },
  {
    name: 'Play with a hole card of strength ≥ 7 (K or better)',
    play: (r) => (r.playerCards.some((c) => strength(c, r.manilha!) >= 7) ? r.play() : r.fold()),
  },
];

// ------------------------------------------------------------------ Pife Express
const peClass = (r: PifeExpressRound) => (r.playerEval ? ['NO_SET', 'SINGLE_SET', 'PERFECT_PIFE'][Math.min(2, r.playerEval.groups.length)] : 'n/a');
const looseHighest = (hand: Card[], k: number, o = pifeOptions(PIFE_EXPRESS_RULES)) => {
  const e = evaluatePife(hand, o);
  return [...e.residual].sort((a, b) => deadwoodValue(hand[b]) - deadwoodValue(hand[a]) || a - b).slice(0, k);
};
export const PIFE_EXPRESS_STRATEGIES: Strategy<PifeExpressRound>[] = [
  { name: 'Random', play: (r, rng) => r.draw([0, 1, 2, 3, 4, 5].sort(() => rng(3) - 1).slice(0, rng(3))), cls: peClass },
  { name: 'No discards', play: (r) => r.draw([]), cls: peClass },
  { name: 'Heuristic: throw the two highest loose cards', play: (r) => r.draw(looseHighest(r.playerCards, 2)), cls: peClass },
  {
    name: "Dealer's exact policy (groups first, then deadwood)",
    play: (r) => r.draw(pifeDiscardPlan(r.playerCards, 2, 2, pifeOptions(PIFE_EXPRESS_RULES)).discard),
    cls: peClass,
  },
];

// ------------------------------------------------------------------ Video Pife
const vpCls = (r: VideoPifeRound) => r.cls ?? 'n/a';
export const VIDEO_PIFE_STRATEGIES: Strategy<VideoPifeRound>[] = [
  { name: 'Random', play: (r, rng) => r.draw([0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rng(3) - 1).slice(0, rng(4))), cls: vpCls },
  { name: 'Stand', play: (r) => r.draw([]), cls: vpCls },
  { name: 'Heuristic: throw up to three highest loose cards', play: (r) => r.draw(looseHighest(r.cards, 3)), cls: vpCls },
  { name: 'Monte Carlo hold (40 samples per choice)', play: (r, rng) => r.draw(videoPifeAdvice(r.cards, rng, 40).discard), cls: vpCls },
];

// ------------------------------------------------------------------ Canastra Draw
const cdCls = (r: CanastraDrawRound) => r.playerBest?.cls ?? 'n/a';
export const CANASTRA_STRATEGIES: Strategy<CanastraDrawRound>[] = [
  { name: 'Random', play: (r, rng) => r.draw([0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rng(3) - 1).slice(0, rng(4))), cls: cdCls },
  { name: 'No discards', play: (r) => r.draw([]), cls: cdCls },
  { name: "Dealer's policy", play: (r) => r.draw(canastraDealerDiscards(r.playerCards, 3)), cls: cdCls },
];

export function simulateAll(n: { manilha: number; pife: number; video: number; canastra: number }, seed = 2026): SimSummary[] {
  const out: SimSummary[] = [];
  for (const s of MANILHA_DRAW_STRATEGIES) out.push(run('MANILHA_DRAW', (e) => new ManilhaDrawRound(e), (r) => r.placeAnte(UNIT), s, n.manilha, seed, UNIT));
  for (const s of MANILHA_HOLDEM_STRATEGIES) out.push(run('MANILHA_HOLDEM', (e) => new ManilhaHoldemRound(e), (r) => r.placeAnte(UNIT), s, n.manilha, seed, UNIT));
  for (const s of PIFE_EXPRESS_STRATEGIES) out.push(run('PIFE_EXPRESS', (e) => new PifeExpressRound(e), (r) => r.placeAnte(UNIT), s, n.pife, seed, UNIT));
  for (const s of VIDEO_PIFE_STRATEGIES) out.push(run('VIDEO_PIFE', (e) => new VideoPifeRound(e), (r) => r.placeBet(UNIT), s, n.video, seed, UNIT));
  for (const s of CANASTRA_STRATEGIES) out.push(run('CANASTRA_DRAW', (e) => new CanastraDrawRound(e), (r) => r.placeAnte(UNIT), s, n.canastra, seed, UNIT));
  return out;
}
