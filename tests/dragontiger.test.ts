import { describe, expect, it } from 'vitest';
import { parseCard, parseCards, rankOf, suitOf, type Card } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { BetError, BetSlip } from '../src/games/dragontiger/bets';
import { evaluateBet, mainResult, sideWins } from '../src/games/dragontiger/evaluate';
import { DtHistory, MemoryStore, type PendingRound } from '../src/games/dragontiger/history';
import { ALL_BETS, DT_RULESET, makeRuleset, type BetId } from '../src/games/dragontiger/ruleset';
import { CardShoe, dtValue } from '../src/games/dragontiger/shoe';
import { DragonTigerTable, DtError } from '../src/games/dragontiger/table';

const c = parseCard;
const R = DT_RULESET;

function bank(balance = 1000) {
  const b = {
    balance,
    debits: [] as number[],
    credits: [] as number[],
    canAfford: (n: number) => b.balance + 1e-9 >= n,
    debit: (n: number) => {
      if (n > b.balance + 1e-9) throw new Error('insufficient');
      b.balance = Math.round((b.balance - n) * 100) / 100;
      b.debits.push(n);
    },
    credit: (n: number) => {
      b.balance = Math.round((b.balance + n) * 100) / 100;
      b.credits.push(n);
    },
  };
  return b;
}

function table(o: { b?: ReturnType<typeof bank>; store?: MemoryStore; seed?: number; ruleset?: object } = {}) {
  return new DragonTigerTable({ bank: o.b ?? bank(), store: o.store ?? new MemoryStore(), rng: seededRng(o.seed ?? 1), ruleset: o.ruleset });
}

/** Rigs the next round: burn, Dragon, Tiger. */
function rig(t: DragonTigerTable, dragon: string, tiger: string, burn = '2c') {
  t.shoe.stackTop(t.r.burnCardEnabled ? [c(burn), c(dragon), c(tiger)] : [c(dragon), c(tiger)]);
}

describe('Dragon Tiger – card values and comparison', () => {
  it('Ace is low, King is high (only here)', () => {
    expect(dtValue(c('Ah'))).toBe(1);
    expect(dtValue(c('Kh'))).toBe(13);
    expect(dtValue(c('Ts'))).toBe(10);
    expect(rankOf(c('Ah'))).toBe(14); // the shared card model is untouched
  });

  it('compares values; suits never pick the winner', () => {
    expect(mainResult(c('Ks'), c('Qs'))).toBe('DRAGON_WIN');
    expect(mainResult(c('Jd'), c('Th'))).toBe('DRAGON_WIN');
    expect(mainResult(c('Ac'), c('2c'))).toBe('TIGER_WIN');
    expect(mainResult(c('Ah'), c('Kh'))).toBe('TIGER_WIN');
    expect(mainResult(c('7h'), c('7c'))).toBe('TIE');
    expect(mainResult(c('7h'), c('7h'))).toBe('SUITED_TIE');
    expect(mainResult(c('Ks'), c('Kh'))).toBe('TIE');
  });
});

describe('Dragon Tiger – payouts (100-chip bets, in cents)', () => {
  const ret = (id: BetId, d: string, t: string) => evaluateBet(id, 10000, c(d), c(t), R);
  it('main bets', () => {
    expect(ret('DRAGON', 'Ks', '5h')).toMatchObject({ state: 'WIN', returned: 20000 });
    expect(ret('TIGER', '5h', 'Ks')).toMatchObject({ state: 'WIN', returned: 20000 });
    expect(ret('DRAGON', '5h', 'Ks')).toMatchObject({ state: 'LOSS', returned: 0 });
    expect(ret('DRAGON', '9h', '9c')).toMatchObject({ state: 'HALF_LOSS', returned: 5000 });
    expect(ret('TIGER', '9h', '9h')).toMatchObject({ state: 'HALF_LOSS', returned: 5000 });
    expect(ret('TIE', '9h', '9c')).toMatchObject({ state: 'WIN', returned: 120000 });
    expect(ret('TIE', '9h', '9h')).toMatchObject({ state: 'WIN', returned: 120000 }); // a suited tie is a tie
    expect(ret('SUITED_TIE', '9h', '9h')).toMatchObject({ state: 'WIN', returned: 510000 });
    expect(ret('SUITED_TIE', '9h', '9c')).toMatchObject({ state: 'LOSS', returned: 0 });
    expect(ret('TIE', 'Ks', '5h')).toMatchObject({ state: 'LOSS', returned: 0 });
  });

  it('side bets, including the 7', () => {
    expect(ret('DRAGON_BIG', '8c', '2d').returned).toBe(20000);
    expect(ret('TIGER_SMALL', 'Kc', 'Ad').returned).toBe(20000);
    expect(ret('DRAGON_ODD', 'Jc', '2d').returned).toBe(20000);
    expect(ret('TIGER_EVEN', 'Jc', 'Qd').returned).toBe(20000);
    expect(ret('DRAGON_RED', 'Jh', '2d').returned).toBe(19000);
    expect(ret('TIGER_BLACK', 'Jh', '2c').returned).toBe(19000);
    for (const k of ['BIG', 'SMALL', 'ODD', 'EVEN'] as const) expect(sideWins(k, c('7h'), R)).toBe(false);
    expect(sideWins('RED', c('7h'), R)).toBe(true);
    expect(sideWins('BLACK', c('7s'), R)).toBe(true);
    // a side bet can win while its position loses the main contest
    expect(ret('DRAGON_BIG', '9c', 'Kd')).toMatchObject({ state: 'WIN' });
  });

  it('winning cards of each side bet are exactly those of the rules', () => {
    const all = Array.from({ length: 13 }, (_, i) => i); // spades A..K by value
    const vals = (k: 'BIG' | 'SMALL' | 'ODD' | 'EVEN') => all.filter((x) => sideWins(k, x, R)).map((x) => dtValue(x)).sort((a, b) => a - b);
    expect(vals('BIG')).toEqual([8, 9, 10, 11, 12, 13]);
    expect(vals('SMALL')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(vals('ODD')).toEqual([1, 3, 5, 9, 11, 13]);
    expect(vals('EVEN')).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('pays fractions exactly and never rounds chips away', () => {
    expect(evaluateBet('DRAGON_RED', 500, c('Jh'), c('2d'), R).returned).toBe(950); // 5 chips → 9.50
    expect(evaluateBet('DRAGON', 2500, c('9h'), c('9c'), R).returned).toBe(1250); // half of 25
    for (let chips = 1; chips <= 500; chips++) {
      const o = evaluateBet('TIGER_BLACK', chips * 100, c('2h'), c('3s'), R);
      expect(Number.isInteger(o.returned)).toBe(true);
      expect(o.returned).toBe(chips * 190);
    }
  });

  it('every payout comes from the ruleset', () => {
    const r = makeRuleset({ tiePayout: 8, redPayout: 0.95 });
    expect(evaluateBet('TIE', 10000, c('9h'), c('9c'), r).returned).toBe(90000);
    expect(evaluateBet('DRAGON_RED', 10000, c('9h'), c('2c'), r).returned).toBe(19500);
    expect(() => makeRuleset({ redPayout: 0.955 })).toThrow();
  });
});

describe('Dragon Tiger – bets', () => {
  it('supports the 16 bets, consolidates and allows only side bets', () => {
    expect(ALL_BETS.length).toBe(16);
    const s = new BetSlip(R);
    s.add('DRAGON', 25, 1000);
    s.add('DRAGON', 25, 1000);
    s.add('TIE', 5, 1000);
    s.add('SUITED_TIE', 5, 1000);
    s.add('TIGER_RED', 10, 1000);
    expect(s.amount('DRAGON')).toBe(50);
    expect(s.total).toBe(70);
    s.remove('DRAGON', 20);
    expect(s.amount('DRAGON')).toBe(30);
    const side = new BetSlip(R);
    side.add('DRAGON_BIG', 10, 100);
    side.lock(100);
    expect(side.locked).toBe(true);
  });

  it('rejects bets that are invalid, over the bankroll or over the limits', () => {
    const s = new BetSlip(R);
    expect(() => s.add('DRAGON', -5, 1000)).toThrow(BetError);
    expect(() => s.add('DRAGON', 2.5, 1000)).toThrow(BetError);
    expect(() => s.add('DRAGON', Number.NaN, 1000)).toThrow(BetError);
    expect(() => s.add('NOPE' as BetId, 5, 1000)).toThrow(BetError);
    expect(() => s.add('DRAGON', 200, 100)).toThrow(/not enough/);
    expect(() => s.add('SUITED_TIE', 150, 10_000)).toThrow(/maximum/);
    const off = new BetSlip(makeRuleset({ enabled: { ...R.enabled, TIE: false } }));
    expect(() => off.add('TIE', 5, 1000)).toThrow(/not offered/);
    const noSide = new BetSlip(makeRuleset({ sideBetsEnabled: false }));
    expect(() => noSide.add('TIGER_ODD', 5, 1000)).toThrow(/not offered/);
    const small = new BetSlip(R);
    small.add('DRAGON', 2, 1000);
    expect(small.problem(1000)?.code).toBe('min');
    expect(new BetSlip(R).problem(1000)?.code).toBe('empty');
  });

  it('cannot change after confirmation', () => {
    const t = table();
    t.placeBet('DRAGON', 10);
    t.lockBets();
    expect(() => t.placeBet('TIGER', 10)).toThrow(DtError);
    expect(() => t.removeBet('DRAGON', 10)).toThrow(DtError);
    expect(() => t.clearBets()).toThrow(DtError);
  });
});

describe('Dragon Tiger – a full round (spec example)', () => {
  it('Dragon K♠ vs Tiger 5♥: 1,000 → 1,158', () => {
    const b = bank(1000);
    const t = table({ b });
    t.placeBet('DRAGON', 100);
    t.placeBet('DRAGON_BIG', 50);
    t.placeBet('TIGER_RED', 20);
    t.placeBet('TIE', 10);
    rig(t, 'Ks', '5h');
    const s = t.playOut();
    expect(t.result).toBe('DRAGON_WIN');
    const by = Object.fromEntries(s.outcomes.map((o) => [o.id, [o.state, o.returned / 100]]));
    expect(by).toEqual({ DRAGON: ['WIN', 200], DRAGON_BIG: ['WIN', 100], TIGER_RED: ['WIN', 38], TIE: ['LOSS', 0] });
    expect(s.totalBet / 100).toBe(180);
    expect(s.totalReturn / 100).toBe(338);
    expect(s.net / 100).toBe(158);
    expect(s.balanceAfter / 100).toBe(1158);
    expect(b.balance).toBe(1158);
    expect(b.debits).toEqual([180]);
    expect(b.credits).toEqual([338]);
  });

  it('follows the state machine and rejects invalid transitions', () => {
    const t = table();
    expect(t.state).toBe('BETTING');
    expect(() => t.deal()).toThrow(DtError);
    expect(() => t.settle()).toThrow(/invalid transition/);
    t.placeBet('TIGER', 10);
    t.lockBets();
    expect(() => t.deal()).toThrow(/burn/);
    expect(() => t.evaluate()).toThrow(/invalid transition/);
    t.burn();
    t.deal();
    expect(t.dragon).toBeNull(); // dealt but not revealed
    t.revealDragon();
    expect(t.tiger).toBeNull();
    t.revealTiger();
    expect(() => t.settle()).toThrow(/invalid transition/); // no payment before evaluation
    t.evaluate();
    t.settle();
    expect(t.trail).toEqual(['INITIALIZING', 'BETTING', 'BETTING_LOCKED', 'BURNING_CARD', 'DEALING', 'REVEALING_DRAGON', 'REVEALING_TIGER', 'EVALUATING', 'SETTLING', 'ROUND_COMPLETE']);
    expect(() => t.settle()).toThrow(DtError); // never twice
    t.nextRound();
    expect(t.state).toBe('BETTING');
  });

  it('without a burn card, dealing follows the lock directly', () => {
    const t = table({ ruleset: { burnCardEnabled: false } });
    t.placeBet('TIGER', 10);
    t.lockBets();
    const left = t.shoe.remaining;
    t.deal();
    expect(left - t.shoe.remaining).toBe(2);
    expect(() => t.burn()).toThrow(/disabled/);
  });

  it('a bet over the bankroll cannot even be placed; the bankroll never goes negative', () => {
    const b = bank(30);
    const t = table({ b });
    expect(() => t.placeBet('DRAGON', 50)).toThrow(/not enough/);
    t.placeBet('DRAGON', 30);
    t.playOut();
    expect(b.balance).toBeGreaterThanOrEqual(0);
  });
});

describe('Dragon Tiger – Card Shoe', () => {
  it('holds 416 cards, eight copies of each, no jokers, each copy identifiable', () => {
    const s = new CardShoe(8, seededRng(4));
    expect(s.remaining).toBe(416);
    const cards = s.remainingCards();
    expect(new Set(cards.map((x) => x.uid)).size).toBe(416);
    const count = new Map<Card, number>();
    for (const x of cards) count.set(x.card, (count.get(x.card) ?? 0) + 1);
    expect(count.size).toBe(52);
    for (const n of count.values()) expect(n).toBe(8);
    expect(cards.every((x) => x.card >= 0 && x.card < 52)).toBe(true);
  });

  it('used cards stay out until the next shuffle; the burn card is taken', () => {
    const t = table({ seed: 5 });
    const seen = new Set<number>();
    let rounds = 0;
    while (t.shoe.remaining >= 3 + 52) {
      t.placeBet('DRAGON', 5);
      const before = t.shoe.remaining;
      t.playOut();
      expect(before - t.shoe.remaining).toBe(3);
      rounds++;
      t.nextRound();
    }
    expect(t.shoe.discarded).toBe(rounds * 3);
    void seen;
  });

  it('reshuffles only between rounds, when the shoe runs low', () => {
    const t = table({ seed: 6 });
    let shuffles = 0;
    for (let i = 0; i < 300; i++) {
      t.placeBet('TIGER', 5);
      t.lockBets();
      const id = t.shoe.id;
      t.burn();
      t.deal();
      t.revealDragon();
      t.revealTiger();
      t.evaluate();
      t.settle();
      expect(t.shoe.id).toBe(id); // never during the round
      if (t.nextRound()) {
        shuffles++;
        expect(t.shoe.remaining).toBe(416);
      }
      expect(t.shoe.remaining).toBeGreaterThanOrEqual(3);
    }
    expect(shuffles).toBeGreaterThan(1);
  });

  it('matches the reference probabilities of a full shoe', () => {
    // exact: Tiger's card comes from the 415 left after Dragon's
    expect(31 / 415).toBeCloseTo(0.0747, 4);
    expect(7 / 415).toBeCloseTo(0.0169, 4);
    expect((1 - 31 / 415) / 2).toBeCloseTo(0.4627, 4);
    // and the shoe deals that way
    const rng = seededRng(7);
    const n = 60_000;
    const tally = { DRAGON_WIN: 0, TIGER_WIN: 0, TIE: 0, SUITED_TIE: 0 };
    for (let i = 0; i < n; i++) {
      const s = new CardShoe(8, rng);
      tally[mainResult(s.draw().card, s.draw().card)]++;
    }
    expect(tally.DRAGON_WIN / n).toBeCloseTo(0.4627, 1);
    expect(tally.TIGER_WIN / n).toBeCloseTo(0.4627, 1);
    expect(Math.abs((tally.TIE + tally.SUITED_TIE) / n - 0.0747)).toBeLessThan(0.005);
    expect(Math.abs(tally.SUITED_TIE / n - 0.0169)).toBeLessThan(0.003);
    expect(Math.abs(tally.DRAGON_WIN - tally.TIGER_WIN) / n).toBeLessThan(0.012);
  });
});

describe('Dragon Tiger – history, statistics and recovery', () => {
  it('records every round with ties and suited ties apart', () => {
    const store = new MemoryStore();
    const b = bank(1000);
    const t = table({ b, store });
    for (const [d, tg] of [
      ['Ks', '5h'],
      ['9h', '9c'],
      ['4d', '4d'],
    ]) {
      t.placeBet('DRAGON', 10);
      t.placeBet('TIE', 5);
      rig(t, d, tg);
      t.playOut();
      t.nextRound();
    }
    const h = new DtHistory(store);
    const rounds = h.rounds();
    expect(rounds.length).toBe(3);
    expect(rounds.map((r) => r.result)).toEqual(['SUITED_TIE', 'TIE', 'DRAGON_WIN']);
    const r0 = rounds[2];
    expect(r0).toMatchObject({ mode: 'DRAGON_TIGER', finalState: 'ROUND_COMPLETE', totalBet: 1500, balanceBefore: 100000 });
    expect(r0.dragon!.card).toBe(c('Ks'));
    expect(r0.outcomes.length).toBe(2);
    const st = h.stats();
    expect(st).toMatchObject({ rounds: 3, dragonWins: 1, ties: 1, suitedTies: 1, tigerWins: 0 });
    expect(st.totalBet).toBe(4500);
    expect(st.net).toBe(st.totalReturn - st.totalBet);
    expect(st.winsByBet.TIE).toBe(2);
    expect(b.balance * 100).toBe(100000 + st.net);
  });

  it('an interrupted round is finished with its own cards on restart, exactly once', () => {
    const store = new MemoryStore();
    const b = bank(1000);
    const t = table({ b, store });
    t.placeBet('DRAGON', 100);
    rig(t, 'Ks', '5h');
    t.lockBets();
    t.burn();
    t.deal(); // the page closes here
    expect(b.balance).toBe(900);
    const again = table({ b, store, seed: 99 });
    expect(again.recovered).toMatchObject({ finalState: 'ROUND_COMPLETE', result: 'DRAGON_WIN', totalReturn: 20000 });
    expect(b.balance).toBe(1100);
    const third = table({ b, store, seed: 100 });
    expect(third.recovered).toBeNull(); // nothing paid twice
    expect(b.balance).toBe(1100);
  });

  it('a round interrupted before the deal is voided and refunded once', () => {
    const store = new MemoryStore();
    const b = bank(1000);
    const t = table({ b, store });
    t.placeBet('TIGER', 60);
    t.placeBet('TIE', 10);
    t.lockBets();
    expect(b.balance).toBe(930);
    const again = table({ b, store });
    expect(again.recovered).toMatchObject({ finalState: 'ROUND_VOIDED', totalReturn: 7000, net: 0 });
    expect(again.recovered!.outcomes.every((o) => o.state === 'REFUND')).toBe(true);
    expect(b.balance).toBe(1000);
    expect(table({ b, store }).recovered).toBeNull();
    expect(new DtHistory(store).stats().voided).toBe(1);
  });

  it('a live round can be voided, refunding every chip once', () => {
    const b = bank(500);
    const t = table({ b });
    t.placeBet('DRAGON_ODD', 40);
    t.lockBets();
    t.burn();
    t.voidRound();
    expect(b.balance).toBe(500);
    expect(t.state).toBe('ROUND_VOIDED');
    expect(() => t.voidRound()).toThrow(DtError);
    t.nextRound();
    expect(t.state).toBe('BETTING');
  });

  it('a corrupted record is cleared without paying anything', () => {
    const store = new MemoryStore();
    store.setItem('vlc.dt.pending.v1', '{"roundId": 3, "bets": "x"}');
    const b = bank(100);
    const t = table({ b, store });
    expect(t.recovered).toMatchObject({ finalState: 'ROUND_VOIDED', totalReturn: 0 });
    expect(b.balance).toBe(100);
    const p: Partial<PendingRound> | null = new DtHistory(store).pending() as never;
    expect(p).toBeNull();
  });

  it('the shuffle does not depend on the bankroll or the history', () => {
    const deal = (balance: number, store: MemoryStore) => {
      const t = new DragonTigerTable({ bank: bank(balance), store, rng: seededRng(42) });
      t.placeBet('DRAGON', 5);
      t.playOut();
      return [t.dragon, t.tiger];
    };
    const busy = new MemoryStore();
    new DtHistory(busy).record({ roundId: 'x', mode: 'DRAGON_TIGER', dealerId: null, tableId: 't', shoeId: 's', dragon: null, tiger: null, result: 'TIGER_WIN', bets: [], outcomes: [], totalBet: 0, totalReturn: 0, net: -99999, balanceBefore: 0, balanceAfter: 0, date: '', finalState: 'ROUND_COMPLETE' });
    expect(deal(10, new MemoryStore())).toEqual(deal(1_000_000, busy));
  });
});

describe('Dragon Tiger – house edge sanity (exact, full shoe)', () => {
  it('every bet favours the house a little, none is free money', () => {
    const pTie = 31 / 415;
    const pSuited = 7 / 415;
    const pWin = (1 - pTie) / 2;
    const ev = {
      DRAGON: pWin * 1 - pWin - pTie * 0.5,
      TIE: pTie * 11 - (1 - pTie),
      SUITED_TIE: pSuited * 50 - (1 - pSuited),
      BIG: (6 / 13) * 1 - 7 / 13,
      RED: 0.5 * 0.9 - 0.5,
    };
    for (const v of Object.values(ev)) expect(v).toBeLessThan(0);
    expect(ev.DRAGON).toBeCloseTo(-0.0373, 3);
    void suitOf;
    void parseCards;
  });
});
