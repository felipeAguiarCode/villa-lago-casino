import { describe, expect, it } from 'vitest';
import { parseCards, rankOf, suitOf, type Card } from '../src/core/cards';
import { bestOf, Cat5, eval5 } from '../src/core/eval5';
import { seededRng } from '../src/core/rng';
import type { Action } from '../src/games/abyss/betting';
import { ABYSS } from '../src/games/abyss/config';
import { decide, equity, type DealerView } from '../src/games/abyss/dealerAI';
import { bestHand, bestScore, categoryOf } from '../src/games/abyss/evaluator';
import { priceBase, priceCeiling, skillPrice } from '../src/games/abyss/pricing';
import { AbyssError, AbyssRound, type AbEvent, type Bank } from '../src/games/abyss/round';
import { settle } from '../src/games/abyss/settlement';
import { connected, SKILLS, type SkillId } from '../src/games/abyss/skills';

function bank(balance = 10_000) {
  const b = {
    balance,
    debits: [] as number[],
    credits: [] as number[],
    canAfford: (n: number) => b.balance >= n,
    debit: (n: number) => {
      if (b.balance < n) throw new Error('insufficient');
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

/** Deck order: p0 d0 p1 d1, burn, flop ×3, burn, turn, burn, river. */
function stack(player: string, dealer: string, board: string): Card[] {
  const p = parseCards(player);
  const d = parseCards(dealer);
  const b = parseCards(board);
  const used = new Set([...p, ...d, ...b]);
  const burns = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c));
  return [p[0], d[0], p[1], d[1], burns[0], b[0], b[1], b[2], burns[1], b[3], burns[2], b[4]];
}

/** A dealer that plays a script, then checks or calls. */
const script =
  (...acts: Action[]) =>
  (v: DealerView): Action =>
    acts.shift() ?? (v.toCall > 0 ? { type: 'call' } : { type: 'check' });
const passive = () => script();

function round(o: { b?: Bank; st?: Card[]; dealer?: (v: DealerView) => Action; seed?: number } = {}) {
  return new AbyssRound({ bank: o.b ?? bank(), stack: o.st, dealer: o.dealer ?? passive(), rng: seededRng(o.seed ?? 1), aiRng: seededRng(99), profile: 'balanced' });
}

const AA_vs_KK = stack('As Ad', 'Kc Kd', '2c 7d 9h Js 3s');

describe('Abyss Poker – dealing and budget', () => {
  it('takes the Ante, matches it for the dealer and deals two cards each, alternately', () => {
    const b = bank(5000);
    const r = round({ b, st: AA_vs_KK });
    const ev = r.start(100);
    expect(b.debits).toEqual([100]);
    expect(r.contrib).toEqual({ player: 100, dealer: 100 });
    expect(r.budget).toBe(1000);
    expect(r.matchedPot).toBe(200);
    const deals = ev.filter((e) => e.t === 'deal');
    expect(deals.map((e) => e.who)).toEqual(['player', 'dealer', 'player', 'dealer']);
    for (const e of deals) if (e.who === 'dealer') expect('card' in e).toBe(false);
    expect(r.playerCards).toEqual(parseCards('As Ad'));
    expect(r.dealerCards).toBeNull();
    expect(r.state).toBe('PLAYER_ACTION');
    expect(r.street).toBe('PRE_FLOP');
    expect(r.history.slice(0, 4)).toEqual(['BETTING', 'DEALING', 'PRE_FLOP', 'PLAYER_ACTION']);
  });

  it('limits the budget by the balance and checks the ante', () => {
    const r = round({ b: bank(300) });
    r.start(50);
    expect(r.budget).toBe(300);
    expect(() => round().start(2)).toThrow(/ante/);
    expect(() => round({ b: bank(20) }).start(50)).toThrow(/insufficient/);
  });

  it('deals the board in deck order with burn cards and never repeats a card', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = round({ seed });
      r.start(10);
      while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
      const all = [...r.playerCards, ...r.dealerCards!, ...r.community];
      expect(new Set(all).size).toBe(9);
      expect(r.community.length).toBe(5);
    }
    const r = round({ st: AA_vs_KK });
    r.start(10);
    while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
    expect(r.community).toEqual(parseCards('2c 7d 9h Js 3s'));
  });
});

describe('Abyss Poker – hand evaluation', () => {
  it('uses zero, one or two hole cards', () => {
    expect(bestHand(parseCards('2c 3d Ah Kh Qh Jh Th')).cat).toBe(Cat5.Royal); // board plays
    expect(bestHand(parseCards('Ac 3d Ah Ad 7s 2h 9c')).cat).toBe(Cat5.Trips); // one hole card
    expect(bestHand(parseCards('9h 8h 7h 6h 2c 3d Kc')).cat).toBe(Cat5.High); // 9-8-7-6 + K: no straight
    expect(bestHand(parseCards('9h 5h 8h 7h 6h 2c 3d')).cat).toBe(Cat5.StraightFlush);
  });

  it('the fast scorer matches the casino evaluator for 5–7 cards', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 3000; i++) {
      const deck = Array.from({ length: 52 }, (_, k) => k);
      const n = 5 + (i % 3);
      const h: Card[] = [];
      for (let k = 0; k < n; k++) h.push(deck.splice(rng(deck.length), 1)[0]);
      expect(bestScore(h)).toBe(bestOf(h).score);
    }
  });

  it('breaks ties with kickers and splits real ties', () => {
    const a = bestHand(parseCards('Ac Kd 9h 9s 4c 2d 7h'));
    const b = bestHand(parseCards('Ah Qd 9h 9s 4c 2d 7h'));
    expect(a.score).toBeGreaterThan(b.score);
    expect(bestHand(parseCards('2c 3d Ah Kh Qh Jh Th')).score).toBe(bestHand(parseCards('4c 5d Ah Kh Qh Jh Th')).score);
    expect(eval5(parseCards('Ah Kh Qh Jh Th')).cat).toBe(Cat5.Royal);
  });
});

describe('Abyss Poker – betting', () => {
  it('player acts first pre-flop, the dealer first after the flop', () => {
    const r = round({ st: AA_vs_KK });
    r.start(10);
    r.act({ type: 'check' });
    expect(r.actions.map((a) => a.who)).toEqual(['player', 'dealer', 'dealer']);
    expect(r.street).toBe('FLOP');
    expect(r.state).toBe('PLAYER_ACTION');
  });

  it('opens at the Ante, allows one raise per street, then only call or fold', () => {
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'raise', amount: 60 }) });
    r.start(20);
    expect(r.legal().bet).toEqual({ min: 20, max: 180 });
    expect(() => r.act({ type: 'bet', amount: 10 })).toThrow(AbyssError);
    r.act({ type: 'bet', amount: 20 });
    expect(r.contrib).toEqual({ player: 40, dealer: 80 });
    const L = r.legal();
    expect(L.raise).toBeNull();
    expect(L.call).toBe(40);
    expect(L.fold).toBe(true);
    expect(L.check).toBe(false);
    r.act({ type: 'call' });
    expect(r.street).toBe('FLOP');
    expect(r.contrib).toEqual({ player: 80, dealer: 80 });
  });

  it('never deals a new card while a bet is pending', () => {
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'check' }, { type: 'bet', amount: 30 }) });
    r.start(10);
    r.act({ type: 'check' }); // dealer checks pre-flop, flop dealt, dealer bets
    expect(r.community.length).toBe(3);
    expect(r.toCall).toBe(30);
    r.act({ type: 'call' });
    expect(r.community.length).toBe(4);
  });

  it('Double adds the whole contribution as a bet or a valid raise', () => {
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'check' }, { type: 'bet', amount: 20 }) });
    r.start(20);
    expect(r.legal().double).toBe(20); // opening bet of 20 (contribution 20 → 40)
    r.act({ type: 'check' });
    // flop: dealer bets 20 (20 vs 40): doubling 20 → 40 only calls, so it isn't a valid raise
    expect(r.legal().double).toBeNull();
    // 80 each, dealer bets 20 → 100: doubling 80 → 160 raises by 60 ≥ the minimum
    const r2 = round({ st: AA_vs_KK, dealer: script({ type: 'call' }, { type: 'bet', amount: 20 }) });
    r2.start(20);
    r2.act({ type: 'bet', amount: 60 });
    expect(r2.contrib).toEqual({ player: 80, dealer: 100 });
    expect(r2.legal().double).toBe(80);
    r2.act({ type: 'double' });
    expect(r2.contrib.player).toBe(160);
    expect(r2.actions.filter((a) => a.who === 'player').pop()!.type).toBe('raise');
    const r3 = round({ st: AA_vs_KK });
    r3.start(20);
    r3.act({ type: 'double' });
    expect(r3.contrib).toEqual({ player: 40, dealer: 40 });
  });

  it('All-In commits the whole remaining budget and runs the board out', () => {
    const b = bank(5000);
    const r = round({ b, st: AA_vs_KK });
    r.start(50);
    expect(r.legal().allin).toBe(450);
    const ev = r.act({ type: 'allin' });
    expect(b.debits).toEqual([50, 450]);
    expect(r.history).toContain('ALL_IN_RUNOUT');
    expect(r.state).toBe('ROUND_COMPLETE');
    expect(ev.filter((e) => e.t === 'street').length).toBe(3);
    expect(r.offers().every((o) => o.block === 'state')).toBe(true);
  });

  it('All-In below the minimum is allowed', () => {
    const r = round({ b: bank(60), st: AA_vs_KK });
    r.start(50);
    expect(r.legal().bet).toEqual({ min: 10, max: 10 });
    r.act({ type: 'bet', amount: 10 });
    expect(r.contrib.player).toBe(60);
  });

  it('fold ends the hand at once', () => {
    const b = bank(1000);
    const r = round({ b, st: AA_vs_KK, dealer: script({ type: 'bet', amount: 40 }) });
    r.start(20);
    r.act({ type: 'check' });
    r.act({ type: 'fold' });
    expect(r.settlement!.outcome).toBe('playerFold');
    expect(b.credits).toEqual([]);
    expect(b.balance).toBe(980);
    expect(r.history).not.toContain('SHOWDOWN');
  });
});

describe('Abyss Poker – payouts', () => {
  it('a win pays the matched pot, a dealer fold returns the unmatched bet', () => {
    const b = bank(1000);
    const r = round({ b, st: AA_vs_KK });
    r.start(50);
    r.act({ type: 'bet', amount: 50 }); // dealer calls
    while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
    expect(r.settlement!.outcome).toBe('win');
    expect(r.settlement!.grossPayout).toBe(200);
    expect(b.balance).toBe(1100);
    const b2 = bank(1000);
    const r2 = round({ b: b2, st: AA_vs_KK, dealer: script({ type: 'fold' }) });
    r2.start(50);
    r2.act({ type: 'bet', amount: 80 });
    const s = r2.settlement!;
    expect(s.outcome).toBe('dealerFold');
    expect(s.pot).toBe(100);
    expect(s.refund).toBe(80);
    expect(s.net).toBe(50);
    expect(b2.credits).toEqual([180]);
    expect(b2.balance).toBe(1050);
  });

  it('a tie splits the pot', () => {
    const b = bank(1000);
    const r = round({ b, st: stack('2c 3d', '4c 5d', 'Ah Kh Qh Jh Th') });
    r.start(50);
    while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
    expect(r.settlement!.outcome).toBe('tie');
    expect(b.balance).toBe(1000);
  });

  it('net result: bets 300, skills 70, pot 600 → +230; tie → −70', () => {
    expect(settle({ player: 300, dealer: 300 }, 'win', 70).net).toBe(230);
    const t = settle({ player: 300, dealer: 300 }, 'tie', 70);
    expect(t.grossPayout).toBe(300);
    expect(t.net).toBe(-70);
    expect(settle({ player: 300, dealer: 120 }, 'dealerFold', 0)).toMatchObject({ pot: 240, refund: 180, net: 120 });
  });

  it('settles exactly once', () => {
    const b = bank(1000);
    const r = round({ b, st: AA_vs_KK });
    r.start(10);
    while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
    expect(b.credits.length).toBe(1);
    expect(() => r.act({ type: 'check' })).toThrow(AbyssError);
    expect(() => r.buySkill('sharpEye')).toThrow(AbyssError);
    expect(() => r.start(10)).toThrow(AbyssError);
    expect(b.credits.length).toBe(1);
  });
});

describe('Abyss Poker – skill pricing', () => {
  const cfg = ABYSS;
  it('prices from the matched pot, capped at 5× Ante', () => {
    expect(priceBase(200, 100, cfg)).toBe(200);
    expect(priceBase(900, 100, cfg)).toBe(500);
    expect(skillPrice(1, 200, 100, cfg)).toBe(10);
    expect(skillPrice(4, 200, 100, cfg)).toBe(40);
    expect(skillPrice(4, 5000, 100, cfg)).toBe(100); // Tier IV costs at most one Ante
    expect(skillPrice(2, 5000, 100, cfg)).toBe(50);
    expect(priceCeiling(3, 100, cfg)).toBe(75);
  });

  it('rounds to the chip unit, never above the ceiling and never free', () => {
    expect(skillPrice(1, 10, 5, cfg)).toBe(1); // 0.5 → at least one chip
    expect(skillPrice(1, 30, 5, cfg)).toBe(1); // 1.5 rounds to 2 but the ceiling is 1.25
    expect(skillPrice(3, 70, 30, cfg)).toBe(11); // 10.5 → 11
    expect(skillPrice(4, 1e6, 7, cfg)).toBe(7);
  });

  it('ignores unmatched bets', () => {
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'check' }) });
    r.start(40);
    const before = r.priceOf('revealCard');
    r.act({ type: 'check' }); // flop, dealer checks
    r.act({ type: 'bet', amount: 100 }); // dealer calls by default → street closes; use a pending bet instead
    const r2 = round({ st: AA_vs_KK, dealer: script({ type: 'check' }, { type: 'bet', amount: 200 }) });
    r2.start(40);
    r2.act({ type: 'check' });
    expect(r2.toCall).toBe(200);
    expect(r2.matchedPot).toBe(80);
    expect(r2.priceOf('revealCard')).toBe(skillPrice(4, 80, 40, cfg));
    expect(before).toBe(16);
  });
});

describe('Abyss Poker – buying skills', () => {
  it('charges once, reduces the budget and blocks a second purchase', () => {
    const b = bank(1000);
    const r = round({ b, st: AA_vs_KK });
    r.start(100);
    const price = r.priceOf('sharpEye');
    r.buySkill('sharpEye');
    expect(b.debits).toEqual([100, price]);
    expect(r.skillCosts).toBe(price);
    expect(r.playerLimit).toBe(1000 - price);
    expect(r.playerRemaining).toBe(900 - price);
    expect(r.state).toBe('PLAYER_ACTION');
    expect(() => r.buySkill('sharpEye')).toThrow(/used/);
    expect(() => r.buySkill('suitReader')).toThrow(/used/); // one per street
    expect(b.debits.length).toBe(2);
    r.act({ type: 'check' }); // next street
    expect(r.skillBlock('suitReader')).toBe('');
    expect(r.skillBlock('sharpEye')).toBe('used'); // once per hand
  });

  it('refuses a purchase the wallet or the budget cannot cover, without charging', () => {
    const tight = bank(100);
    const r = round({ b: tight, st: AA_vs_KK });
    r.start(100); // budget 100, nothing left to bet
    expect(r.skillBlock('sharpEye')).not.toBe('');
    expect(() => r.buySkill('sharpEye')).toThrow(AbyssError);
    expect(tight.debits).toEqual([100]);
    const broke: Bank & { debits: number[] } = { ...bank(1000), canAfford: () => false } as never;
    const b = bank(1000);
    const r2 = new AbyssRound({ bank: b, stack: AA_vs_KK, dealer: passive(), profile: 'balanced' });
    r2.start(100);
    b.canAfford = () => false;
    expect(r2.skillBlock('sharpEye')).toBe('funds');
    void broke;
  });

  it('keeps enough to call the dealer and a unit to bet', () => {
    const b = bank(5000);
    const r = round({ b, st: AA_vs_KK, dealer: script({ type: 'check' }, { type: 'bet', amount: 890 }) });
    r.start(100);
    r.act({ type: 'check' }); // flop: dealer bets 890 → 990 of 1000
    expect(r.toCall).toBe(890);
    expect(r.playerRemaining).toBe(900);
    // any purchase over 10 chips would make the call impossible
    const offers = r.offers();
    for (const o of offers) if (o.price > 10) expect(o.block === 'call' || o.block === 'budget' || o.block === 'street' || o.block === 'useless').toBe(true);
  });

  it('tells the truth about the dealer cards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const ids: SkillId[] = ['sharpEye', 'suitReader', 'highCardReader', 'connectionReader', 'handReader', 'revealCard'];
      const id = ids[seed % ids.length];
      const r = round({ seed });
      r.start(20);
      if (id === 'handReader') r.act({ type: 'check' });
      const ev = r.buySkill(id);
      const info = (ev.find((e) => e.t === 'skill') as Extract<AbEvent, { t: 'skill' }>).info!;
      const boardNow = [...r.community];
      while (r.state !== 'ROUND_COMPLETE') r.act({ type: 'check' });
      const [a, c] = r.dealerCards!;
      switch (info.id) {
        case 'sharpEye':
          expect(info.pair).toBe(rankOf(a) === rankOf(c));
          break;
        case 'suitReader':
          expect(info.suited).toBe(suitOf(a) === suitOf(c));
          break;
        case 'highCardReader':
          expect(info.high).toBe(rankOf(a) >= 11 || rankOf(c) >= 11);
          break;
        case 'connectionReader':
          expect(info.connected).toBe(connected(a, c));
          break;
        case 'handReader':
          expect(info.category).toBe(categoryOf([a, c, ...boardNow]));
          break;
        case 'revealCard':
          expect(r.dealerCards![info.index]).toBe(info.card);
          break;
      }
    }
    expect(connected(parseCards('Ah')[0], parseCards('2c')[0])).toBe(true);
    expect(connected(parseCards('Ah')[0], parseCards('Kc')[0])).toBe(true);
    expect(connected(parseCards('Ah')[0], parseCards('3c')[0])).toBe(false);
  });

  it('Peek shows the real next card, after the burn', () => {
    for (const steps of [0, 1, 2]) {
      const r = round({ st: AA_vs_KK });
      r.start(10);
      for (let i = 0; i < steps; i++) r.act({ type: 'check' });
      const ev = r.buySkill('peek');
      const info = (ev.find((e) => e.t === 'skill') as Extract<AbEvent, { t: 'skill' }>).info!;
      r.act({ type: 'check' });
      expect(info).toMatchObject({ id: 'peek', card: r.community[[0, 3, 4][steps]] });
    }
    const r = round({ st: AA_vs_KK });
    r.start(10);
    for (let i = 0; i < 3; i++) r.act({ type: 'check' });
    expect(r.street).toBe('RIVER');
    expect(r.skillBlock('peek')).toBe('street');
  });

  it('refuses skills whose effect can no longer apply', () => {
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'check' }, { type: 'bet', amount: 20 }) });
    r.start(20);
    expect(r.skillBlock('handReader')).toBe('street'); // only after the flop
    expect(r.skillBlock('blockBet')).toBe(''); // the dealer still acts pre-flop
    r.act({ type: 'check' }); // flop: the dealer already bet
    expect(r.skillBlock('blockBet')).toBe('useless');
    expect(r.skillBlock('lockRaise')).toBe('useless'); // facing a bet the dealer can't raise again
    expect(() => r.buySkill('blockBet')).toThrow(AbyssError);
  });

  it('control skills bind the dealer for the street, then expire', () => {
    // Make 'Em Chase: the dealer wanted to fold and must call
    const r = round({ st: AA_vs_KK, dealer: script({ type: 'fold' }) });
    r.start(20);
    r.buySkill('makeEmChase');
    expect(r.active).toEqual(['makeEmChase']);
    const ev = r.act({ type: 'bet', amount: 40 });
    expect(r.actions.find((a) => a.who === 'dealer')!.type).toBe('call');
    expect(ev.some((e) => e.t === 'expire')).toBe(true);
    expect(r.active).toEqual([]);
    // Lock Raise: a raise becomes a call
    const r2 = round({ st: AA_vs_KK, dealer: script({ type: 'raise', amount: 60 }) });
    r2.start(20);
    r2.buySkill('lockRaise');
    r2.act({ type: 'bet', amount: 20 });
    expect(r2.actions.find((a) => a.who === 'dealer')!.type).toBe('call');
    // Block Bet: the dealer may not open
    const r3 = round({ st: AA_vs_KK, dealer: script({ type: 'bet', amount: 20 }) });
    r3.start(20);
    r3.buySkill('blockBet');
    r3.act({ type: 'check' });
    expect(r3.actions.find((a) => a.who === 'dealer')!.type).toBe('check');
  });

  it('Pressure adds 20 points to the fold chance, and never guarantees it', () => {
    const view = (foldBoost: number): DealerView => ({
      hole: parseCards('7c 2d'),
      community: parseCards('Ah Kd 9s'),
      street: 'FLOP',
      toCall: 40,
      matchedPot: 80,
      totalPot: 120,
      ante: 40,
      legal: { check: false, bet: null, call: 40, raise: null, double: null, fold: true, allin: null },
      limits: { noRaise: false, noBet: false, noFold: false, foldBoost },
      history: [],
      profile: 'balanced',
    });
    const folds = (boost: number) => {
      const rng = seededRng(11);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (decide(view(boost), rng, 0.3).type === 'fold') n++;
      return n / 4000;
    };
    const base = folds(0);
    const pushed = folds(0.2);
    expect(pushed - base).toBeGreaterThan(0.17);
    expect(pushed - base).toBeLessThan(0.23);
    expect(pushed).toBeLessThan(1);
  });

  it('keeps skill money out of the pot: no refund after a fold', () => {
    const b = bank(1000);
    const r = round({ b, st: AA_vs_KK, dealer: script({ type: 'bet', amount: 50 }) });
    r.start(50);
    const price = r.priceOf('sharpEye');
    r.buySkill('sharpEye');
    expect(r.matchedPot).toBe(100);
    r.act({ type: 'check' });
    r.act({ type: 'fold' });
    expect(r.settlement!.net).toBe(-50 - price);
    expect(b.balance).toBe(1000 - 50 - price);
  });

  it('every skill has a tier, a category, streets and a rate in the config', () => {
    expect(SKILLS.length).toBe(11);
    for (const s of SKILLS) {
      expect(ABYSS.tierRates[s.tier]).toBeGreaterThan(0);
      expect(s.streets.length).toBeGreaterThan(0);
    }
  });
});

describe('Abyss Poker – dealer fair play', () => {
  it('the dealer only sees its own cards and public information', () => {
    const seen: DealerView[] = [];
    for (let seed = 1; seed <= 15; seed++) {
      const r = new AbyssRound({ bank: bank(), rng: seededRng(seed), aiRng: seededRng(seed + 50), dealer: (v) => (seen.push(v), v.toCall > 0 ? { type: 'call' } : { type: 'check' }) });
      r.start(10);
      while (r.state !== 'ROUND_COMPLETE') r.act(r.legal().bet && seed % 2 ? { type: 'bet', amount: 10 } : r.legal().check ? { type: 'check' } : { type: 'call' });
      for (const v of seen.splice(0)) {
        for (const c of r.playerCards) expect([...v.hole, ...v.community]).not.toContain(c);
        expect(Object.keys(v).sort()).toEqual(['ante', 'community', 'history', 'hole', 'legal', 'limits', 'matchedPot', 'profile', 'street', 'toCall', 'totalPot']);
      }
    }
  });

  it('equity knows strong from weak', () => {
    const rng = seededRng(3);
    expect(equity(parseCards('As Ah'), [], rng, 1500)).toBeGreaterThan(0.8);
    expect(equity(parseCards('7c 2d'), [], rng, 1500)).toBeLessThan(0.4);
    // knowledge narrows the range: against a known pair of kings, aces are ~80%
    const known = equity(parseCards('As Ah'), [], rng, 1500, { oppCards: parseCards('Kc Kd') });
    expect(known).toBeGreaterThan(0.75);
  });
});
