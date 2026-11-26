import { describe, expect, it } from 'vitest';
import { levelBonus, PROGRESSION, totalXpTo, xpForHand, xpForLevel } from '../src/core/progression';
import { Wallet } from '../src/core/wallet';

describe('progression curve', () => {
  it('starts quick and asks for more XP at every level', () => {
    expect(xpForLevel(1)).toBe(100);
    let prevStep = 0;
    for (let l = 1; l < 60; l++) {
      const step = xpForLevel(l + 1) - xpForLevel(l);
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
      // the increase itself keeps growing (an accelerating curve, not a straight line)
      if (l > 2) expect(step).toBeGreaterThanOrEqual(prevStep);
      prevStep = step;
    }
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(2) * 8);
  });

  it('rounds every requirement to the XP step', () => {
    for (let l = 1; l < 40; l++) expect(xpForLevel(l) % PROGRESSION.step).toBe(0);
  });

  it('gives more XP for bigger bets, with diminishing returns', () => {
    expect(xpForHand(0)).toBe(10);
    expect(xpForHand(25)).toBe(14);
    expect(xpForHand(100)).toBeGreaterThan(xpForHand(25));
    expect(xpForHand(1000)).toBeGreaterThan(xpForHand(100));
    // 40× the stake gives far less than 40× the extra XP
    expect(xpForHand(1000) - 10).toBeLessThan(10 * (xpForHand(25) - 10));
  });

  it('levels up through the wallet, keeps the remainder and pays the bonus', () => {
    const w = new Wallet();
    w.reset();
    const before = w.balance;
    let hands = 0;
    while (w.s.level < 2) {
      w.addHand(25, 0);
      hands++;
    }
    expect(hands).toBe(Math.ceil(100 / xpForHand(25)));
    expect(w.balance).toBe(before + levelBonus(2));
    expect(w.s.xp).toBe(hands * xpForHand(25) - 100);
    expect(w.xpFrac).toBeGreaterThanOrEqual(0);
    expect(w.xpFrac).toBeLessThan(1);
  });

  it('several levels from one big result are all counted', () => {
    const w = new Wallet();
    w.reset();
    w.s.xp = totalXpTo(4) - xpForHand(0);
    const r = w.addHand(0, 0);
    expect(r.levelUp).toBe(4);
    expect(w.s.level).toBe(4);
    expect(r.bonus).toBe(levelBonus(2) + levelBonus(3) + levelBonus(4));
  });

  it('pacing: hands needed to reach a level at a 50-chip bet', () => {
    const per = xpForHand(50);
    const hands = (l: number) => Math.ceil(totalXpTo(l) / per);
    const oldHands = (l: number) => {
      let xp = 0;
      for (let k = 1; k < l; k++) xp += 100 + 60 * (k - 1);
      return Math.ceil(xp / (10 + Math.floor(50 / 25)));
    };
    const rows = [2, 3, 5, 10, 15, 20, 30].map((l) => `L${l}: ${hands(l)} hands (was ${oldHands(l)})`);
    console.log(rows.join('\n'));
    expect(hands(2)).toBeLessThan(10);
    expect(hands(20)).toBeGreaterThan(oldHands(20));
  });
});
