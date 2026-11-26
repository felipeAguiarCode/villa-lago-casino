import { describe, expect, it } from 'vitest';
import { parseCards, Shoe } from '../src/core/cards';
import { eval3 } from '../src/core/eval3';
import { Cat5, eval5 } from '../src/core/eval5';
import { seededRng } from '../src/core/rng';
import { bankerDraws, playCoup, settleBac, total } from '../src/games/baccarat/rules';
import { dealerQualifies as cspQual, settleCsp, shouldCall } from '../src/games/caribbean/rules';
import { settleTcp, shouldPlay } from '../src/games/threecard/rules';
import { dealerOuts, preflopRaise, riverBet, settleUth } from '../src/games/uth/rules';
import { holdAdvice, vpPays, vpRow } from '../src/games/videopoker/rules';

describe('Three Card Poker', () => {
  it('pays Pair Plus regardless of the dealer', () => {
    const r = settleTcp(parseCards('7s 7d 2c'), parseCards('As Ks Qs'), { ante: 0, pairPlus: 10 }, false);
    expect(r.ret.pairPlus).toBe(20);
    const sf = settleTcp(parseCards('5h 6h 7h'), parseCards('2s 3d 9c'), { ante: 0, pairPlus: 10 }, false);
    expect(sf.ret.pairPlus).toBe(410);
  });
  it('pays ante 1:1 and pushes play when the dealer does not qualify', () => {
    const r = settleTcp(parseCards('2s 5d 9c'), parseCards('Js 8d 3c'), { ante: 10, pairPlus: 0 }, true);
    expect(r.qualifies).toBe(false);
    expect(r.ret).toMatchObject({ ante: 20, play: 10 });
  });
  it('pays both and the ante bonus on a winning straight', () => {
    const r = settleTcp(parseCards('8s 9d Tc'), parseCards('Qs 5d 3c'), { ante: 10, pairPlus: 0 }, true);
    expect(r.qualifies).toBe(true);
    expect(r.anteBonus).toBe(10);
    expect(r.ret).toMatchObject({ ante: 30, play: 20 });
  });
  it('loses ante and play to a better dealer hand, folding loses the ante', () => {
    const r = settleTcp(parseCards('Ks 5d 3c'), parseCards('2s 2d 3c'), { ante: 10, pairPlus: 0 }, true);
    expect(r.ret).toMatchObject({ ante: 0, play: 0 });
    const f = settleTcp(parseCards('Ks 5d 3c'), parseCards('2s 2d 3c'), { ante: 10, pairPlus: 0 }, false);
    expect(f.ret.ante).toBe(0);
  });
  it('plays Q-6-4 or better', () => {
    expect(shouldPlay(eval3(parseCards('Qs 6d 4c')))).toBe(true);
    expect(shouldPlay(eval3(parseCards('Qs 6d 3c')))).toBe(false);
    expect(shouldPlay(eval3(parseCards('Js Td 8c')))).toBe(false);
    expect(shouldPlay(eval3(parseCards('2s 2d 3c')))).toBe(true);
  });
});

describe('Caribbean Stud', () => {
  it('dealer qualifies with Ace-King', () => {
    expect(cspQual(eval5(parseCards('As Kd 7c 5h 2s')))).toBe(true);
    expect(cspQual(eval5(parseCards('As Qd 7c 5h 2s')))).toBe(false);
  });
  it('pays the call by the paytable against a qualifying dealer', () => {
    const r = settleCsp(parseCards('9s 9d 9c 4h 2s'), parseCards('As Kd 7c 5h 3s'), { ante: 10, jackpot: 0 }, true, 1000);
    expect(r.ret).toMatchObject({ ante: 20, call: 80 }); // call 20 pays 3:1
  });
  it('pays ante only when the dealer does not qualify', () => {
    const r = settleCsp(parseCards('As Kd 7c 5h 2s'), parseCards('Qs Jd 7c 5h 3s'), { ante: 10, jackpot: 0 }, true, 1000);
    expect(r.ret).toMatchObject({ ante: 20, call: 20 });
  });
  it('jackpot pays a share of the meter for a straight flush', () => {
    const r = settleCsp(parseCards('5h 6h 7h 8h 9h'), parseCards('As Kd 7c 5c 3s'), { ante: 10, jackpot: 5 }, false, 30000);
    expect(r.ret.jackpot).toBe(3005);
  });
  it('strategy calls with a pair', () => {
    expect(shouldCall(parseCards('2s 2d 7c 5h 9s'), parseCards('Kc')[0])).toBe(true);
    expect(shouldCall(parseCards('Qs Jd 7c 5h 9s'), parseCards('Kc')[0])).toBe(false);
  });
  it('strategy plays Ace-King by the A-K-J-8-3 rule and the matching dealer card', () => {
    const up = (c: string) => parseCards(c)[0];
    expect(shouldCall(parseCards('As Kd Jc 8h 3s'), up('5c'))).toBe(true);
    expect(shouldCall(parseCards('As Kd Jc 8h 2s'), up('5c'))).toBe(false);
    expect(shouldCall(parseCards('As Kd Qc 4h 2s'), up('9c'))).toBe(true);
    expect(shouldCall(parseCards('As Kd 9c 5h 2s'), up('9c'))).toBe(true);
    expect(shouldCall(parseCards('As Kd 9c 5h 2s'), up('Tc'))).toBe(false);
  });
  it('call strategy returns roughly 94.8% of the ante (house edge ~5.2%)', () => {
    const rng = seededRng(3);
    let staked = 0;
    let back = 0;
    for (let n = 0; n < 120000; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 41; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const p = deck.slice(42, 47);
      const d = deck.slice(47, 52);
      const call = shouldCall(p, d[0]);
      const r = settleCsp(p, d, { ante: 1, jackpot: 0 }, call, 0);
      staked += 1;
      back += r.ret.ante + r.ret.call - (call ? 2 : 0);
    }
    const edge = 1 - back / staked;
    expect(edge).toBeGreaterThan(0.03);
    expect(edge).toBeLessThan(0.075);
  });
});

describe("Ultimate Texas Hold'em", () => {
  it('ante pushes when the dealer does not qualify, blind pays 3:2 for a flush', () => {
    const r = settleUth(parseCards('Ah 9h'), parseCards('Kc 7d'), parseCards('2h 5h Th 3s 8c'), { ante: 10, blind: 10, trips: 10 }, 40, false);
    expect(r.qualifies).toBe(false);
    expect(r.player.cat).toBe(Cat5.Flush);
    expect(r.ret).toMatchObject({ ante: 10, play: 80, blind: 25, trips: 80 });
  });
  it('everything loses to a better qualifying dealer', () => {
    const r = settleUth(parseCards('Ah 9d'), parseCards('Kc Kd'), parseCards('2h 5s Th 3s 8c'), { ante: 10, blind: 10, trips: 0 }, 10, false);
    expect(r.ret).toMatchObject({ ante: 0, play: 0, blind: 0 });
  });
  it('river: bets with fewer than 21 dealer outs, folds a bare board', () => {
    // nut hand: no outs at all
    expect(dealerOuts(parseCards('Ah Kh'), parseCards('Qh Jh Th 3s 2c'))).toBe(0);
    expect(riverBet(parseCards('Ah Kh'), parseCards('Qh Jh Th 3s 2c'))).toBe(true);
    // playing the board with low cards: too many outs
    expect(riverBet(parseCards('3d 2c'), parseCards('Kh Qs 9d 7c 5h'))).toBe(false);
  });
  it('pre-flop strategy', () => {
    expect(preflopRaise(parseCards('As 2d'))).toBe(true);
    expect(preflopRaise(parseCards('2s 2d'))).toBe(false);
    expect(preflopRaise(parseCards('Ks 4d'))).toBe(false);
    expect(preflopRaise(parseCards('Ks 4s'))).toBe(true);
  });
});

describe('Baccarat', () => {
  it('follows the third-card table', () => {
    expect(bankerDraws(3, 8)).toBe(false);
    expect(bankerDraws(3, 9)).toBe(true);
    expect(bankerDraws(4, 1)).toBe(false);
    expect(bankerDraws(6, 7)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
    expect(bankerDraws(5, null)).toBe(true);
    expect(total(parseCards('Kh 9d 5c'))).toBe(4);
  });
  it('banker and player return about 98.9% and 98.8%', () => {
    const shoe = new Shoe(8, 0.85, seededRng(7));
    let b = 0;
    let p = 0;
    const N = 300000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle) shoe.shuffle();
      const coup = playCoup(shoe);
      const r = settleBac(coup.winner, { player: 1, banker: 1, tie: 0 });
      b += r.banker;
      p += r.player;
    }
    expect(b / N).toBeGreaterThan(0.982);
    expect(b / N).toBeLessThan(0.997);
    expect(p / N).toBeGreaterThan(0.98);
    expect(p / N).toBeLessThan(0.996);
  });
});

describe('Video Poker', () => {
  it('pays the 9/6 table', () => {
    expect(vpPays(vpRow(eval5(parseCards('Js Jd 4c 7h 9s'))), 1)).toBe(1);
    expect(vpPays(vpRow(eval5(parseCards('Ts Td 4c 7h 9s'))), 5)).toBe(0);
    expect(vpPays(vpRow(eval5(parseCards('As Ks Qs Js Ts'))), 5)).toBe(4000);
    expect(vpPays(vpRow(eval5(parseCards('2s 2d 2c 7h 7s'))), 2)).toBe(18);
  });
  it('holds the textbook cards', () => {
    expect(holdAdvice(parseCards('As Ks Qs Js 2d')).sort()).toEqual([0, 1, 2, 3]);
    expect(holdAdvice(parseCards('Js Jd 4c 7h 9s')).sort()).toEqual([0, 1]);
    expect(holdAdvice(parseCards('2s 7s 9s Js 4d')).sort()).toEqual([0, 1, 2, 3]);
    expect(holdAdvice(parseCards('2c 5d 8h 9s 3d'))).toEqual([]);
  });
  it('simple strategy returns close to 99.5%', () => {
    const rng = seededRng(99);
    let ret = 0;
    const N = 150000;
    for (let n = 0; n < N; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const hand = deck.slice(0, 5);
      const hold = new Set(holdAdvice(hand));
      let k = 5;
      const fin = hand.map((c, i) => (hold.has(i) ? c : deck[k++]));
      ret += vpPays(vpRow(eval5(fin)), 1);
    }
    const rtp = ret / N;
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(1.04);
  });
});

import { flopRaise } from '../src/games/uth/rules';

describe("Ultimate Texas Hold'em full-strategy simulation", () => {
  it('house edge with the hint strategy is close to the published ~2.4% of the ante', () => {
    const rng = seededRng(11);
    let net = 0;
    const N = 40000;
    for (let n = 0; n < N; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 42; i--) {
        const j = rng(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const [h1, h2, d1, d2, ...board] = deck.slice(43, 52);
      const hole = [h1, h2];
      let play = 0;
      let folded = false;
      if (preflopRaise(hole)) play = 4;
      else if (flopRaise(hole, board.slice(0, 3))) play = 2;
      else if (riverBet(hole, board)) play = 1;
      else folded = true;
      const r = settleUth(hole, [d1, d2], board, { ante: 1, blind: 1, trips: 0 }, play, folded);
      net += r.ret.ante + r.ret.blind + r.ret.play - (2 + play);
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.04);
  });
});
