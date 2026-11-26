import { describe, expect, it } from 'vitest';
import { parseCards, Shoe } from '../src/core/cards';
import { eval3 } from '../src/core/eval3';
import { seededRng } from '../src/core/rng';
import { bonusPays, betStreet, playPreflop, settleThb } from '../src/games/thb/rules';
import { c4Advice, settleC4 } from '../src/games/crazy4/rules';
import { bestFlush, dealerQualifies as hcfQual, hcfAdvice, longestStraightFlush, settleHcf } from '../src/games/hcf/rules';
import { slotPays } from '../src/games/slot3/rules';
import { allowedMultiples, bestPlay, dealerDrawIndex, primeMult, settleMain } from '../src/games/threecard/modes';
import { BlackjackRound } from '../src/games/blackjack/rules';

const C = (s: string) => parseCards(s);
const shuffled = (rng: (n: number) => number) => {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = rng(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

describe('Three Card Poker modes', () => {
  it('ultimate allows bigger raises only with strong hands', () => {
    expect(allowedMultiples('ultimate', eval3(C('Ks 9d 4c')))).toEqual([1]);
    expect(allowedMultiples('ultimate', eval3(C('As 9d 4c')))).toEqual([1, 2]);
    expect(allowedMultiples('ultimate', eval3(C('7s 7d 4c')))).toEqual([1, 2, 3]);
    expect(allowedMultiples('classic', eval3(C('7s 7d 4c')))).toEqual([1]);
  });
  it('settles each mode', () => {
    const p = eval3(C('7s 7d 4c'));
    const nq = eval3(C('Js 9d 4h'));
    expect(settleMain('classic', p, nq, 10, 10)).toMatchObject({ ante: 20, play: 10 });
    expect(settleMain('ultimate', p, nq, 10, 30)).toMatchObject({ ante: 10, play: 30 });
    expect(settleMain('holdem', p, nq, 10, 10)).toMatchObject({ ante: 20, play: 20 });
    const tie = eval3(C('7h 7c 4d'));
    expect(settleMain('faceup', p, tie, 10, 10)).toMatchObject({ ante: 0, play: 0 });
    expect(settleMain('classic', p, tie, 10, 10)).toMatchObject({ ante: 10, play: 10 });
    const st = eval3(C('5s 6d 7c'));
    expect(settleMain('classic', st, eval3(C('Ks Kd 2c')), 10, 10).bonus).toBe(10);
    expect(settleMain('faceup', st, eval3(C('Ks Kd 2c')), 10, 10).bonus).toBe(0);
  });
  it('prime pays on colours', () => {
    expect(primeMult(C('2h 5d 9h'), C('Kc Qs 2s'))).toBe(3);
    expect(primeMult(C('2h 5d 9h'), C('Kh Qd 2d'))).toBe(4);
    expect(primeMult(C('2h 5s 9h'), C('Kh Qd 2d'))).toBe(0);
  });
  it('dealer draws his lowest card without a pair', () => {
    expect(dealerDrawIndex(C('Ks 4d 9c'))).toBe(1);
    expect(dealerDrawIndex(C('Ks Kd 9c'))).toBe(-1);
  });
  it('the hint folds trash and raises big with trips in Ultimate', () => {
    const pool = (known: number[]) => Array.from({ length: 52 }, (_, i) => i).filter((c) => !known.includes(c));
    const trash = C('7s 4d 2c');
    expect(bestPlay({ mode: 'classic', player: trash, pool: pool(trash) }, 6000, seededRng(1)).m).toBe(0);
    const trips = C('9s 9d 9c');
    expect(bestPlay({ mode: 'ultimate', player: trips, pool: pool(trips) }, 400, seededRng(1)).m).toBe(3);
  });
});

describe("Texas Hold'em Bonus", () => {
  it('bonus paytable', () => {
    expect(bonusPays(C('As Ad'), C('Ac Ah'))).toBe(1000);
    expect(bonusPays(C('As Ad'), C('Kc Ah'))).toBe(30);
    expect(bonusPays(C('As Ks'), C('2c 3h'))).toBe(25);
    expect(bonusPays(C('As Kd'), C('2c 3h'))).toBe(15);
    expect(bonusPays(C('As Js'), C('2c 3h'))).toBe(20);
    expect(bonusPays(C('Qs Qd'), C('2c 3h'))).toBe(10);
    expect(bonusPays(C('5s 5d'), C('2c 3h'))).toBe(3);
    expect(bonusPays(C('9s 5d'), C('2c 3h'))).toBe(0);
  });
  it('ante pays only with a straight or better', () => {
    const bets = { ante: 10, flop: 20, turn: 10, river: 10, bonus: 0 };
    const pair = settleThb(C('Ks Kd'), C('2c 3h'), C('9s 7d 4c Jh Qs'), bets, false);
    expect(pair.ret).toMatchObject({ ante: 10, flop: 40, turn: 20, river: 20 });
    const st = settleThb(C('8s 6d'), C('2c 3h'), C('9s 7d 5c Jh Ks'), bets, false);
    expect(st.ret.ante).toBe(20);
  });
  it('strategy keeps a modest house edge', () => {
    const rng = seededRng(3);
    let net = 0;
    const N = 20000;
    for (let n = 0; n < N; n++) {
      const d = shuffled(rng);
      const hole = d.slice(0, 2);
      const dealer = d.slice(2, 4);
      const board = d.slice(4, 9);
      if (!playPreflop(hole)) {
        net -= 1;
        continue;
      }
      const turn = betStreet(hole, board.slice(0, 3)) ? 1 : 0;
      const river = betStreet(hole, board.slice(0, 4)) ? 1 : 0;
      const r = settleThb(hole, dealer, board, { ante: 1, flop: 2, turn, river, bonus: 0 }, false);
      net += r.ret.ante + r.ret.flop + r.ret.turn + r.ret.river - (3 + turn + river);
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.08);
  });
});

describe('Crazy 4 Poker', () => {
  it('settles ante, play, super bonus', () => {
    const bets = { ante: 10, superBonus: 10, queensUp: 5 };
    const r = settleC4(C('Ks Kd 7c 5h 2s'), C('Qs Jd 8c 5c 3h'), bets, 10);
    expect(r.opens).toBe(false);
    expect(r.ret).toMatchObject({ ante: 10, play: 20, superBonus: 10, queensUp: 10 });
    const q = settleC4(C('As Ad Ac Ah 2s'), C('Ks Kd 8c 5c 3h'), bets, 30);
    expect(q.ret.superBonus).toBe(2010);
  });
  it('simple strategy', () => {
    expect(c4Advice(C('As Ad 7c 5h 2s'))).toBe(3);
    expect(c4Advice(C('Ks Qd 8c 4h 2s'))).toBe(1);
    expect(c4Advice(C('Ks Qd 7c 4h 2s'))).toBe(0);
  });
  it('house edge near the published 3.4 %', () => {
    const rng = seededRng(4);
    let net = 0;
    const N = 60000;
    for (let n = 0; n < N; n++) {
      const d = shuffled(rng);
      const m = c4Advice(d.slice(0, 5));
      const r = settleC4(d.slice(0, 5), d.slice(5, 10), { ante: 1, superBonus: 1, queensUp: 0 }, m);
      net += r.ret.ante + r.ret.superBonus + r.ret.play - 2 - m;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.07);
  });
});

describe('High Card Flush', () => {
  it('ranks by flush length, then high cards', () => {
    expect(bestFlush(C('2h 5h 9h Jh As Kd 3c')).ranks).toEqual([11, 9, 5, 2]);
    expect(bestFlush(C('Ah 4h 3h 2h')).score).toBeGreaterThan(bestFlush(C('Ks Qs Js Ts')).score);
    expect(hcfQual(bestFlush(C('9h 5h 2h Kd 3c 4s 7d')))).toBe(true);
    expect(hcfQual(bestFlush(C('8h 5h 2h Kd 3c 4s 7d')))).toBe(false);
    expect(longestStraightFlush(C('Ah 2h 3h 4h 9c Kd 7s'))).toBe(4);
  });
  it('strategy and payouts', () => {
    expect(hcfAdvice(bestFlush(C('Th 8h 6h 2c 3d 9s Kd')))).toBe(1);
    expect(hcfAdvice(bestFlush(C('Th 7h 5h 2c 3d 9s Kd')))).toBe(0);
    expect(hcfAdvice(bestFlush(C('2h 3h 4h 5h 6h 9s Kd')))).toBe(2);
    const r = settleHcf(C('2h 3h 4h 5h Kh 9s Kd'), C('8c 5c 2c Kd 3s 4s 7h'), { ante: 10, flush: 5, sflush: 5 }, 20);
    expect(r.qualifies).toBe(false);
    expect(r.ret).toMatchObject({ ante: 20, raise: 20, flush: 55, sflush: 305 });
  });
  it('house edge near the published 2.7 %', () => {
    const rng = seededRng(5);
    let net = 0;
    const N = 60000;
    for (let n = 0; n < N; n++) {
      const d = shuffled(rng);
      const m = hcfAdvice(bestFlush(d.slice(0, 7)));
      const r = settleHcf(d.slice(0, 7), d.slice(7, 14), { ante: 1, flush: 0, sflush: 0 }, m);
      net += r.ret.ante + r.ret.raise - 1 - m;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.05);
  });
});

describe('Slot Machine Three Card Poker', () => {
  it('returns 98.8 % per coin (exact enumeration)', () => {
    let ret = 0;
    let n = 0;
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++) {
          ret += slotPays([a, b, c], 1);
          n++;
        }
    expect(ret / n).toBeGreaterThan(0.985);
    expect(ret / n).toBeLessThan(0.99);
    expect(slotPays(C('As Ks Qs'), 5)).toBe(750);
    expect(slotPays(C('As Ks Qs'), 1)).toBe(101);
  });
});

describe('Video Blackjack (single split)', () => {
  it('allows only one split', () => {
    const shoe = new Shoe(1, 1.01, seededRng(1));
    shoe.stack = C('8s 6d 8c Th 8h 2c');
    const r = new BlackjackRound(shoe, 10, { maxHands: 2 });
    r.start();
    expect(r.actions(1000).split).toBe(true);
    r.split();
    expect(r.hands.length).toBe(2);
    expect(r.actions(1000).split).toBe(false);
  });
});

import { MultiHandRound } from '../src/games/videobj/rules';
import { basicStrategy } from '../src/games/blackjack/strategy';

describe('Video Blackjack (multi-hand)', () => {
  it('plays several hands against one dealer hand, in order', () => {
    const shoe = new Shoe(1, 1.01, seededRng(2));
    // dealer: 9 up, 7 hole · seat0: T 8 (stand) · seat1: 5 6 (double -> 9) · seat2: A K (blackjack) · dealer draws 2 -> 18
    shoe.stack = C('9s 7d Ts 8h 5c 6d 9c Ah Kd 2s');
    const r = new MultiHandRound(shoe, [10, 10, 10]);
    const ev0 = r.start();
    expect(ev0.filter((e) => e.t === 'dealer').length).toBe(2);
    expect(r.seat).toBe(0);
    r.stand();
    expect(r.seat).toBe(1);
    expect(r.actions(1000).double).toBe(true);
    const ev = r.double();
    // seat 2 opens with a blackjack and the dealer plays right away
    expect(ev.some((e) => e.t === 'handDone' && e.seat === 2 && e.reason === 'blackjack')).toBe(true);
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.results.map((x) => [x.outcome, x.ret])).toEqual([
      ['push', 10],
      ['win', 40],
      ['blackjack', 25],
    ]);
  });
  it('dealer blackjack settles every hand at once', () => {
    const shoe = new Shoe(1, 1.01, seededRng(3));
    shoe.stack = C('As Kd Ts 8h Ah Kc');
    const r = new MultiHandRound(shoe, [10, 10]);
    const ev = r.start();
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.results.map((x) => x.outcome)).toEqual(['lose', 'push']);
  });
  it('one split per hand', () => {
    const shoe = new Shoe(1, 1.01, seededRng(4));
    shoe.stack = C('9s 7d 8s 8h 8d 3c');
    const r = new MultiHandRound(shoe, [10]);
    r.start();
    expect(r.actions(1000).split).toBe(true);
    r.split();
    expect(r.seats[0].length).toBe(2);
    expect(r.actions(1000).split).toBe(false);
  });
  it('basic strategy over many rounds returns close to 99.5%', () => {
    const rng = seededRng(9);
    let staked = 0;
    let back = 0;
    for (let n = 0; n < 4000; n++) {
      const shoe = new Shoe(1, 1.01, rng);
      const r = new MultiHandRound(shoe, [1, 1, 1]);
      let ev = r.start();
      let guard = 0;
      while (r.phase === 'player' && guard++ < 60) {
        const a = r.actions(1e9);
        const m = basicStrategy(r.current.cards, r.dealerUp, a.double, a.split);
        ev = m === 'split' ? r.split() : m === 'double' ? r.double() : m === 'hit' ? r.hit() : r.stand();
      }
      const s = ev.find((e) => e.t === 'settle');
      if (s && s.t === 'settle') for (const x of s.results) {
        staked += x.bet;
        back += x.ret;
      }
    }
    expect(back / staked).toBeGreaterThan(0.95);
    expect(back / staked).toBeLessThan(1.04);
  });
});
