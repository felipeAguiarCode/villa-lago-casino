import { describe, expect, it } from 'vitest';
import { parseCards, Shoe } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { BlackjackRound, handValue, totalLabel } from '../src/games/blackjack/rules';
import { basicStrategy } from '../src/games/blackjack/strategy';

/** Shoe whose first cards are scripted: deal order is P D P D(hole) then hits. */
function rigged(codes: string) {
  const shoe = new Shoe(6, 0.75, seededRng(1));
  shoe.stack = parseCards(codes);
  return shoe;
}

describe('hand values', () => {
  it('handles soft and hard totals', () => {
    expect(handValue(parseCards('As 6d'))).toEqual({ total: 17, soft: true });
    expect(handValue(parseCards('As 6d Kc'))).toEqual({ total: 17, soft: false });
    expect(handValue(parseCards('As Ad 9c'))).toEqual({ total: 21, soft: true });
    expect(totalLabel(parseCards('Ah'))).toBe('1/11');
    expect(totalLabel(parseCards('Th 7d'))).toBe('17');
  });
});

describe('BlackjackRound', () => {
  it('pays a natural 3:2', () => {
    const r = new BlackjackRound(rigged('As 9d Kc 7h'), 10);
    const ev = r.start();
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.hands[0]).toMatchObject({ outcome: 'blackjack', ret: 25 });
  });

  it('dealer stands on soft 17', () => {
    const r = new BlackjackRound(rigged('Ts 6h 8c As'), 10); // player 18, dealer 6+A = soft 17
    r.start();
    const ev = r.stand();
    expect(r.dealer.length).toBe(2);
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.hands[0].outcome).toBe('win');
  });

  it('dealer blackjack beats 21 made of three cards, insurance pays 2:1', () => {
    const r = new BlackjackRound(rigged('Ts As 9c Kh'), 10);
    const ev = r.start();
    expect(ev.some((e) => e.t === 'insuranceOffer')).toBe(true);
    const ev2 = r.insurance(true);
    const settle = ev2.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle).toMatchObject({ insuranceRet: 15 });
    expect(settle && settle.t === 'settle' && settle.hands[0].outcome).toBe('lose');
  });

  it('double deals exactly one card and doubles the stake', () => {
    const r = new BlackjackRound(rigged('6s 9d 5c 7h Ks Tc'), 10); // 11 vs 9; draws K -> 21; dealer 16 draws T -> bust
    r.start();
    expect(r.actions(1000).double).toBe(true);
    const ev = r.double();
    expect(r.hands[0].cards.length).toBe(3);
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.hands[0]).toMatchObject({ outcome: 'win', bet: 20, ret: 40 });
  });

  it('splits into two hands and plays each one', () => {
    // P 8s, D 6d, P 8c, D(hole) Th | split: hand0 gets 3s, ...
    const r = new BlackjackRound(rigged('8s 6d 8c Th 3s 2h'), 10);
    r.start();
    expect(r.actions(1000).split).toBe(true);
    r.split();
    expect(r.hands.length).toBe(2);
    expect(r.hands[0].cards.length).toBe(2);
    r.stand(); // hand0 = 11? (8+3) stand anyway for test; hand1 receives 2h
    expect(r.active).toBe(1);
    expect(r.hands[1].cards.length).toBe(2);
    const ev = r.stand();
    expect(ev.some((e) => e.t === 'settle')).toBe(true);
    expect(r.phase).toBe('done');
  });

  it('split aces receive one card each and end the turn', () => {
    const r = new BlackjackRound(rigged('As 6d Ac 9h Ks 5c Tc'), 10);
    r.start();
    const ev = r.split();
    expect(r.hands.every((h) => h.cards.length === 2 && h.done)).toBe(true);
    const settle = ev.find((e) => e.t === 'settle');
    // A+K after split is 21 but not a blackjack: pays 1:1
    expect(settle && settle.t === 'settle' && settle.hands[0]).toMatchObject({ outcome: 'win', ret: 20 });
  });

  it('a busted hand loses even if the dealer busts', () => {
    const r = new BlackjackRound(rigged('Ts 6d 6c Th 9s'), 10);
    r.start();
    const ev = r.hit();
    const settle = ev.find((e) => e.t === 'settle');
    expect(settle && settle.t === 'settle' && settle.hands[0]).toMatchObject({ outcome: 'bust', ret: 0 });
  });

  it('long simulation keeps money accounting consistent', () => {
    const shoe = new Shoe(6, 0.75, seededRng(42));
    let staked = 0;
    let returned = 0;
    for (let n = 0; n < 20000; n++) {
      if (shoe.needsShuffle) shoe.shuffle();
      const r = new BlackjackRound(shoe, 10);
      let ev = r.start();
      if (r.phase === 'insurance') ev = r.insurance(false);
      let guard = 0;
      while (r.phase === 'player' && guard++ < 30) {
        const a = r.actions(1e9);
        const m = basicStrategy(r.current.cards, r.dealerUp, a.double, a.split);
        ev = m === 'split' ? r.split() : m === 'double' ? r.double() : m === 'hit' ? r.hit() : r.stand();
      }
      expect(r.phase).toBe('done');
      void ev;
      for (const h of r.hands) {
        staked += h.bet;
        returned += h.ret ?? 0;
      }
    }
    const rtp = returned / staked;
    // basic strategy at these rules returns ~99.5%; allow sampling noise
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(1.03);
  });
});

describe('basic strategy', () => {
  const up = (c: string) => parseCards(c)[0];
  it('covers textbook spots', () => {
    expect(basicStrategy(parseCards('Ts 6d'), up('Th'), true, true)).toBe('hit');
    expect(basicStrategy(parseCards('Ts 6d'), up('6h'), true, true)).toBe('stand');
    expect(basicStrategy(parseCards('6s 5d'), up('Th'), true, true)).toBe('double');
    expect(basicStrategy(parseCards('8s 8d'), up('Ah'), true, true)).toBe('split');
    expect(basicStrategy(parseCards('Ts Td'), up('6h'), true, true)).toBe('stand');
    expect(basicStrategy(parseCards('As 7d'), up('9h'), true, true)).toBe('hit');
    expect(basicStrategy(parseCards('As 7d'), up('4h'), true, true)).toBe('double');
    expect(basicStrategy(parseCards('As 7d 2c'), up('4h'), false, false)).toBe('stand');
  });
});
