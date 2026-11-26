import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { eval5 } from '../src/core/eval5';
import { settleWar } from '../src/games/war/rules';
import { lirPays, rideFirst, rideSecond, settleLir } from '../src/games/letitride/rules';
import { classify, settleRd, shouldRaise } from '../src/games/reddog/rules';

const C = (s: string) => parseCards(s);

describe('Casino War', () => {
  it('pays 1:1 on a higher card, loses on a lower one', () => {
    expect(settleWar(C('Ks')[0], C('9d')[0], { bet: 10, tie: 0 }).ret.bet).toBe(20);
    expect(settleWar(C('2s')[0], C('9d')[0], { bet: 10, tie: 0 }).ret.bet).toBe(0);
  });
  it('tie: surrender returns half, war win pays the raise and pushes the bet, tie bet 10:1', () => {
    const s = settleWar(C('7s')[0], C('7d')[0], { bet: 10, tie: 5 }, 'surrender');
    expect(s.ret).toEqual({ bet: 5, tie: 55, war: 0 });
    const w = settleWar(C('7s')[0], C('7d')[0], { bet: 10, tie: 0 }, 'war', { p: C('Qs')[0], d: C('3c')[0] });
    expect(w.ret).toEqual({ bet: 10, tie: 0, war: 20 });
    const l = settleWar(C('7s')[0], C('7d')[0], { bet: 10, tie: 0 }, 'war', { p: C('3s')[0], d: C('Qc')[0] });
    expect(l.ret).toEqual({ bet: 0, tie: 0, war: 0 });
  });
  it('always going to war keeps the house edge near 2.9%', () => {
    const rng = seededRng(5);
    let net = 0;
    const N = 200000;
    const draw = () => rng(52);
    for (let i = 0; i < N; i++) {
      const p = draw();
      const d = draw();
      const r = settleWar(p, d, { bet: 1, tie: 0 }, 'war', { p: draw(), d: draw() });
      const staked = 1 + (r.outcome.startsWith('war') ? 1 : 0);
      net += r.ret.bet + r.ret.war - staked;
    }
    expect(-net / N).toBeGreaterThan(0.015);
    expect(-net / N).toBeLessThan(0.045);
  });
});

describe('Let It Ride', () => {
  it('pays Tens or better', () => {
    expect(lirPays(eval5(C('Ts Td 4c 7h 9s')))).toBe(1);
    expect(lirPays(eval5(C('9s 9d 4c 7h Ks')))).toBe(0);
    expect(settleLir(C('As Ks Qs Js Ts'), { b1: 10, b2: 10, b3: 10 }).ret.b3).toBe(10010);
  });
  it('first decision strategy', () => {
    expect(rideFirst(C('Ts Td 4c'))).toBe(true);
    expect(rideFirst(C('9s 9d 4c'))).toBe(false);
    expect(rideFirst(C('Qh Kh Ah'))).toBe(true);
    expect(rideFirst(C('5h 6h 7h'))).toBe(true);
    expect(rideFirst(C('2h 3h 4h'))).toBe(false);
    expect(rideFirst(C('5h 6h 8h'))).toBe(false);
    expect(rideFirst(C('8h 9h Jh'))).toBe(true);
  });
  it('second decision strategy', () => {
    expect(rideSecond(C('2h 7h 9h Kh'))).toBe(true);
    expect(rideSecond(C('5s 6d 7c 8h'))).toBe(false);
    expect(rideSecond(C('7s 8d 9c Th'))).toBe(true);
    expect(rideSecond(C('Ts Jd Qc Ah'))).toBe(true);
    expect(rideSecond(C('2s 5d 9c Kh'))).toBe(false);
  });
  it('basic strategy returns about 96.5% (house edge ~3.5%)', () => {
    const rng = seededRng(21);
    let net = 0;
    const N = 400000; // high-variance game (royal pays 1000:1): needs a big sample
    for (let n = 0; n < N; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 46; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const hand = deck.slice(47, 52);
      const riding: Record<string, number> = { b3: 1 };
      if (rideFirst(hand.slice(0, 3))) riding.b1 = 1;
      if (rideSecond(hand.slice(0, 4))) riding.b2 = 1;
      const r = settleLir(hand, riding);
      for (const [id, b] of Object.entries(riding)) net += r.ret[id] - b;
    }
    // edge per unit (one of the three bets): published ~3.51%
    expect(-net / N).toBeGreaterThan(0.02);
    expect(-net / N).toBeLessThan(0.05);
  });
});

describe('Red Dog', () => {
  it('classifies and pays by spread', () => {
    expect(classify(C('5s')[0], C('6d')[0]).kind).toBe('consecutive');
    expect(classify(C('5s')[0], C('5d')[0]).kind).toBe('pair');
    expect(classify(C('5s')[0], C('Td')[0]).spread).toBe(4);
    expect(settleRd(C('5s')[0], C('7d')[0], C('6c')[0], { bet: 10, raise: 0 }).ret.bet).toBe(60);
    expect(settleRd(C('5s')[0], C('Td')[0], C('7c')[0], { bet: 10, raise: 10 }).ret).toEqual({ bet: 20, raise: 20 });
    expect(settleRd(C('5s')[0], C('Td')[0], C('Jc')[0], { bet: 10, raise: 10 }).ret).toEqual({ bet: 0, raise: 0 });
    expect(settleRd(C('5s')[0], C('5d')[0], C('5c')[0], { bet: 10, raise: 0 }).ret.bet).toBe(120);
    expect(settleRd(C('5s')[0], C('6d')[0], null, { bet: 10, raise: 0 }).ret.bet).toBe(10);
  });
  it('raise strategy', () => {
    expect(shouldRaise(7)).toBe(true);
    expect(shouldRaise(6)).toBe(false);
  });
});

import { evalLow, houseWay, settlePg, validSplit } from '../src/games/paigow/rules';

describe('Pai Gow Poker', () => {
  it('validates splits (high hand must beat the low hand)', () => {
    expect(validSplit(C('As 9d 7c 5h 3s'), C('Kd Qc'))).toBe(true);
    expect(validSplit(C('Ks 9d 7c 5h 3s'), C('Ad Qc'))).toBe(false);
    expect(validSplit(C('Ks 9d 7c 5h 3s'), C('Qd Qc'))).toBe(false);
    expect(validSplit(C('Ks Kd 7c 5h 3s'), C('Qd Qc'))).toBe(true);
  });
  it('house way: no pair keeps the top card high and the next two low', () => {
    const s = houseWay(C('As Kd 9c 7h 5s 3d 2c'));
    expect(evalLow(s.low).ranks).toEqual([13, 9]);
  });
  it('house way: one pair stays high, two best singles go low', () => {
    const s = houseWay(C('8s 8d Ac Kh 5s 3d 2c'));
    expect(evalLow(s.low).ranks).toEqual([14, 13]);
  });
  it('house way: two high pairs are split', () => {
    const s = houseWay(C('Ks Kd Qc Qh 5s 3d 2c'));
    expect(evalLow(s.low)).toMatchObject({ pair: true, ranks: [12, 12] });
  });
  it('house way: low two pair with an ace stays together', () => {
    const s = houseWay(C('6s 6d 4c 4h As 9d 2c'));
    expect(evalLow(s.low).ranks[0]).toBe(14);
  });
  it('house way always produces a valid split', () => {
    const rng = seededRng(77);
    for (let n = 0; n < 3000; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 44; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const s = houseWay(deck.slice(45, 52));
      expect(s.high.length).toBe(5);
      expect(s.low.length).toBe(2);
      expect(validSplit(s.high, s.low)).toBe(true);
    }
  });
  it('settles: both win pays 0.95, one each pushes, copies go to the dealer', () => {
    const p = { high: C('As Ad 9c 5h 3s'), low: C('Kd Qc') };
    const d = { high: C('Ks Kh 8c 6h 4s'), low: C('Jd Tc') };
    expect(settlePg(p, d, 20).ret).toBe(39);
    const d2 = { high: C('Ks Kh 8c 6h 4s'), low: C('Ah Tc') };
    expect(settlePg(p, d2, 20).outcome).toBe('push');
    const d3 = { high: C('Ac Ah 9d 5s 3c'), low: C('Kh Qs') };
    expect(settlePg(p, d3, 20).outcome).toBe('lose');
  });
  it('house way vs house way pushes ~41% of hands', () => {
    const rng = seededRng(9);
    let push = 0;
    const N = 20000;
    for (let n = 0; n < N; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 37; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const r = settlePg(houseWay(deck.slice(38, 45)), houseWay(deck.slice(45, 52)), 1);
      if (r.outcome === 'push') push++;
    }
    expect(push / N).toBeGreaterThan(0.35);
    expect(push / N).toBeLessThan(0.48);
  });
});
