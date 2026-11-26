import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { Cat3, eval3 } from '../src/core/eval3';
import { bestOf, Cat5, eval5 } from '../src/core/eval5';

describe('eval3 (Three Card Poker ranking)', () => {
  it('matches the exact distribution of all 22,100 hands', () => {
    const counts = new Array(6).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) counts[eval3([a, b, c]).cat]++;
    expect(counts[Cat3.StraightFlush]).toBe(48);
    expect(counts[Cat3.Trips]).toBe(52);
    expect(counts[Cat3.Straight]).toBe(720);
    expect(counts[Cat3.Flush]).toBe(1096);
    expect(counts[Cat3.Pair]).toBe(3744);
    expect(counts[Cat3.High]).toBe(16440);
  });

  it('orders hands correctly', () => {
    const s = (x: string) => eval3(parseCards(x)).score;
    expect(s('Qs Ks As')).toBeGreaterThan(s('2h 3h 4h'));
    expect(s('As 2d 3c')).toBeLessThan(s('2s 3d 4c')); // A-2-3 is the lowest straight
    expect(s('2s 3d 4c')).toBeGreaterThan(s('Ah Kh 9h')); // straight beats flush
    expect(s('Qs 9d 5c')).toBeGreaterThan(s('Js Td 8c'));
    expect(s('8s 8d Ac')).toBeGreaterThan(s('8h 8c Kc'));
  });
});

describe('eval5', () => {
  it('matches the exact distribution of all 2,598,960 hands', () => {
    const counts = new Array(10).fill(0);
    const h = [0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++) counts[eval5(h).cat]++;
    expect(counts[Cat5.Royal]).toBe(4);
    expect(counts[Cat5.StraightFlush]).toBe(36);
    expect(counts[Cat5.Quads]).toBe(624);
    expect(counts[Cat5.FullHouse]).toBe(3744);
    expect(counts[Cat5.Flush]).toBe(5108);
    expect(counts[Cat5.Straight]).toBe(10200);
    expect(counts[Cat5.Trips]).toBe(54912);
    expect(counts[Cat5.TwoPair]).toBe(123552);
    expect(counts[Cat5.Pair]).toBe(1098240);
    expect(counts[Cat5.High]).toBe(1302540);
  });

  it('compares kickers and wheels', () => {
    const s = (x: string) => eval5(parseCards(x)).score;
    expect(s('As 2d 3c 4h 5s')).toBeLessThan(s('2s 3d 4c 5h 6s'));
    expect(s('Ks Kd 9c 9h 2s')).toBeLessThan(s('Ks Kd 9c 9h As'));
    expect(s('Ks Kd 9c 9h As')).toBeGreaterThan(s('Ks Kd 9c 9h Qs'));
    expect(s('Ah Kh Qh Jh 9h')).toBeGreaterThan(s('Ad Kd Qd Jd 8d'));
  });

  it('finds the best hand out of 7 cards', () => {
    const b = bestOf(parseCards('2c 9h Th Jh Qh Kh Ks'));
    expect(b.cat).toBe(Cat5.StraightFlush);
    expect(b.ranks[0]).toBe(13);
    expect(bestOf(parseCards('As Ad Ac Kh Kd 2s 3s')).cat).toBe(Cat5.FullHouse);
  });
});
