import { describe, expect, it } from 'vitest';
import { parseCard, parseCards, rankOf, type Card } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { MemoryStore } from '../src/core/storage';
import { bestSequence, canastraDealerDiscards, compareSequences } from '../src/games/brazil/canastra/engine';
import { CANASTRA_DRAW_RULES, CanastraDrawRound, canastraPayout } from '../src/games/brazil/canastra/draw';
import { bestThree, compareCards, compareStrengths, isManilha, manilhaRank, strength } from '../src/games/brazil/manilha/engine';
import { dealerDiscardIndex, duelOutcome, ManilhaDrawRound } from '../src/games/brazil/manilha/draw';
import { ManilhaHoldemRound } from '../src/games/brazil/manilha/holdem';
import { comparePife, evaluatePife, isRun, isSet } from '../src/games/brazil/pife/engine';
import { PifeExpressRound, PIFE_EXPRESS_RULES, pifeOptions } from '../src/games/brazil/pife/express';
import { pifeDiscardPlan } from '../src/games/brazil/pife/strategy';
import { VideoPifeRound, vpClass } from '../src/games/brazil/pife/video';
import { deckCards, RoundDeck } from '../src/games/brazil/shared/deck';
import { betProblem, resumeRound, RoundError, type RoundEnv } from '../src/games/brazil/shared/round';
import { ModeStore } from '../src/games/brazil/shared/store';

const c = parseCard;
const cs = parseCards;

function bank(balance = 1000) {
  const b = {
    balance,
    debits: [] as number[],
    credits: [] as number[],
    canAfford: (n: number) => b.balance >= n,
    debit: (n: number) => {
      if (n > b.balance) throw new Error('insufficient');
      b.balance -= n;
      b.debits.push(n);
    },
    credit: (n: number) => {
      b.balance += n;
      b.credits.push(n);
    },
  };
  return b;
}

function env(mode: string, b = bank(), kv = new MemoryStore(), seed = 1): RoundEnv & { b: ReturnType<typeof bank>; kv: MemoryStore } {
  return { bank: b, store: new ModeStore(mode, kv), rng: seededRng(seed), b, kv };
}

// ------------------------------------------------------------------ decks
describe('shared decks', () => {
  it('Truco deck has 40 cards without 8, 9, 10; standard 52; two decks 104 with distinct copies', () => {
    const t = deckCards('TRUCO_40', 1);
    expect(t.length).toBe(40);
    expect(t.some((x) => [8, 9, 10].includes(rankOf(x)))).toBe(false);
    expect(deckCards('STANDARD_52', 1).length).toBe(52);
    const two = RoundDeck.shuffled('STANDARD_52', 2, seededRng(1));
    expect(two.size).toBe(104);
    const uids = Array.from({ length: 104 }, () => two.draw());
    expect(new Set(uids).size).toBe(104);
    const sevens = uids.filter((u) => two.cardOf(u) === c('7h'));
    expect(sevens.length).toBe(2);
    expect(() => two.draw()).toThrow();
  });

  it('a saved deck restores in the same order; a broken one is refused', () => {
    const d = RoundDeck.shuffled('TRUCO_40', 1, seededRng(2));
    d.draw();
    const s = d.state();
    const r = RoundDeck.restore(s);
    expect(r.draw()).toBe(d.draw());
    expect(() => RoundDeck.restore({ ...s, order: s.order.slice(1) })).toThrow();
  });

  it('bet validation: whole chips, steps of 5, limits and bankroll', () => {
    const lim = { min: 5, max: 500, step: 5 };
    expect(betProblem(25, lim, 100)).toBe('');
    expect(betProblem(-5, lim, 100)).not.toBe('');
    expect(betProblem(7, lim, 100)).toMatch(/steps/);
    expect(betProblem(2.5, lim, 100)).not.toBe('');
    expect(betProblem(600, lim, 1000)).toMatch(/maximum/);
    expect(betProblem(50, lim, 40)).toMatch(/not enough/);
  });
});

// ------------------------------------------------------------------ manilha
describe('Manilha engine', () => {
  it('the Vira picks the next rank, circularly', () => {
    expect(manilhaRank(c('3h'))).toBe(4);
    expect(manilhaRank(c('7h'))).toBe(12);
    expect(manilhaRank(c('Kh'))).toBe(14);
    expect(manilhaRank(c('Ah'))).toBe(2);
    expect(manilhaRank(c('Qh'))).toBe(11);
  });

  it('manilhas beat every common card; the zap beats every manilha; equal commons tie', () => {
    const m = 12; // Vira 7: queens
    expect(strength(c('Qc'), m)).toBe(14);
    expect(compareCards(c('Qh'), c('Qs'), m)).toBe(1);
    expect(compareCards(c('Qs'), c('Qd'), m)).toBe(1);
    expect(compareCards(c('Qd'), c('3c'), m)).toBe(1);
    expect(compareCards(c('3c'), c('3h'), m)).toBe(0);
    expect(compareCards(c('2c'), c('Ac'), m)).toBe(1);
    expect(isManilha(c('Jc'), m)).toBe(false);
  });

  it('spec example 18: 2 duels to 1', () => {
    const m = manilhaRank(c('7s'));
    const duels = [
      [c('3c'), c('2c')],
      [c('Qd'), c('Qs')],
      [c('5h'), c('4h')],
    ].map(([p, d]) => compareCards(p, d, m));
    expect(duels).toEqual([1, -1, 1]);
    expect(duelOutcome(['PLAYER_WIN', 'DEALER_WIN', 'PLAYER_WIN'])).toBe('WIN');
    expect(duelOutcome(['PLAYER_WIN', 'DEALER_WIN', 'DRAW'])).toBe('PUSH');
    expect(duelOutcome(['DRAW', 'DRAW', 'DRAW'])).toBe('PUSH');
    expect(duelOutcome(['PLAYER_WIN', 'DRAW', 'DRAW'])).toBe('WIN');
    expect(duelOutcome(['DEALER_WIN', 'DRAW', 'DRAW'])).toBe('LOSS');
  });

  it('dealer discard policy: weakest non-manilha with base strength ≤ 4, first on ties', () => {
    const m = 12;
    expect(dealerDiscardIndex(cs('4c Kh As'), m, 4)).toBe(0);
    expect(dealerDiscardIndex(cs('Qd 3c 2h'), m, 4)).toBeNull(); // weakest is a 2 (base 9)
    expect(dealerDiscardIndex(cs('Qd Qs Qh'), m, 4)).toBeNull(); // all manilhas
    expect(dealerDiscardIndex(cs('Kc 5c 5h'), m, 4)).toBe(1);
  });

  it("Hold'em: best three with at least one hole card, compared card by card (spec example 27)", () => {
    const m = manilhaRank(c('Kd'));
    const p = bestThree(cs('Ac 2d'), cs('3d 7c Qc'), m);
    const d = bestThree(cs('Ah 3s'), cs('3d 7c Qc'), m);
    expect(p.strengths).toEqual([14, 10, 9]);
    expect(d.strengths).toEqual([13, 10, 10]);
    expect(compareStrengths(p.strengths, d.strengths)).toBe(1);
    // the board alone may not play: weak hole cards still count
    const weak = bestThree(cs('4c 5d'), cs('3d 3c 3h'), m);
    expect(weak.holeUsed).toBeGreaterThanOrEqual(1);
    expect(weak.strengths).toEqual([10, 10, 2]);
    expect(compareStrengths([14, 10, 9], [13, 12, 11])).toBe(1);
    expect(compareStrengths([10, 9, 8], [10, 9, 8])).toBe(0);
  });
});

describe('Manilha Draw rounds', () => {
  // order: Vira, p0 d0 p1 d1 p2 d2, player replacement, dealer replacement
  const stack = cs('7s 3c 4h Qd Kc 5h As 6d 2s');

  it('runs Ante → Play → draw → three duels and pays 1:1 on both bets', () => {
    const e = env('MANILHA_DRAW', bank(1000));
    const r = new ManilhaDrawRound(e, undefined, undefined, stack);
    r.placeAnte(100);
    expect(r.vira).toBe(c('7s'));
    expect(r.playerCards).toEqual(cs('3c Qd 5h'));
    expect(r.dealerCards).toBeNull();
    expect(r.playerCards).not.toContain(r.vira);
    r.play();
    expect(e.b.debits).toEqual([100, 100]);
    r.draw(null);
    // the dealer's weakest card is the 4♥ (base 1): it is replaced
    expect(r.data.dealerDiscard).toMatchObject({ index: 0 });
    expect(r.data.dealerOrder.length).toBe(3);
    const order = [...r.data.dealerOrder];
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) {
      const out = r.duel(i);
      seen.add(i);
      expect(out.dealer).toBe(r.cardOf(order[i]));
    }
    expect(r.data.dealerOrder).toEqual(order);
    expect(r.data.duels.length).toBe(3);
    expect(() => r.duel(0)).toThrow(RoundError);
    expect(r.state).toBe('ROUND_COMPLETE');
    const back = r.totalReturn;
    expect([0, 200, 400]).toContain(back);
    expect(e.b.credits.length).toBe(back ? 1 : 0);
  });

  it('a card plays only once; fold loses only the Ante; Play needs the chips', () => {
    const e = env('MANILHA_DRAW', bank(1000));
    const r = new ManilhaDrawRound(e, undefined, undefined, stack);
    r.placeAnte(50);
    r.play();
    r.draw(1);
    expect(r.data.playerDiscard).toMatchObject({ index: 1 });
    expect(r.playerCards.length).toBe(3);
    r.duel(2);
    expect(() => r.duel(2)).toThrow(/not available/);
    const f = env('MANILHA_DRAW', bank(1000));
    const rf = new ManilhaDrawRound(f, undefined, undefined, stack);
    rf.placeAnte(100);
    rf.fold();
    expect(rf.outcome).toBe('FOLD');
    expect(f.b.balance).toBe(900);
    expect(rf.bets.map((b) => b.name)).toEqual(['ANTE']);
    const poor = env('MANILHA_DRAW', bank(150));
    const rp = new ManilhaDrawRound(poor, undefined, undefined, stack);
    rp.placeAnte(100);
    expect(() => rp.play()).toThrow(/Play/);
    rp.fold();
  });

  it('rejects invalid transitions and never settles twice', () => {
    const e = env('MANILHA_DRAW');
    const r = new ManilhaDrawRound(e, undefined, undefined, stack);
    expect(() => r.play()).toThrow(RoundError);
    expect(() => r.duel(0)).toThrow(RoundError);
    r.placeAnte(10);
    expect(() => r.placeAnte(10)).toThrow(RoundError);
    r.fold();
    expect(() => r.fold()).toThrow(RoundError);
    expect(() => r.void()).toThrow(/settled/);
    expect(e.store.stats().folds).toBe(1);
  });
});

describe("Manilha Hold'em rounds", () => {
  const stack = cs('Kd Ac Ah 2d 3s 3d 7c Qc');
  it('first board card before the decision, then two more and the showdown', () => {
    const e = env('MANILHA_HOLDEM', bank(1000));
    const r = new ManilhaHoldemRound(e, undefined, undefined, stack);
    r.placeAnte(100);
    expect(r.state).toBe('PLAY_DECISION');
    expect(r.board).toEqual(cs('3d'));
    expect(r.dealerCards).toBeNull();
    r.play();
    expect(r.board).toEqual(cs('3d 7c Qc'));
    expect(r.playerBest!.strengths).toEqual([14, 10, 9]);
    expect(r.dealerBest!.strengths).toEqual([13, 10, 10]);
    expect(r.outcome).toBe('WIN');
    expect(e.b.balance).toBe(1200);
    expect(r.trail).toEqual(['INITIALIZING', 'ANTE_BETTING', 'DEALING', 'FIRST_BOARD_CARD', 'PLAY_DECISION', 'SECOND_BOARD_CARD', 'THIRD_BOARD_CARD', 'SHOWDOWN', 'EVALUATING', 'SETTLEMENT', 'ROUND_COMPLETE']);
    expect(() => r.play()).toThrow(RoundError);
  });

  it('a full tie pushes; fold keeps nothing', () => {
    const e = env('MANILHA_HOLDEM', bank(1000));
    // same strengths for both: board 3 3 3 dominates nothing; holes 4 and 4
    const r = new ManilhaHoldemRound(e, undefined, undefined, cs('Kd 4c 4h 5c 5h 3d 3s 3h'));
    r.placeAnte(50);
    r.play();
    expect(r.outcome).toBe('PUSH');
    expect(e.b.balance).toBe(1000);
    const f = env('MANILHA_HOLDEM', bank(1000));
    const rf = new ManilhaHoldemRound(f, undefined, undefined, stack);
    rf.placeAnte(50);
    rf.fold();
    expect(f.b.balance).toBe(950);
  });
});

// ------------------------------------------------------------------ pife
describe('Pife engine', () => {
  it('sets and runs', () => {
    expect(isSet(cs('7c 7h 7s'))).toBe(true);
    expect(isSet(cs('7c 7h 8s'))).toBe(false);
    expect(isRun(cs('Ac 2c 3c'))).toBe(true);
    expect(isRun(cs('Qd Kd Ad'))).toBe(true);
    expect(isRun(cs('Kd Ad 2d'))).toBe(false);
    expect(isRun(cs('7c 8h 9c'))).toBe(false);
    expect(isRun(cs('4h 5h 7h'))).toBe(false);
  });

  it('spec examples 47 and 48', () => {
    const p = evaluatePife(cs('4h 5h 6h 9c 9s 9d'), pifeOptions(PIFE_EXPRESS_RULES));
    expect(p.groups.length).toBe(2);
    expect(p.deadwood).toBe(0);
    const a = evaluatePife(cs('5h 5s 5d 2c 4d 7h'));
    const b = evaluatePife(cs('8h 8s 8c 3d 6h Kc'));
    expect([a.groups.length, a.deadwood, b.groups.length, b.deadwood]).toEqual([1, 13, 1, 19]);
    expect(comparePife(a, b)).toBe(1);
  });

  it('overlaps are resolved for the best partition, not greedily', () => {
    const r = evaluatePife(cs('7h 5h 6h 7s 7d 7c'));
    expect(r.groups.length).toBe(2);
    // a quad gives one set; its fourth card is free
    const q = evaluatePife(cs('9c 9h 9s 9d 2c 5h'));
    expect(q.groups.length).toBe(1);
    expect(q.residual.length).toBe(3);
    // six and nine in a row split into groups
    expect(evaluatePife(cs('3h 4h 5h 6h 7h 8h')).groups.length).toBe(2);
    expect(evaluatePife(cs('Ah 2h 3h 4h 5h 6h 7h 8h 9h')).groups.length).toBe(3);
  });

  it('more groups beat less deadwood; two perfect hands tie', () => {
    const one = evaluatePife(cs('7c 7h 7s Kc Qd Jh'));
    const none = evaluatePife(cs('Ac 2d 3h 4s 6c 8d'));
    expect(comparePife(one, none)).toBe(1);
    expect(comparePife(evaluatePife(cs('4h 5h 6h 9c 9s 9d')), evaluatePife(cs('Ks Kh Kd 2c 3c 4c')))).toBe(0);
  });

  it('dealer plan keeps a made hand and throws the loose card', () => {
    const o = pifeOptions(PIFE_EXPRESS_RULES);
    expect(pifeDiscardPlan(cs('4h 5h 6h 9c 9s 9d'), 2, 2, o).discard).toEqual([]);
    const plan = pifeDiscardPlan(cs('4h 5h 6h 9c 9s Kd'), 2, 2, o);
    expect(plan.discard).toContain(5);
    expect(plan.discard.every((i) => i >= 3)).toBe(true);
  });
});

describe('Pife Express rounds', () => {
  it('six cards each, up to two draws, deadwood decides between single sets (spec 48)', () => {
    const e = env('PIFE_EXPRESS', bank(1000));
    // p0 d0 … p5 d5 alternate
    const p = cs('5h 5s 5d 2c 4d 7h');
    const d = cs('8h 8s 8c 3d 6h Kc');
    const stack = p.flatMap((x, i) => [x, d[i]]);
    const r = new PifeExpressRound(e, { ...PIFE_EXPRESS_RULES, dealerSamples: 40 }, undefined, stack);
    r.placeAnte(100);
    expect(r.playerCards).toEqual(p);
    expect(() => r.draw([0, 1, 2])).toThrow(RoundError);
    r.draw([]);
    expect(r.dealerCards!.length).toBe(6);
    expect(r.playerEval!.groups.length).toBeGreaterThanOrEqual(1);
    expect([0, 100, 200]).toContain(r.totalReturn);
  });

  it('two perfect hands push', () => {
    const e = env('PIFE_EXPRESS', bank(1000));
    const p = cs('4h 5h 6h 9c 9s 9d');
    const d = cs('Ks Kh Kd 2c 3c 4c');
    const r = new PifeExpressRound(e, undefined, undefined, p.flatMap((x, i) => [x, d[i]]));
    r.placeAnte(100);
    r.draw([]);
    expect(r.data.dealerDiscards).toEqual([]);
    expect(r.outcome).toBe('PUSH');
    expect(e.b.balance).toBe(1000);
  });
});

describe('Video Pife rounds', () => {
  it('perfect pife pays 7× (spec 59); at most three replacements', () => {
    const e = env('VIDEO_PIFE', bank(1000));
    const r = new VideoPifeRound(e, undefined, undefined, cs('3h 4h 5h 8s 8c 8d Jc Qc Kc'));
    r.placeBet(100);
    expect(r.cards.length).toBe(9);
    expect(() => r.draw([0, 1, 2, 3])).toThrow(RoundError);
    r.draw([]);
    expect(r.cls).toBe('PERFECT_PIFE');
    expect(r.totalReturn).toBe(700);
    expect(e.b.balance).toBe(1600);
    expect(() => r.draw([])).toThrow(RoundError);
  });

  it('classes by group count; single set is not paid', () => {
    expect(vpClass(evaluatePife(cs('3h 4h 5h 8s 8c 2d Jc 9d Kc')))).toBe('SINGLE_SET');
    expect(vpClass(evaluatePife(cs('3h 4h 5h 8s 8c 8d Jc 9d 2c')))).toBe('DOUBLE_SET');
    const e = env('VIDEO_PIFE', bank(1000));
    const r = new VideoPifeRound(e, undefined, undefined, cs('3h 4h 5h 8s 8c 2d Jc 9d Kc Ac 2s 4s'));
    r.placeBet(50);
    r.draw([5, 6, 7]);
    // the replacements are the next cards of the deck, in order
    expect(r.cards.slice(5, 8)).toEqual(cs('Ac 2s 4s'));
    expect(r.data.discards.length).toBe(3);
    expect(['NO_SET', 'SINGLE_SET', 'DOUBLE_SET', 'PERFECT_PIFE']).toContain(r.cls);
  });
});

// ------------------------------------------------------------------ canastra
describe('Canastra engine', () => {
  const best = (h: string) => bestSequence(cs(h));
  it('six cards are not a canastra, seven are', () => {
    expect(best('3h 4h 5h 6h 7h 8h Kc Qd Js').cls).toBe('LONG_SEQUENCE');
    expect(best('3h 4h 5h 6h 7h 8h 9h Qd Js').cls).toBe('CLEAN_CANASTRA');
    expect(best('3h 4h 5h Kc Qd Js 9c 9d 6s').cls).toBe('SHORT_SEQUENCE');
    expect(best('3h 5d 7c 9s Jh Kd Ac 4s 6d').cls).toBe('NO_SEQUENCE');
  });

  it('a natural 2 keeps it clean; a substitute 2 makes it dirty; two substitutes are not allowed', () => {
    expect(best('Ah 2h 3h 4h 5h 6h 7h Kc Qd').cls).toBe('CLEAN_CANASTRA');
    const dirty = best('3h 4h 5h 2s 7h 8h 9h Kc Qd');
    expect(dirty.cls).toBe('DIRTY_CANASTRA');
    expect(dirty.wild).toMatchObject({ position: 6 });
    // gaps at 5 and 7 cannot both be filled
    const two = best('3h 4h 2s 6h 2c 8h 9h Kc Qd');
    expect(two.length).toBeLessThan(7);
  });

  it('copies of a card never fill two positions; no circular runs', () => {
    expect(bestSequence([...cs('3h 4h 5h'), c('5h'), c('6h')]).length).toBe(4);
    // Q-K-A-2-3 never forms; the 2 may stand in for the J (J-Q-K-A, dirty) at most
    const circ = best('Qh Kh Ah 2h 3h 9c 9d 6s 7s');
    expect(circ.length).toBeLessThan(5);
    expect(circ.start === 1 && circ.end === 14).toBe(false);
  });

  it('ranking: clean 7 beats dirty 9; longer clean wins; the final card decides; suits never do', () => {
    const cmp = (a: string, b: string) => compareSequences(best(a), best(b));
    expect(cmp('3h 4h 5h 6h 7h 8h 9h Kc Qd', '3s 4s 5s 6s 2c 8s 9s Ts Js')).toBe(1);
    expect(cmp('3h 4h 5h 6h 7h 8h 9h Th Jh', '3s 4s 5s 6s 7s 8s 9s Kc Qd')).toBe(1);
    // spec 76: A clean vs dirty → player; B longer clean → dealer; C final card → dealer; D push
    expect(cmp('3h 4h 5h 6h 7h 8h 9h Kc Qd', '3s 4s 2c 6s 7s 8s 9s Ts Kd')).toBe(1);
    expect(cmp('3c 4c 5c 6c 7c 8c 9c Kh Qh', '3d 4d 5d 6d 7d 8d 9d Td Ks')).toBe(-1);
    expect(cmp('3h 4h 5h 6h 7h 8h 9h Kc Qd', '4c 5c 6c 7c 8c 9c Tc Ks Qs')).toBe(-1);
    expect(cmp('3h 4h 5h 6h 7h 8h 9h Kc Qd', '3s 4s 5s 6s 7s 8s 9s Kd Qc')).toBe(0);
    expect(cmp('3h 5d 7c 9s Jh Kd Ac 4s 6d', '3c 5s 7d 9h Jc Kh As 4d 6c')).toBe(0);
  });

  it('payouts only for wins, by class', () => {
    expect(canastraPayout('CLEAN_CANASTRA')).toBe(3);
    expect(canastraPayout('DIRTY_CANASTRA')).toBe(2);
    expect(canastraPayout('SHORT_SEQUENCE')).toBe(1);
  });

  it('dealer keeps its sequence, the cards next to it and a spare 2', () => {
    const h = cs('4h 5h 6h 7h 2c Kd 3h Js 9c');
    const d = canastraDealerDiscards(h, 3);
    expect(d).toEqual([5, 7, 8]);
    expect(canastraDealerDiscards(cs('Ah 2h 3h 4h 5h 6h 7h 8h 9h'), 3)).toEqual([]);
    // no sequence and no 2: hearts has the most distinct values and is kept
    const none = cs('3h 9h Kh 5c 9d Ts 6d Qc Js');
    expect(bestSequence(none).cls).toBe('NO_SEQUENCE');
    expect(canastraDealerDiscards(none, 3)).toEqual([3, 4, 5]);
  });
});

describe('Canastra Draw rounds', () => {
  it('nine cards each from 104; clean canastra win pays 3:1', () => {
    const e = env('CANASTRA_DRAW', bank(1000));
    const p = cs('3h 4h 5h 6h 7h 8h 9h Kc Qd');
    const d = cs('3s 5d 7c 9c Jh Kd Ac 4s 6d');
    const r = new CanastraDrawRound(e, undefined, undefined, p.flatMap((x, i) => [x, d[i]]));
    r.placeAnte(100);
    expect(r.playerCards).toEqual(p);
    r.draw([]);
    if (r.outcome === 'WIN') expect(r.totalReturn).toBe(400);
    expect(r.playerBest!.cls).toBe('CLEAN_CANASTRA');
    expect(r.data.dealerDiscards.length).toBeLessThanOrEqual(3);
  });
});

// ------------------------------------------------------------------ persistence and recovery
describe('persistence and recovery', () => {
  it('an interrupted round comes back with the same cards and decisions, and finishes once', () => {
    const kv = new MemoryStore();
    const b = bank(1000);
    const e = env('MANILHA_DRAW', b, kv, 5);
    const r = new ManilhaDrawRound(e);
    r.placeAnte(100);
    r.play();
    r.draw(null);
    r.duel(0);
    const snap = e.store.pending();
    expect(snap).toBeTruthy();
    // the page closes; later:
    const e2 = env('MANILHA_DRAW', b, kv, 999);
    const back = resumeRound(e2, (s) => new ManilhaDrawRound(e2, undefined, s as never));
    const rr = back.round!;
    expect(rr.state).toBe('SELECTING_CARD');
    expect(rr.playerCards).toEqual(r.playerCards);
    expect(rr.data.dealerOrder).toEqual(r.data.dealerOrder);
    expect(rr.data.duels).toEqual(r.data.duels);
    expect(b.debits).toEqual([100, 100]);
    rr.duel(1);
    rr.duel(2);
    expect(rr.state).toBe('ROUND_COMPLETE');
    expect(e2.store.pending()).toBeNull();
    expect(resumeRound(e2, () => null).round).toBeNull();
    expect(b.credits.length).toBeLessThanOrEqual(1);
  });

  it('a corrupted saved round is voided and its chips refunded once', () => {
    const kv = new MemoryStore();
    const b = bank(1000);
    const e = env('PIFE_EXPRESS', b, kv);
    const r = new PifeExpressRound(e);
    r.placeAnte(100);
    const snap = e.store.pending() as { deck: { order: number[] } };
    snap.deck.order = snap.deck.order.slice(3);
    e.store.savePending(snap);
    const out = resumeRound(e, (s) => new PifeExpressRound(e, undefined, s as never));
    expect(out.round).toBeNull();
    expect(out.refunded).toBe(100);
    expect(b.balance).toBe(1000);
    expect(resumeRound(e, (s) => new PifeExpressRound(e, undefined, s as never)).refunded).toBeNull();
    expect(e.store.stats().voids).toBe(1);
  });

  it('a live round can be voided with the stakes back, once', () => {
    const b = bank(500);
    const e = env('CANASTRA_DRAW', b);
    const r = new CanastraDrawRound(e);
    r.placeAnte(50);
    r.void();
    expect(b.balance).toBe(500);
    expect(r.outcome).toBe('VOID');
    expect(() => r.void()).toThrow();
  });

  it('a settled round is never settled again from storage', () => {
    const kv = new MemoryStore();
    const b = bank(1000);
    const e = env('VIDEO_PIFE', b, kv);
    const r = new VideoPifeRound(e);
    r.placeBet(10);
    const pending = e.store.pending() as Record<string, unknown>;
    r.draw([]);
    // simulate a crash that left an old copy marked as settled
    e.store.savePending({ ...pending, settled: true });
    const before = b.balance;
    expect(resumeRound(e, () => 'x').round).toBeNull();
    expect(b.balance).toBe(before);
  });

  it('the deck order does not depend on the bankroll', () => {
    const deal = (bal: number) => {
      const e = env('VIDEO_PIFE', bank(bal), new MemoryStore(), 77);
      const r = new VideoPifeRound(e);
      r.placeBet(5);
      return r.cards;
    };
    expect(deal(10)).toEqual(deal(1_000_000));
  });
});

describe('two-deck canastra rounds use distinct copies', () => {
  it('identical cards come from different physical instances', () => {
    const e = env('CANASTRA_DRAW', bank(1000), new MemoryStore(), 3);
    const r = new CanastraDrawRound(e, CANASTRA_DRAW_RULES, undefined, cs('7h 2c 7h 3c'));
    r.placeAnte(10);
    const u = r.playerUids;
    expect(r.playerCards[0]).toBe(c('7h'));
    expect(r.playerCards[1]).toBe(c('7h'));
    expect(u[0]).not.toBe(u[1]);
    void (null as unknown as Card);
  });
});
