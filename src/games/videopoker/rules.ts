import { rankOf, suitOf, type Card } from '../../core/cards';
import { Cat5, eval5, isHighPair, type Hand5 } from '../../core/eval5';

/** Jacks or Better "9/6" paytable, per coin, for 1..5 coins (royal jumps to 800 per coin at max bet). */
export const VP_ROWS: { key: string; cat: Cat5 | 'jacks'; pays: number }[] = [
  { key: 'hand.royal', cat: Cat5.Royal, pays: 250 },
  { key: 'hand.straightFlush', cat: Cat5.StraightFlush, pays: 50 },
  { key: 'hand.quads', cat: Cat5.Quads, pays: 25 },
  { key: 'hand.fullHouse', cat: Cat5.FullHouse, pays: 9 },
  { key: 'hand.flush', cat: Cat5.Flush, pays: 6 },
  { key: 'hand.straight', cat: Cat5.Straight, pays: 4 },
  { key: 'hand.trips', cat: Cat5.Trips, pays: 3 },
  { key: 'hand.twoPair', cat: Cat5.TwoPair, pays: 2 },
  { key: 'hand.jacks', cat: 'jacks', pays: 1 },
];

export const VP = { coins: [5, 25, 100] as const, maxCoins: 5 };

/** Row index of the paytable hit by a hand (or -1). */
export function vpRow(h: Hand5): number {
  if (h.cat >= Cat5.TwoPair) return VP_ROWS.findIndex((r) => r.cat === h.cat);
  if (isHighPair(h)) return VP_ROWS.length - 1;
  return -1;
}

/** Coins returned for a hand ("for one": the stake is included, so Jacks or Better just returns the bet). */
export function vpPays(row: number, coins: number): number {
  if (row < 0) return 0;
  if (row === 0 && coins === 5) return 4000;
  return VP_ROWS[row].pays * coins;
}

// ---------------------------------------------------------------- simple hold strategy for 9/6 Jacks or Better

const HIGH = (r: number) => r >= 11;

function bySuit(cards: Card[]) {
  const m = new Map<number, number[]>();
  cards.forEach((c, i) => {
    const s = suitOf(c);
    if (!m.has(s)) m.set(s, []);
    m.get(s)!.push(i);
  });
  return m;
}

/** Indices (of 5) making n cards to a royal flush, or null. */
function toRoyal(cards: Card[], n: number): number[] | null {
  let best: number[] | null = null;
  for (const idx of bySuit(cards).values()) {
    const r = idx.filter((i) => rankOf(cards[i]) >= 10);
    if (r.length >= n && (!best || r.length > best.length)) best = r.slice(0, Math.max(n, r.length));
  }
  return best && best.length >= n ? best : null;
}

/** n cards to a straight flush (span ≤ 5), or null. */
function toStraightFlush(cards: Card[], n: number): number[] | null {
  for (const idx of bySuit(cards).values()) {
    if (idx.length < n) continue;
    for (let lo = 1; lo <= 10; lo++) {
      const inRange = idx.filter((i) => {
        let r = rankOf(cards[i]);
        if (r === 14 && lo === 1) r = 1;
        return r >= lo && r <= lo + 4;
      });
      if (inRange.length >= n) return inRange.slice(0, n);
    }
  }
  return null;
}

function toFlush(cards: Card[], n: number): number[] | null {
  for (const idx of bySuit(cards).values()) if (idx.length >= n) return idx.slice(0, n);
  return null;
}

/** 4 to an open-ended straight (no inside gap, not A-low/A-high ended). */
function toOutsideStraight(cards: Card[]): number[] | null {
  const ranks = cards.map(rankOf);
  for (let lo = 2; lo <= 10; lo++) {
    const need = [lo, lo + 1, lo + 2, lo + 3];
    if (need.includes(14)) continue;
    const pick: number[] = [];
    for (const r of need) {
      const i = ranks.findIndex((x, k) => x === r && !pick.includes(k));
      if (i < 0) break;
      pick.push(i);
    }
    if (pick.length === 4) return pick;
  }
  return null;
}

/** Which cards to hold (indices). Follows the classic simple strategy order. */
export function holdAdvice(cards: Card[]): number[] {
  const h = eval5(cards);
  const ranks = cards.map(rankOf);
  const all = [0, 1, 2, 3, 4];
  const counts = new Map<number, number[]>();
  ranks.forEach((r, i) => counts.set(r, [...(counts.get(r) ?? []), i]));
  const groups = [...counts.values()];

  if (h.cat === Cat5.Royal || h.cat === Cat5.StraightFlush) return all;
  if (h.cat === Cat5.Quads) return groups.find((g) => g.length === 4)!;
  const r4 = toRoyal(cards, 4);
  if (r4) return r4;
  if (h.cat === Cat5.FullHouse || h.cat === Cat5.Flush || h.cat === Cat5.Straight) return all;
  if (h.cat === Cat5.Trips) return groups.find((g) => g.length === 3)!;
  const sf4 = toStraightFlush(cards, 4);
  if (sf4) return sf4;
  if (h.cat === Cat5.TwoPair) return groups.filter((g) => g.length === 2).flat();
  if (isHighPair(h)) return groups.find((g) => g.length === 2)!;
  const r3 = toRoyal(cards, 3);
  if (r3) return r3.slice(0, 3);
  const f4 = toFlush(cards, 4);
  if (f4) return f4;
  if (h.cat === Cat5.Pair) return groups.find((g) => g.length === 2)!;
  const os = toOutsideStraight(cards);
  if (os) return os;
  // two suited high cards
  for (const idx of bySuit(cards).values()) {
    const hi = idx.filter((i) => HIGH(ranks[i]));
    if (hi.length >= 2) return hi.slice(0, 2);
  }
  const sf3 = toStraightFlush(cards, 3);
  if (sf3) return sf3;
  const highs = all.filter((i) => HIGH(ranks[i])).sort((a, b) => ranks[a] - ranks[b]);
  if (highs.length >= 2) return highs.slice(0, 2);
  // suited 10 with J/Q/K
  for (const idx of bySuit(cards).values()) {
    const ten = idx.find((i) => ranks[i] === 10);
    const face = idx.find((i) => ranks[i] >= 11 && ranks[i] <= 13);
    if (ten !== undefined && face !== undefined) return [face, ten];
  }
  if (highs.length === 1) return highs;
  return [];
}
