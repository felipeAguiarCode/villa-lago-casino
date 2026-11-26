import { describe, expect, it } from 'vitest';
import { parseCard, parseCards, type Card } from '../src/core/cards';
import { Cat5, eval5 } from '../src/core/eval5';
import { seededRng } from '../src/core/rng';
import { compareFinal, partialEval, score5 } from '../src/games/showdown/hands';
import { payoutFor } from '../src/games/showdown/payout';
import { ShowdownError, ShowdownRound, type Bank, type SdEvent } from '../src/games/showdown/round';
import { simulate } from '../src/games/showdown/sim';
import { heuristicStrategy, highCardStrategy, mcValues, monteCarloStrategy, randomStrategy, type PickStrategy, type SeatView } from '../src/games/showdown/strategy';

/** A wallet double that records every movement. */
function bank(balance = 10_000) {
  const b = {
    balance,
    debits: [] as number[],
    credits: [] as number[],
    canAfford: (n: number) => b.balance >= n,
    debit: (n: number) => {
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

/** Picks the highest card: predictable for scripted decks. */
const high = highCardStrategy();

/**
 * Deck order: p0 d0 p1 d1 p2 d2 p3 d3, then per turn the player's refill and the dealer's refill.
 * Both sides A-K-Q-J + 5 with different suits: a complete tie.
 */
const TIE_STACK = parseCards('As Ah Ks Kh Qs Qh Js Jh 2c 2d 3c 3d 4c 4d 5c 5d');

function newRound(o: { b?: Bank; stack?: Card[]; dealer?: PickStrategy; seed?: number; cfg?: object } = {}) {
  return new ShowdownRound({ bank: o.b ?? bank(), stack: o.stack, dealer: o.dealer ?? high, rng: seededRng(o.seed ?? 1), cfg: o.cfg });
}

/** Plays every selection with the highest card and answers windows with `bets`. */
function playOut(r: ShowdownRound, bets: ('check' | 'double' | 'fold')[] = []) {
  const all: SdEvent[] = [];
  let w = 0;
  while (r.state !== 'ROUND_COMPLETE') {
    if (r.inWindow) {
      const d = bets[w++] ?? 'check';
      all.push(...(d === 'double' ? r.double() : d === 'fold' ? r.fold() : r.check()));
      continue;
    }
    const v = r.playerView();
    all.push(...r.select(v.available[high(v)]));
  }
  return all;
}

describe('Showdown Poker – dealing', () => {
  it('debits the ante and deals four cards each, alternately', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    const ev = r.start(100);
    expect(b.debits).toEqual([100]);
    expect(r.totalBet).toBe(100);
    const deals = ev.filter((e) => e.t === 'deal');
    expect(deals.map((e) => e.who)).toEqual(['player', 'dealer', 'player', 'dealer', 'player', 'dealer', 'player', 'dealer']);
    expect(r.playerAvailable).toEqual(parseCards('As Ks Qs Js'));
    expect(r.playerFinal).toEqual([]);
    expect(r.dealerCounts).toEqual({ available: 4, final: 0 });
    expect(r.turn).toBe(0);
    expect(r.state).toBe('PLAYER_SELECTION');
    expect(r.remainingCards).toBe(44);
  });

  it('never deals the same card twice in a round', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = newRound({ seed });
      const ev = [...r.start(10), ...playOut(r)];
      const seen = [...r.playerFinal, ...r.playerAvailable, ...r.dealerFinal!];
      expect(new Set(seen).size).toBe(seen.length);
      const dealt = ev.flatMap((e) => ((e.t === 'deal' || e.t === 'refill') && e.who === 'player' ? [e.card] : []));
      expect(new Set(dealt).size).toBe(8);
      expect(r.remainingCards).toBe(52 - 16);
    }
  });

  it('rejects a stacked deck with repeated cards', () => {
    const r = newRound({ stack: [0, 1, 0] });
    expect(() => r.start(10)).toThrow(ShowdownError);
  });
});

describe('Showdown Poker – progressive hand building', () => {
  it('moves the chosen card to the final hand and refills the same slot', () => {
    const r = newRound({ stack: TIE_STACK });
    r.start(10);
    const ev = r.select(parseCard('Ks'));
    expect(r.playerFinal).toEqual([parseCard('Ks')]);
    expect(r.playerAvailable).toEqual(parseCards('As 2c Qs Js'));
    expect(r.dealerCounts).toEqual({ available: 4, final: 1 });
    const order = ev.filter((e) => e.t === 'commit' || e.t === 'refill').map((e) => `${e.t}:${e.who}`);
    expect(order).toEqual(['commit:player', 'refill:player', 'commit:dealer', 'refill:dealer']);
  });

  it('has exactly five turns; the fifth one draws nothing', () => {
    const r = newRound({ stack: TIE_STACK });
    r.start(10);
    const refills: number[] = [];
    while (r.state !== 'ROUND_COMPLETE') {
      if (r.inWindow) {
        r.check();
        continue;
      }
      const left = r.remainingCards;
      const v = r.playerView();
      r.select(v.available[0]);
      refills.push(left - r.remainingCards);
    }
    expect(refills).toEqual([2, 2, 2, 2, 0]);
    expect(r.turn).toBe(5);
    expect(r.playerFinal.length).toBe(5);
    expect(r.playerAvailable.length).toBe(3);
    expect(r.dealerFinal!.length).toBe(5);
  });

  it('refuses cards that are not in the available hand', () => {
    const r = newRound({ stack: TIE_STACK });
    r.start(10);
    r.select(parseCard('As'));
    // already confirmed, the dealer's card, and a card still in the deck
    for (const c of parseCards('As Ah 9c')) expect(() => r.select(c)).toThrow(/not in your available hand/);
    expect(r.playerFinal).toEqual([parseCard('As')]);
  });

  it('refuses a selection outside the selection state (duplicate clicks, windows)', () => {
    const r = newRound({ stack: TIE_STACK });
    expect(() => r.select(0)).toThrow(ShowdownError);
    r.start(10);
    r.select(parseCard('As'));
    r.select(parseCard('Ks'));
    expect(r.state).toBe('FIRST_BETTING_ROUND');
    expect(() => r.select(parseCard('Qs'))).toThrow(/expected PLAYER_SELECTION/);
  });
});

describe('Showdown Poker – hidden dealer information', () => {
  it('never puts a dealer card in an event before the showdown', () => {
    const r = newRound({ stack: TIE_STACK });
    const ev = [...r.start(10)];
    for (let i = 0; i < 4; i++) {
      const v = r.playerView();
      ev.push(...r.select(v.available[high(v)]));
      if (r.inWindow) ev.push(...r.check());
      expect(r.dealerFinal).toBeNull();
      expect(r.dealerHand).toBeNull();
    }
    for (const e of ev) if ((e.t === 'deal' || e.t === 'commit' || e.t === 'refill') && e.who === 'dealer') expect('card' in e).toBe(false);
    expect(ev.some((e) => e.t === 'reveal')).toBe(false);
    const last = r.select(r.playerAvailable[0]);
    expect(last.find((e) => e.t === 'reveal')).toBeTruthy();
    expect(r.dealerFinal).toEqual(parseCards('Ah Kh Qh Jh 5d'));
  });

  it('gives the dealer strategy only its own cards', () => {
    const views: SeatView[] = [];
    const spy: PickStrategy = (v) => {
      views.push(v);
      return high(v);
    };
    for (let seed = 1; seed <= 20; seed++) {
      const r = newRound({ seed, dealer: spy });
      r.start(10);
      const playerCards = new Set<Card>();
      while (r.state !== 'ROUND_COMPLETE') {
        r.playerAvailable.forEach((c) => playerCards.add(c));
        if (r.inWindow) r.double();
        else r.select(r.playerAvailable[0]);
      }
      for (const v of views.splice(0)) {
        expect(Object.keys(v).sort()).toEqual(['available', 'final', 'picksLeft', 'seen']);
        for (const c of [...v.available, ...v.final, ...v.seen]) expect(playerCards.has(c)).toBe(false);
        expect(Object.isFrozen(v) && Object.isFrozen(v.available)).toBe(true);
      }
    }
  });

  it('builds the same dealer hand whatever the player picks or bets', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const hands = new Set<string>();
      const plans: { pick: PickStrategy; bets: ('check' | 'double')[]; ante: number }[] = [
        { pick: high, bets: ['check', 'check'], ante: 10 },
        { pick: randomStrategy(seededRng(99)), bets: ['double', 'double'], ante: 500 },
        { pick: () => 0, bets: ['double', 'check'], ante: 25 },
      ];
      for (const plan of plans) {
        const r = newRound({ seed, dealer: monteCarloStrategy(seededRng(seed * 7), 40) });
        r.start(plan.ante);
        let w = 0;
        while (r.state !== 'ROUND_COMPLETE') {
          if (r.inWindow) {
            if (plan.bets[w++] === 'double') r.double();
            else r.check();
          } else {
            const v = r.playerView();
            r.select(v.available[plan.pick(v)]);
          }
        }
        hands.add(r.dealerFinal!.join(','));
      }
      expect(hands.size).toBe(1);
    }
  });
});

describe('Showdown Poker – hand evaluation', () => {
  it('partial hands only report made pairs, trips and quads', () => {
    expect(partialEval(parseCards('9h Th Jh Qh')).cat).toBe(Cat5.High);
    expect(partialEval(parseCards('9h Th Jh Qh')).complete).toBe(false);
    expect(partialEval(parseCards('7c 7d')).cat).toBe(Cat5.Pair);
    expect(partialEval(parseCards('7c 7d Kc Kh'))).toEqual({ cat: Cat5.TwoPair, ranks: [13, 7], complete: false });
    expect(partialEval(parseCards('7c 7d 7h Kc')).cat).toBe(Cat5.Trips);
    expect(partialEval(parseCards('7c 7d 7h 7s')).cat).toBe(Cat5.Quads);
    expect(partialEval([]).cat).toBe(Cat5.High);
    expect(partialEval(parseCards('7c 7d 7h Kc Kd'))).toMatchObject({ cat: Cat5.FullHouse, complete: true });
    expect(partialEval(parseCards('9h Th Jh Qh Kh'))).toMatchObject({ cat: Cat5.StraightFlush, complete: true });
  });

  it('ranks and breaks ties the traditional way, never by suit', () => {
    const cmp = (a: string, b: string) => compareFinal(parseCards(a), parseCards(b));
    expect(cmp('Ah Kh Qh Jh Th', '9s 9h 9d 9c Ac')).toBe(1);
    expect(cmp('2c 3d 4h 5s 6c', 'Ac 2d 3h 4s 5c')).toBe(1); // 6-high straight beats the wheel
    expect(cmp('Tc Jd Qh Ks Ac', '9c Td Jh Qs Kc')).toBe(1); // broadway
    expect(cmp('Ac 2d 3h 4s 5c', 'Kc Kd Kh 2s 2c')).toBe(-1);
    expect(cmp('Ah 9h 7h 4h 2h', 'Ac 9c 7c 4c 3c')).toBe(-1); // flush: fifth card decides
    expect(cmp('Kc Kd 5h 5s 9c', 'Kh Ks 5c 5d 8c')).toBe(1); // two pair kicker
    expect(cmp('Qc Qd 4h 4s Ac', 'Jh Js Td Tc Ad')).toBe(1); // higher top pair
    expect(cmp('8c 8d 8h Ks 2c', '7h 7s 7d Ac Kd')).toBe(1); // higher trips
    expect(cmp('9c 9d 9h 9s 2c', '8h 8s 8d 8c Ad')).toBe(1); // higher quads
    expect(cmp('Ac Kd 9h 6s 3c', 'Ad Kc 9s 6h 3d')).toBe(0); // same ranks, other suits: tie
    expect(cmp('Ac Kd 9h 6s 3c', 'Ad Kc 9s 6h 2d')).toBe(1); // last kicker
  });

  it('the fast scorer agrees with the casino evaluator', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 40_000; i++) {
      const deck = Array.from({ length: 52 }, (_, k) => k);
      const h: Card[] = [];
      for (let k = 0; k < 5; k++) h.push(deck.splice(rng(deck.length), 1)[0]);
      expect(score5(h)).toBe(eval5(h).score);
    }
    for (const s of ['Ac 2d 3h 4s 5c', 'Tc Jc Qc Kc Ac', '2h 3h 4h 5h Ah', '9c 9d 9h 9s 2c', 'Kc Kd Kh 2s 2c']) expect(score5(parseCards(s))).toBe(eval5(parseCards(s)).score);
  });
});

describe('Showdown Poker – betting', () => {
  const toWindow = (r: ShowdownRound) => {
    while (!r.inWindow) r.select(r.playerAvailable[0]);
  };

  it('opens windows only after turns 2 and 4', () => {
    const r = newRound({ stack: TIE_STACK });
    const ev = [...r.start(10), ...playOut(r)];
    const windows = ev.filter((e) => e.t === 'window').map((e) => (e as { n: number }).n);
    expect(windows).toEqual([1, 2]);
    expect(r.history.filter((s) => s === 'FIRST_BETTING_ROUND' || s === 'FINAL_BETTING_ROUND')).toEqual(['FIRST_BETTING_ROUND', 'FINAL_BETTING_ROUND']);
  });

  it('check keeps the bet, double doubles the whole bet each time', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(100);
    toWindow(r);
    r.check();
    expect(r.totalBet).toBe(100);
    expect(b.debits).toEqual([100]);
    toWindow(r);
    r.double();
    expect(r.totalBet).toBe(200);
    expect(b.debits).toEqual([100, 100]);
    expect(r.decisions).toEqual(['check', 'double']);
  });

  it('two doubles: 100 → 200 → 400', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(100);
    toWindow(r);
    r.double();
    expect(() => r.double()).toThrow(/no betting window/); // one double per window
    toWindow(r);
    r.double();
    expect(r.totalBet).toBe(400);
    expect(b.debits).toEqual([100, 100, 200]);
  });

  it('fold loses everything, stops dealing and skips the showdown', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(100);
    toWindow(r);
    r.double();
    toWindow(r);
    const left = r.remainingCards;
    const ev = r.fold();
    expect(r.result).toBe('fold');
    expect(r.payout).toBe(0);
    expect(b.credits).toEqual([]);
    expect(b.balance).toBe(800);
    expect(r.remainingCards).toBe(left);
    expect(r.history).not.toContain('SHOWDOWN');
    expect(r.history.slice(-2)).toEqual(['FOLDED', 'ROUND_COMPLETE']);
    expect(r.dealerFinal).toBeNull();
    expect(ev.some((e) => e.t === 'reveal')).toBe(false);
  });

  it('fold, check and double only inside a window', () => {
    const r = newRound({ stack: TIE_STACK });
    expect(() => r.fold()).toThrow(ShowdownError);
    r.start(10);
    expect(() => r.fold()).toThrow(/no betting window/);
    expect(() => r.check()).toThrow(/no betting window/);
    expect(() => r.double()).toThrow(/no betting window/);
  });

  it('balance limits: the ante, a double, but never forcing a fold', () => {
    const poor = bank(50);
    const r0 = newRound({ b: poor });
    expect(() => r0.start(100)).toThrow(/insufficient/);
    expect(r0.state).toBe('BETTING');
    expect(poor.debits).toEqual([]);
    const b = bank(150);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(100);
    toWindow(r);
    expect(r.doubleBlock()).toBe('funds');
    expect(() => r.double()).toThrow(/insufficient/);
    expect(r.totalBet).toBe(100);
    r.check(); // still allowed
    expect(r.state).toBe('PLAYER_SELECTION');
  });

  it('respects the ante range and the table limit', () => {
    expect(() => newRound().start(2)).toThrow(/ante/);
    expect(() => newRound().start(5000)).toThrow(/ante/);
    expect(() => newRound().start(10.5)).toThrow(/ante/);
    const r = newRound({ stack: TIE_STACK, cfg: { maxTotal: 300 } });
    r.start(100);
    toWindow(r);
    r.double();
    toWindow(r);
    expect(r.doubleBlock()).toBe('limit');
    expect(() => r.double()).toThrow(/limit/);
  });
});

describe('Showdown Poker – showdown and payouts', () => {
  it('payout table: 1:1 plus the stake, push returns, loss and fold nothing', () => {
    expect(payoutFor('win', 400)).toBe(800);
    expect(payoutFor('push', 400)).toBe(400);
    expect(payoutFor('lose', 400)).toBe(0);
    expect(payoutFor('fold', 400)).toBe(0);
  });

  it('a complete tie pushes the whole bet', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(100);
    playOut(r, ['double', 'double']);
    expect(r.playerFinal).toEqual(parseCards('As Ks Qs Js 5c'));
    expect(r.result).toBe('push');
    expect(r.payout).toBe(400);
    expect(b.balance).toBe(1000);
  });

  it('a win pays 1:1 on the total bet; a loss debits nothing more', () => {
    // player gets four aces, the dealer junk
    const win = parseCards('As 2d Ah 3c Ad 4h Ac 6s Kc 8d Kd 9c 2s Tc 3s Jd');
    const b = bank(1000);
    const r = newRound({ b, stack: win });
    r.start(100);
    playOut(r, ['double', 'double']);
    expect(r.playerHand!.cat).toBe(Cat5.Quads);
    expect(r.result).toBe('win');
    expect(b.credits).toEqual([800]);
    expect(b.balance).toBe(1000 - 400 + 800);
    const lose = parseCards('2d As 3c Ah 4h Ad 6s Ac 8d Kc 9c Kd Tc 2s Jd 3s');
    const b2 = bank(1000);
    const r2 = newRound({ b: b2, stack: lose });
    r2.start(100);
    playOut(r2, ['check', 'double']);
    expect(r2.result).toBe('lose');
    expect(b2.debits).toEqual([100, 100]);
    expect(b2.credits).toEqual([]);
  });

  it('goes through the state machine in order and settles once', () => {
    const b = bank(1000);
    const r = newRound({ b, stack: TIE_STACK });
    r.start(10);
    playOut(r);
    const turn = ['PLAYER_SELECTION', 'PLAYER_REFILL', 'DEALER_SELECTION', 'DEALER_REFILL', 'TURN_COMPLETE'];
    expect(r.history).toEqual([
      'BETTING',
      'DEALING',
      ...turn,
      ...turn,
      'FIRST_BETTING_ROUND',
      ...turn,
      ...turn,
      'FINAL_BETTING_ROUND',
      'PLAYER_SELECTION',
      'DEALER_SELECTION',
      'TURN_COMPLETE',
      'SHOWDOWN',
      'SETTLEMENT',
      'ROUND_COMPLETE',
    ]);
    expect(b.credits.length).toBe(1);
    // nothing can happen to a finished round
    expect(() => r.start(10)).toThrow(ShowdownError);
    expect(() => r.select(r.playerAvailable[0])).toThrow(ShowdownError);
    expect(() => r.fold()).toThrow(ShowdownError);
    expect(b.credits.length).toBe(1);
  });

  it('a round cannot be restarted for new cards', () => {
    const r = newRound();
    r.start(10);
    const cards = [...r.playerAvailable];
    expect(() => r.start(10)).toThrow(/expected BETTING/);
    expect(r.playerAvailable).toEqual(cards);
  });

  it('every round gets its own id', () => {
    expect(newRound().id).not.toBe(newRound().id);
  });
});

describe('Showdown Poker – dealer AI', () => {
  const view = (final: string, available: string, extraSeen = ''): SeatView => {
    const f = parseCards(final);
    const a = parseCards(available);
    return { final: f, available: a, picksLeft: 5 - f.length, seen: [...f, ...a, ...parseCards(extraSeen)] };
  };

  it('completes a flush on the last pick instead of taking the highest card', () => {
    const v = view('2h 7h 9h Jh', 'As 4h Kc 3d');
    expect(v.available[monteCarloStrategy(seededRng(1), 50)(v)]).toBe(parseCard('4h'));
    expect(v.available[highCardStrategy()(v)]).toBe(parseCard('As'));
  });

  it('keeps a three-card flush alive with two picks left', () => {
    const v = view('2h 7h 9h', 'As 4h 8c 3d');
    expect(v.available[monteCarloStrategy(seededRng(2), 400)(v)]).toBe(parseCard('4h'));
  });

  it('builds on a pair and values trips', () => {
    const v = view('Qc Qd', 'Qh 2s 7d 9c');
    expect(v.available[monteCarloStrategy(seededRng(3), 300)(v)]).toBe(parseCard('Qh'));
    const r = mcValues(v, seededRng(4), 300);
    expect(r.values[0]).toBeGreaterThan(r.values[1]);
  });

  it('plays far better than random or always-highest selection', () => {
    const dealer = monteCarloStrategy(seededRng(5), 60);
    const vsRandom = simulate({ rounds: 400, player: randomStrategy(seededRng(6)), dealer, rng: seededRng(7) });
    const vsHigh = simulate({ rounds: 400, player: highCardStrategy(), dealer, rng: seededRng(8) });
    const vsHeur = simulate({ rounds: 400, player: heuristicStrategy(), dealer, rng: seededRng(9) });
    expect(vsRandom.losses / vsRandom.rounds).toBeGreaterThan(0.6);
    expect(vsHigh.losses).toBeGreaterThan(vsHigh.wins);
    expect(vsHeur.losses).toBeGreaterThan(vsHeur.wins * 0.85);
  });
});
