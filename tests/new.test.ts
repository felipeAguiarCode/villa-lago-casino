import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { Cat4, eval4, best4 } from '../src/core/eval4';
import { eval3 } from '../src/core/eval3';
import { seededRng } from '../src/core/rng';
import { settleTcp } from '../src/games/threecard/rules';
import { playMultiple, settleFcp } from '../src/games/fourcard/rules';
import { dealerQualifies as h3Qual, pairOrSuited, raiseFirst, raiseSecond, settleH3, straightOrUp } from '../src/games/holdem3/rules';
import { dealerReplace, rusAdvice, settleRus } from '../src/games/russian/rules';
import { ddEval, finalUnits, firstDrawAdvice, secondDrawAdvice, settleDD } from '../src/games/doubledraw/rules';
import { Duel } from '../src/games/trump21/rules';

const C = (s: string) => parseCards(s);
const deal = (rng: (n: number) => number, n: number, extra: number[] = []) => {
  const deck = [...Array.from({ length: 52 }, (_, i) => i), ...extra];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { hand: deck.slice(deck.length - n), rest: deck.slice(0, deck.length - n) };
};

describe('Three Card Poker Lucky 6', () => {
  it('pays the best five of six cards, even after a fold', () => {
    const r = settleTcp(C('7s 7d 2c'), C('7h 7c 9d'), { ante: 10, pairPlus: 0, lucky6: 5 }, false);
    expect(r.lucky6Mult).toBe(100);
    expect(r.ret.lucky6).toBe(505);
    const f = settleTcp(C('2s 5s 9s'), C('Js Qd 3s'), { ante: 0, pairPlus: 0, lucky6: 5 }, false);
    expect(f.ret.lucky6).toBe(80);
    const n = settleTcp(C('2s 5d 9s'), C('Jc Qd 3s'), { ante: 0, pairPlus: 0, lucky6: 5 }, false);
    expect(n.ret.lucky6).toBe(0);
  });
});

describe('Four Card Poker', () => {
  it('ranks four-card hands', () => {
    expect(eval4(C('9s 9d 9c 9h')).cat).toBe(Cat4.Quads);
    expect(eval4(C('5h 6h 7h 8h')).cat).toBe(Cat4.StraightFlush);
    expect(eval4(C('Ah 2d 3c 4s')).cat).toBe(Cat4.Straight);
    expect(eval4(C('9s 9d 9c 2h')).score).toBeGreaterThan(eval4(C('2h 7h 9h Kh')).score);
    expect(best4(C('As Ad Kc 7h 2s')).cat).toBe(Cat4.Pair);
  });
  it('counts all 270,725 four-card hands exactly', () => {
    const counts = new Array(8).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) counts[eval4([a, b, c, d]).cat]++;
    expect(counts[Cat4.Quads]).toBe(13);
    expect(counts[Cat4.StraightFlush]).toBe(44);
    expect(counts[Cat4.Trips]).toBe(2496);
    expect(counts[Cat4.Flush]).toBe(2816);
    expect(counts[Cat4.Straight]).toBe(2772);
    expect(counts[Cat4.TwoPair]).toBe(2808);
    expect(counts[Cat4.Pair]).toBe(82368);
  });
  it('player wins ties; ante bonus and Aces Up', () => {
    const r = settleFcp(C('9s 9d 9c 4h 2s'), C('Ks Qd 7c 5h 3d 2c'), { ante: 10, acesUp: 5 }, 30);
    expect(r.win).toBe(true);
    expect(r.ret).toEqual({ ante: 40, play: 60, acesUp: 50 });
    const tie = settleFcp(C('Ks Kd 7c 4h 2s'), C('Kh Kc 7d 4s 3d 2c'), { ante: 10, acesUp: 0 }, 10);
    expect(tie.win).toBe(true);
  });
  it('simple strategy keeps the ante house edge small', () => {
    const rng = seededRng(4);
    let net = 0;
    const N = 80000;
    for (let n = 0; n < N; n++) {
      const { hand } = deal(rng, 11);
      const p = hand.slice(0, 5);
      const d = hand.slice(5);
      const m = playMultiple(p);
      const r = settleFcp(p, d, { ante: 1, acesUp: 0 }, m);
      net += r.ret.ante + r.ret.play - 1 - m;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.06);
  });
});

describe("3 Card Hold'em", () => {
  it('dealer qualifies with a pair of 4s', () => {
    expect(h3Qual(eval3(C('4s 4d 2c')))).toBe(true);
    expect(h3Qual(eval3(C('3s 3d Ac')))).toBe(false);
  });
  it('settles ante and raises', () => {
    const r = settleH3(C('9s 9d'), C('3c 2h'), C('9c Kd 6s'), { ante: 10, pairSuited: 0, straightUp: 0 }, 20, false);
    expect(r.qualifies).toBe(false);
    expect(r.ret).toMatchObject({ ante: 10, raise: 40 });
    const q = settleH3(C('As Ad'), C('5c 5h'), C('Ac 2d 7s'), { ante: 10, pairSuited: 0, straightUp: 0 }, 10, false);
    expect(q.ret).toMatchObject({ ante: 20, raise: 20 });
  });
  it('side bets', () => {
    expect(pairOrSuited(C('As Ks'))).toBe(30);
    expect(pairOrSuited(C('Qs Qd'))).toBe(4);
    expect(pairOrSuited(C('2s 9s'))).toBe(1);
    expect(straightOrUp(C('Ah Kh Qh 4c 4d'))).toBe(100);
    expect(straightOrUp(C('5h 6h 7h 4c 9d'))).toBe(10);
    expect(straightOrUp(C('5h 6d 7c 2c 9d'))).toBe(1);
  });
  it('strategy edge is close to the published ~3%', () => {
    const rng = seededRng(8);
    let net = 0;
    const N = 80000;
    for (let n = 0; n < N; n++) {
      const { hand } = deal(rng, 7);
      const pocket = hand.slice(0, 2);
      const dealer = hand.slice(2, 4);
      const board = hand.slice(4);
      let raise = 0;
      let folded = false;
      if (raiseFirst(pocket, board[0])) {
        raise = 1;
        if (raiseSecond(pocket, board.slice(0, 2))) raise = 2;
      } else folded = true;
      const r = settleH3(pocket, dealer, board, { ante: 1, pairSuited: 0, straightUp: 0 }, raise, folded);
      net += r.ret.ante + r.ret.raise - 1 - raise;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.07);
  });
});

describe('Russian Poker', () => {
  it('pays like Caribbean when the dealer qualifies; buying keeps the ante unpaid', () => {
    const r = settleRus(C('9s 9d 9c 4h 2s'), C('As Kd 7c 5h 3s'), 10, true, false);
    expect(r.ret).toEqual({ ante: 20, call: 80 });
    const b = settleRus(C('9s 9d 9c 4h 2s Kc'), C('As Kd 7c 5h 3s'), 10, true, true);
    expect(b.ret).toEqual({ ante: 10, call: 80 });
    const nq = settleRus(C('2s 5d 9c Th Js'), C('Qs Jd 7c 5h 3s'), 10, true, false);
    expect(nq.ret).toEqual({ ante: 20, call: 20 });
  });
  it('dealer replaces his highest card when the player buys a game', () => {
    const queue = C('2c');
    const out = dealerReplace(C('Qs Jd 7c 5h 3s'), () => queue.shift()!);
    expect(out).toEqual(C('2c Jd 7c 5h 3s'));
  });
  it('advice', () => {
    expect(rusAdvice(C('9s 9d 4c 7h 2s'), C('Kc')[0]).move).toBe('call');
    expect(rusAdvice(C('2s 7s 9s Js 4d'), C('Kc')[0])).toEqual({ move: 'swap', swap: [4] });
    expect(rusAdvice(C('2s 7d 9c Js 4d'), C('Kc')[0]).move).toBe('fold');
  });
});

describe('Double Draw Poker', () => {
  it('evaluates jokers', () => {
    expect(ddEval([...C('As Ad Ac Ah'), 52]).key).toBe('fiveAces');
    expect(ddEval([...C('Ks Qs Js Ts'), 52]).key).toBe('wildRoyal');
    expect(ddEval(C('As Ks Qs Js Ts')).key).toBe('naturalRoyal');
    expect(ddEval([...C('5h 6h 7h 9h'), 52]).key).toBe('straightFlush');
    expect(ddEval([...C('2h 9d 5c Ks'), 52]).key).toBe('none');
    expect(ddEval([...C('Kh Kd 5c 9s'), 52]).key).toBe('none'); // KK + an ace kicker
    expect(ddEval([...C('Kh Kd 5c 5s'), 52]).key).toBe('twoPair');
    expect(ddEval([...C('Kh Kd Kc 9s'), 52]).key).toBe('trips');
    expect(ddEval([...C('Ah Ad Kc 9s'), 52]).key).toBe('trips');
    expect(ddEval([...C('2h 3d 4c 6s'), 52]).key).toBe('straight');
    expect(ddEval([...C('2h 3h 9h'), 52, 53]).key).toBe('flush');
  });
  it('pays all wagers 1:1 on two pair or better plus the bonus table', () => {
    const r = settleDD(C('9s 9d 9c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(r.ret).toEqual({ ante: 20, bonus: 20, draw1: 20, draw2: 20 });
    const tp = settleDD(C('9s 9d 4c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(tp.ret.bonus).toBe(10);
    const l = settleDD(C('9s 9d 5c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(l.ret).toEqual({ ante: 0, bonus: 0, draw1: 0, draw2: 0 });
    expect(finalUnits(C('9s 9d 5c 4h 2s'))).toBe(-4);
  });
  it('advice', () => {
    expect(firstDrawAdvice(C('9s 9d 5c 4h 2s')).hold.sort()).toEqual([0, 1]);
    expect(firstDrawAdvice(C('2s 7d 9c Jh 4d')).cont).toBe(false);
    const hand = C('9s 9d 4c 4h 2s');
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !hand.includes(c));
    const a = secondDrawAdvice(hand, [...rest, 52, 53]);
    expect(a.cont).toBe(true);
    expect(a.discard).toBe(4);
  });
  it('a full round with the hints returns a sane amount', () => {
    const rng = seededRng(2);
    let net = 0;
    const N = 3000;
    for (let n = 0; n < N; n++) {
      const { hand, rest } = deal(rng, 5, [52, 53]);
      let cards = hand.slice();
      const f = firstDrawAdvice(cards);
      if (!f.cont) {
        net -= 2;
        continue;
      }
      let k = 0;
      cards = cards.map((c, i) => (f.hold.includes(i) ? c : rest[k++]));
      const unseen = rest.slice(k);
      const s = secondDrawAdvice(cards, unseen);
      if (!s.cont) {
        net -= 3;
        continue;
      }
      if (s.discard !== null) cards[s.discard] = unseen[0];
      net += finalUnits(cards);
    }
    const perHand = net / N;
    expect(perHand).toBeGreaterThan(-2.5);
    expect(perHand).toBeLessThan(0.5);
  });
});

describe('Trump 21', () => {
  it('deals an 11-card deck and finds the closest to the target', () => {
    const d = new Duel(seededRng(1));
    d.start();
    expect(d.player.length).toBe(2);
    expect(d.dealer.length).toBe(2);
    expect(d.deck.length).toBe(7);
    expect(new Set([...d.player, ...d.dealer, ...d.deck]).size).toBe(11);
    d.player = [10, 11];
    d.dealer = [9, 8];
    expect(d.outcome()).toBe(1);
    d.player = [10, 11, 5];
    expect(d.outcome()).toBe(-1);
    d.dealer = [9, 8, 7, 2];
    expect(d.outcome()).toBe(1); // both bust on 26: ties go to the player
  });
  it('trumps change the rules', () => {
    const d = new Duel(seededRng(3));
    d.start();
    d.trumps.player = ['line24', 'recall', 'burn', 'precision', 'guard'];
    d.useTrump('player', 'line24');
    expect(d.target).toBe(24);
    const before = d.player.length;
    d.useTrump('player', 'precision');
    expect(d.player.length).toBe(before + 1);
    d.useTrump('player', 'recall');
    expect(d.player.length).toBe(before);
    const dl = d.dealer.length;
    d.useTrump('player', 'burn');
    expect(d.dealer.length).toBe(dl - 1);
    d.useTrump('player', 'guard');
    expect(d.guard).toBe(true);
    d.player = [10, 11, 5];
    d.dealer = [9, 3];
    expect(d.outcome()).toBe(-1);
    expect(d.payout(20)).toBe(10);
  });
  it('is balanced: following the hint without trumps loses a little (0% to -15%)', () => {
    let ev = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      let g = 0;
      while (!d.over && g++ < 40) {
        if (d.advice() === 'hit') d.hit('player');
        else d.stand('player');
        if (!d.over) d.dealerTurn();
      }
      ev += d.outcome();
    }
    expect(ev / N).toBeLessThan(0);
    expect(ev / N).toBeGreaterThan(-0.15);
  });
  it('dealer AI always finishes the round', () => {
    for (let s = 0; s < 300; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      let guard = 0;
      while (!d.over && guard++ < 40) {
        if (d.advice() === 'hit') d.hit('player');
        else d.stand('player');
        if (!d.over) d.dealerTurn();
      }
      expect(d.over || d.deck.length === 0).toBe(true);
    }
  });
});

import { ATTACK_TRUMPS, BONUS_ON_HIT, BULLSEYE_EXTRA, DEALER_TRUMPS, dealWeight, isTargetTrump, lineValue, MAX_TRUMPS, TRUMPS, type DuelEvent, type TrumpId } from '../src/games/trump21/rules';

describe('Trump 21 — trump variations', () => {
  const fresh = (seed: number, trumps: TrumpId[]) => {
    const d = new Duel(seededRng(seed));
    d.start();
    d.trumps.player = trumps.slice();
    d.trumps.dealer = [];
    return d;
  };
  it('has 49 trumps with unique ids', () => {
    expect(TRUMPS.length).toBe(49);
    expect(new Set(TRUMPS.map((t) => t.id)).size).toBe(49);
  });
  it('draw control: feather, calls, twin, redraw', () => {
    const d = fresh(5, ['feather', 'twin', 'redraw']);
    const low = Math.min(...d.deck);
    d.useTrump('player', 'feather');
    expect(d.player[d.player.length - 1]).toBe(low);
    const n = d.player.length;
    d.useTrump('player', 'twin');
    expect(d.player.length).toBe(n + 2);
    const last = d.player[d.player.length - 1];
    d.useTrump('player', 'redraw');
    expect(d.player.length).toBe(n + 2);
    expect(d.player[d.player.length - 1]).not.toBe(last);
    expect(d.deck).toContain(last);
    const c = fresh(6, ['call2', 'call4', 'call6']);
    for (const id of ['call2', 'call4', 'call6'] as const) {
      const v = Number(id.slice(4));
      if (c.deck.includes(v)) {
        c.useTrump('player', id);
        expect(c.player).toContain(v);
      } else expect(c.canUse('player', id)).toBe(false);
    }
  });
  it('information: foresight shows the top card, reshuffle hides it again', () => {
    const d = fresh(7, ['foresight', 'reshuffle']);
    const ev = d.useTrump('player', 'foresight');
    expect(ev.some((e) => e.t === 'foresee' && e.value === d.deck[0])).toBe(true);
    expect(d.nextCard).toBe(d.deck[0]);
    const p = d.total('player');
    expect(d.advice()).toBe(p + d.deck[0] <= d.target ? 'hit' : 'stand');
    d.useTrump('player', 'reshuffle');
    expect(d.nextCard).toBe(null);
  });
  it('targets: line 27 and reset 21', () => {
    const d = fresh(8, ['line27', 'reset21']);
    d.useTrump('player', 'line27');
    expect(d.target).toBe(27);
    d.useTrump('player', 'reset21');
    expect(d.target).toBe(21);
  });
  it('attacks: force, freeze, shatter, pickpocket, blindfold', () => {
    const d = fresh(9, ['force', 'freeze', 'shatter', 'pickpocket', 'blindfold']);
    d.trumps.dealer = ['line17', 'burn', 'precision'];
    const dn = d.dealer.length;
    d.useTrump('player', 'force');
    expect(d.dealer.length).toBe(dn + 1);
    d.useTrump('player', 'freeze');
    const ev = d.dealerTurn();
    expect(ev.some((e) => e.t === 'stand' && e.side === 'dealer')).toBe(true);
    expect(d.dealer.length).toBe(dn + 1);
    d.useTrump('player', 'shatter');
    expect(d.trumps.dealer.length).toBe(2);
    d.useTrump('player', 'pickpocket');
    expect(d.trumps.dealer.length).toBe(1);
    expect(d.trumps.player.length).toBe(2); // blindfold + the stolen trump
    d.useTrump('player', 'blindfold');
    d.trumps.dealer = ['recall'];
    d.dealer.push(11, 11);
    d.dealerTurn();
    expect(d.trumps.dealer).toEqual(['recall']); // blindfolded: can't play it
  });
  it('stakes: fortress refunds a loss, bounty pays 2:1', () => {
    const d = fresh(10, ['fortress', 'bounty']);
    d.useTrump('player', 'fortress');
    d.player = [10, 11, 5];
    d.dealer = [9, 8];
    expect(d.payout(20)).toBe(20);
    d.useTrump('player', 'bounty');
    d.player = [10, 11];
    expect(d.payout(20)).toBe(60);
  });
  it('a frozen player can only stand', () => {
    const d = fresh(11, []);
    d.frozen.player = true;
    const n = d.player.length;
    d.hit('player');
    expect(d.player.length).toBe(n);
    expect(d.frozen.player).toBe(false);
  });
  it('rare trumps are dealt less often than common ones', () => {
    const counts: Record<string, number> = {};
    for (let s = 0; s < 3000; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      for (const id of d.trumps.player) counts[id] = (counts[id] ?? 0) + 1;
    }
    expect((counts.call5 ?? 0)).toBeGreaterThan((counts.bounty ?? 0) * 2.5);
  });
});

describe('Trump 21 — bonus trumps and the newer trumps', () => {
  /** A duel set to an exact spot: the deck holds every card not in a hand; the dealer always plays his trump. */
  const spot = (player: number[], dealer: number[], trumps: { player?: TrumpId[]; dealer?: TrumpId[] } = {}, seed = 1) => {
    const d = new Duel(seededRng(seed));
    d.start();
    d.player = player.slice();
    d.dealer = dealer.slice();
    d.deck = Array.from({ length: 11 }, (_, i) => i + 1).filter((v) => !player.includes(v) && !dealer.includes(v));
    d.trumps = { player: (trumps.player ?? []).slice(), dealer: (trumps.dealer ?? []).slice() };
    d.aggression = 1;
    return d;
  };
  const dealerPlays = (d: Duel) => d.dealerTurn().find((e): e is Extract<DuelEvent, { t: 'trump' }> => e.t === 'trump')?.id ?? null;

  it('about a fifth of the hits that can bring one turn up a bonus trump instead of the card', () => {
    expect(BONUS_ON_HIT).toBe(0.2);
    let hits = 0;
    let bonus = 0;
    for (let s = 0; s < 3000; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      d.trumps.player = [];
      for (let k = 0; k < 3 && d.deck.length; k++) {
        const sure = d.sureCard;
        const n = d.player.length;
        const ev = d.hit('player');
        if (d.lastHitBonus) {
          // the trump instead of the card: no card, still the player's turn, the next hit is sure
          expect(d.player.length).toBe(n);
          expect(ev[0]).toMatchObject({ t: 'gain', side: 'player', bonus: true });
          expect(d.sureCard).toBe(true);
          expect(d.stood.player).toBe(false);
        } else expect(d.player.length).toBe(n + 1);
        if (sure) {
          expect(d.lastHitBonus).toBe(false);
          continue;
        }
        hits++;
        if (d.lastHitBonus) bonus++;
      }
    }
    expect(bonus / hits).toBeGreaterThan(0.17);
    expect(bonus / hits).toBeLessThan(0.23);
  });

  it('no bonus with a full trump hand', () => {
    for (let s = 0; s < 200; s++) {
      const d = spot([3, 9], [5, 8], { player: Array(MAX_TRUMPS).fill('call2') }, s);
      expect(d.hit('player').some((e) => e.t === 'draw')).toBe(true);
    }
  });

  it('Call 1 / Call 8, Lighten, Heist, Gift, Overload and Rewind', () => {
    const d = spot([3, 9], [5, 2], { player: ['call1', 'call8'] });
    d.useTrump('player', 'call1');
    d.useTrump('player', 'call8');
    expect(d.player).toEqual([3, 9, 1, 8]);
    const e = spot([11, 4, 9], [5, 8], { player: ['lighten'] });
    e.useTrump('player', 'lighten');
    expect(e.player).toEqual([4, 9]);
    const f = spot([3, 9], [5, 8, 2], { player: ['heist', 'gift', 'overload', 'rewind'] });
    expect(f.useTrump('player', 'heist')).toContainEqual({ t: 'move', from: 'dealer', to: 'player', value: 2 });
    expect(f.player).toEqual([3, 9, 2]);
    expect(f.useTrump('player', 'gift')).toContainEqual({ t: 'move', from: 'player', to: 'dealer', value: 2 });
    expect(f.dealer).toEqual([5, 8, 2]);
    const top = f.deck.slice(0, 2);
    f.useTrump('player', 'overload');
    expect(f.dealer).toEqual([5, 8, 2, ...top]);
    f.useTrump('player', 'rewind');
    expect(f.player).toEqual([3]);
    expect(f.dealer).toEqual([5, 8, 2, top[0]]);
  });

  it("a Barrier blocks the opponent's next attack only", () => {
    const d = spot([3, 9, 7], [5, 8], { player: ['barrier'], dealer: ['burn', 'burn'] });
    d.useTrump('player', 'barrier');
    expect(d.useTrump('dealer', 'burn')).toContainEqual({ t: 'blocked', side: 'player', id: 'burn' });
    expect(d.player).toEqual([3, 9, 7]);
    d.useTrump('dealer', 'burn');
    expect(d.player).toEqual([3, 9]);
  });

  it('Bullseye pays 3 to 1 right on the target; Reinforce brings two trumps', () => {
    const d = spot([10, 11], [9, 8], { player: ['bullseye', 'reinforce'] });
    d.useTrump('player', 'bullseye');
    expect(d.payout(10)).toBe(10 * (2 + BULLSEYE_EXTRA));
    d.useTrump('player', 'reinforce');
    expect(d.trumps.player.length).toBe(2);
    const e = spot([10, 9], [7, 8], { player: ['bullseye'] });
    e.useTrump('player', 'bullseye');
    expect(e.payout(10)).toBe(20);
  });

  it('the dealer lightens a bust and heists a card that fits him', () => {
    expect(dealerPlays(spot([2, 7], [6, 11, 5, 3, 1], { dealer: ['recall', 'lighten'] }))).toBe('lighten');
    expect(dealerPlays(spot([2, 7], [11, 3, 9], { dealer: ['recall', 'lighten'] }))).toBe('recall');
    expect(dealerPlays(spot([2, 4], [9, 6], { dealer: ['heist'] }))).toBe('heist');
  });
});

describe('Trump 21 — the swaps, Redeal, the new lines and the seven-trump hand', () => {
  /** A duel set to an exact spot: the deck holds every card not in a hand; the dealer always plays his trump. */
  const spot = (player: number[], dealer: number[], trumps: { player?: TrumpId[]; dealer?: TrumpId[] } = {}, seed = 1) => {
    const d = new Duel(seededRng(seed));
    d.start();
    d.player = player.slice();
    d.dealer = dealer.slice();
    d.deck = Array.from({ length: 11 }, (_, i) => i + 1).filter((v) => !player.includes(v) && !dealer.includes(v));
    d.trumps = { player: (trumps.player ?? []).slice(), dealer: (trumps.dealer ?? []).slice() };
    d.aggression = 1;
    return d;
  };
  const dealerPlays = (d: Duel) => d.dealerTurn().find((e): e is Extract<DuelEvent, { t: 'trump' }> => e.t === 'trump')?.id ?? null;

  it('target cards for 17, 18, 19, 20, 21, 22, 23, 24, 27 and 29', () => {
    const lines = TRUMPS.map((t) => t.id).filter(isTargetTrump);
    expect(lines.map((id) => lineValue(id)).sort((a, b) => a! - b!)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 27, 29]);
    for (const id of lines) {
      const d = spot([3, 9], [5, 8], { player: [id] });
      d.useTrump('player', id);
      expect(d.target).toBe(lineValue(id));
    }
  });

  it('the target family keeps about its old share of the deal', () => {
    const share = (dealer: boolean) => {
      const pool = TRUMPS.filter((t) => !dealer || t.dealer).map((t) => t.id);
      const all = pool.reduce((a, id) => a + dealWeight(id), 0);
      return pool.filter(isTargetTrump).reduce((a, id) => a + dealWeight(id), 0) / all;
    };
    expect(share(false)).toBeGreaterThan(0.07);
    expect(share(false)).toBeLessThan(0.11);
    expect(share(true)).toBeLessThan(0.3);
  });

  it('the new trumps are the player\'s; the swaps and Redeal are attacks', () => {
    for (const id of ['swapLow', 'swapHigh', 'swapHands', 'redeal', 'line29'] as TrumpId[]) expect(DEALER_TRUMPS).not.toContain(id);
    for (const id of ['swapLow', 'swapHigh', 'swapHands', 'redeal'] as TrumpId[]) expect(ATTACK_TRUMPS).toContain(id);
  });

  it('Low Swap and High Swap trade the lowest / highest card of each hand, each to the other\'s place', () => {
    const d = spot([3, 9, 6], [10, 5, 2], { player: ['swapLow', 'swapHigh'] });
    expect(d.useTrump('player', 'swapLow')).toContainEqual({ t: 'swap', side: 'player', kind: 'low', a: 3, b: 2 });
    expect(d.player).toEqual([2, 9, 6]);
    expect(d.dealer).toEqual([10, 5, 3]);
    expect(d.glimpsed).toBe(false);
    d.useTrump('player', 'swapHigh');
    expect(d.player).toEqual([2, 10, 6]);
    expect(d.dealer).toEqual([9, 5, 3]);
    expect(d.glimpsed).toBe(true); // the face-down card came over
  });

  it('Hand Swap trades the hands; Redeal deals as many cards again, one each in turn', () => {
    const d = spot([3, 9, 6], [10, 5], { player: ['swapHands', 'redeal'] });
    d.useTrump('player', 'swapHands');
    expect(d.player).toEqual([10, 5]);
    expect(d.dealer).toEqual([3, 9, 6]);
    const ev = d.useTrump('player', 'redeal');
    expect(ev).toContainEqual({ t: 'redeal', side: 'player' });
    expect(ev.filter((e): e is Extract<DuelEvent, { t: 'draw' }> => e.t === 'draw').map((e) => e.side)).toEqual(['player', 'dealer', 'player', 'dealer', 'dealer']);
    expect(new Set([...d.player, ...d.dealer, ...d.deck]).size).toBe(11);
    expect(d.glimpsed).toBe(false);
  });

  it('a Barrier stops a swap', () => {
    const d = spot([3, 9], [10, 5], { player: ['swapHands'] });
    d.barrier.dealer = true;
    expect(d.useTrump('player', 'swapHands')).toContainEqual({ t: 'blocked', side: 'dealer', id: 'swapHands' });
    expect(d.player).toEqual([3, 9]);
  });

  it('a hand holds seven trumps; a new one that comes with it full is discarded', () => {
    expect(MAX_TRUMPS).toBe(7);
    const d = spot([3, 9], [5, 8], { player: ['reinforce', ...Array<TrumpId>(MAX_TRUMPS - 1).fill('call2')] });
    const ev = d.useTrump('player', 'reinforce');
    expect(d.trumps.player.length).toBe(MAX_TRUMPS);
    expect(ev.filter((e) => e.t === 'overflow' && e.side === 'player').length).toBe(1);
    const e = new Duel(seededRng(4));
    e.trumps.player = Array(MAX_TRUMPS).fill('call2');
    expect(e.start().some((x) => x.t === 'overflow')).toBe(true);
    expect(e.trumps.player.length).toBe(MAX_TRUMPS);
  });

  it('the dealer rescues a bust with the lowest line that covers it, and pulls the target onto a made hand', () => {
    expect(dealerPlays(spot([2, 7], [11, 10, 1], { dealer: ['line27', 'line22', 'line24'] }))).toBe('line22');
    expect(dealerPlays(spot([2, 11, 9], [10, 8], { dealer: ['line19', 'line20'] }))).toBe('line19');
  });
});
