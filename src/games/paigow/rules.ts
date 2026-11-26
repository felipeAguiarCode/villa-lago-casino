import { rankOf, suitOf, type Card } from '../../core/cards';
import { Cat5, eval5, type Hand5 } from '../../core/eval5';

/** Pai Gow Poker, 52-card deck (no joker): 7 cards split into a 5-card high hand and a 2-card low hand. */
export const PG = { minBet: 5, maxBet: 2500, commission: 0.05 };

const B = 15;

/** 5-card score with Pai Gow's straight order: A-2-3-4-5 is the second-highest straight. */
export function highScore(h: Hand5): number {
  if ((h.cat === Cat5.Straight || h.cat === Cat5.StraightFlush) && h.ranks[0] === 5) {
    return h.cat * B ** 5 + 13.5 * B ** 4;
  }
  return h.score;
}

export interface Low {
  pair: boolean;
  ranks: [number, number];
  score: number;
}

/** 2-card hand: a pair beats any two high cards. Scores share the 5-card scale (Cat5.Pair / Cat5.High). */
export function evalLow(cards: Card[]): Low {
  const [a, b] = cards.map(rankOf).sort((x, y) => y - x);
  const pair = a === b;
  const cat = pair ? Cat5.Pair : Cat5.High;
  const score = cat * B ** 5 + a * B ** 4 + (pair ? 0 : b * B ** 3);
  return { pair, ranks: [a, b], score };
}

/** The high hand must be at least as strong as the low hand. */
export function validSplit(high: Card[], low: Card[]): boolean {
  const h = eval5(high);
  const l = evalLow(low);
  if (h.cat > Cat5.Pair) return true;
  if (h.cat === Cat5.Pair) return !l.pair || h.ranks[0] >= l.ranks[0];
  // high card vs high card
  if (l.pair) return false;
  if (h.ranks[0] !== l.ranks[0]) return h.ranks[0] > l.ranks[0];
  return h.ranks[1] >= l.ranks[1];
}

export interface Split {
  high: Card[];
  low: Card[];
}

const without = (cards: Card[], take: Card[]) => cards.filter((c) => !take.includes(c));
const byRankDesc = (a: Card, b: Card) => rankOf(b) - rankOf(a);

function splitFrom(cards: Card[], low: Card[]): Split {
  return { high: without(cards, low), low };
}

/** Best valid split that keeps a straight or flush in the high hand (best low hand wins), or null. */
function keepStraightOrFlush(cards: Card[]): Split | null {
  let best: Split | null = null;
  let bestLow = -1;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++) {
      const low = [cards[i], cards[j]];
      const high = without(cards, low);
      const h = eval5(high);
      if (h.cat !== Cat5.Straight && h.cat !== Cat5.Flush && h.cat !== Cat5.StraightFlush && h.cat !== Cat5.Royal) continue;
      const l = evalLow(low);
      if (l.score > bestLow && validSplit(high, low)) {
        bestLow = l.score;
        best = { high, low };
      }
    }
  return best;
}

/** Dealer's "house way" (a standard simplified version). Also used for the player's hint. */
export function houseWay(cards: Card[]): Split {
  const sorted = [...cards].sort(byRankDesc);
  const groups = new Map<number, Card[]>();
  for (const c of sorted) {
    const r = rankOf(c);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c);
  }
  const g = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const quads = g.filter(([, cs]) => cs.length === 4);
  const trips = g.filter(([, cs]) => cs.length === 3);
  const pairs = g.filter(([, cs]) => cs.length === 2);
  const singles = g.filter(([, cs]) => cs.length === 1).map(([, cs]) => cs[0]);
  let out: Split | null = null;

  if (quads.length) {
    const [qr, qc] = quads[0];
    if (pairs.length) out = splitFrom(sorted, pairs[0][1]);
    else if (qr >= 11 && singles.length >= 2) out = splitFrom(sorted, qc.slice(0, 2)); // split high quads into two pairs
    else out = splitFrom(sorted, singles.slice(0, 2));
  } else if (trips.length >= 2) {
    out = splitFrom(sorted, trips[0][1].slice(0, 2));
  } else if (trips.length && pairs.length) {
    // full house: the highest pair goes to the low hand
    out = splitFrom(sorted, pairs[0][1]);
  } else if (pairs.length >= 3) {
    out = splitFrom(sorted, pairs[0][1]);
  } else if (pairs.length === 2) {
    const sf = keepStraightOrFlush(sorted);
    const ace = singles.find((c) => rankOf(c) === 14);
    if (sf) out = sf;
    else if (ace && pairs[0][0] <= 10) out = splitFrom(sorted, [ace, singles.find((c) => c !== ace)!]);
    else out = splitFrom(sorted, pairs[1][1]);
  } else {
    const sf = keepStraightOrFlush(sorted);
    if (sf) out = sf;
    else if (trips.length) {
      const [tr, tc] = trips[0];
      out = tr === 14 ? splitFrom(sorted, [tc[0], singles[0]]) : splitFrom(sorted, singles.slice(0, 2));
    } else if (pairs.length === 1) out = splitFrom(sorted, singles.slice(0, 2));
    else out = splitFrom(sorted, sorted.slice(1, 3));
  }
  if (out && validSplit(out.high, out.low)) return out;
  // fallback: strongest valid low hand
  let best: Split | null = null;
  let bestLow = -1;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++) {
      const low = [sorted[i], sorted[j]];
      const high = without(sorted, low);
      if (!validSplit(high, low)) continue;
      const l = evalLow(low).score;
      if (l > bestLow) {
        bestLow = l;
        best = { high, low };
      }
    }
  return best!;
}

export interface PgResult {
  highWin: number;
  lowWin: number;
  outcome: 'win' | 'push' | 'lose';
  ret: number;
  ph: Hand5;
  dh: Hand5;
  pl: Low;
  dl: Low;
}

/** Copies (exact ties) go to the dealer. Winning both pays 1:1 less 5% commission. */
export function settlePg(player: Split, dealer: Split, bet: number): PgResult {
  const ph = eval5(player.high);
  const dh = eval5(dealer.high);
  const pl = evalLow(player.low);
  const dl = evalLow(dealer.low);
  const highWin = highScore(ph) > highScore(dh) ? 1 : -1;
  const lowWin = pl.score > dl.score ? 1 : -1;
  let outcome: PgResult['outcome'];
  let ret: number;
  if (highWin > 0 && lowWin > 0) {
    outcome = 'win';
    ret = bet * (2 - PG.commission);
  } else if (highWin < 0 && lowWin < 0) {
    outcome = 'lose';
    ret = 0;
  } else {
    outcome = 'push';
    ret = bet;
  }
  return { highWin, lowWin, outcome, ret, ph, dh, pl, dl };
}

export const suitedPair = (a: Card, b: Card) => suitOf(a) === suitOf(b);
