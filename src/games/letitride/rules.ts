import { rankOf, suitOf, type Card } from '../../core/cards';
import { Cat5, eval5, type Hand5 } from '../../core/eval5';

export const LIR = { minBet: 5, maxBet: 1000 };

/** Pays (to 1) on every bet still riding. */
export const LIR_PAYS: Partial<Record<Cat5, number>> = {
  [Cat5.Royal]: 1000,
  [Cat5.StraightFlush]: 200,
  [Cat5.Quads]: 50,
  [Cat5.FullHouse]: 11,
  [Cat5.Flush]: 8,
  [Cat5.Straight]: 5,
  [Cat5.Trips]: 3,
  [Cat5.TwoPair]: 2,
  [Cat5.Pair]: 1,
};

/** Multiplier for a final hand (0 = loses). A pair pays only when it is Tens or better. */
export function lirPays(h: Hand5): number {
  if (h.cat === Cat5.Pair) return h.ranks[0] >= 10 ? 1 : 0;
  return LIR_PAYS[h.cat] ?? 0;
}

/** Amount returned on each riding bet. */
export function settleLir(cards: Card[], riding: Record<string, number>) {
  const h = eval5(cards);
  const m = lirPays(h);
  const ret: Record<string, number> = {};
  for (const [id, b] of Object.entries(riding)) ret[id] = m > 0 ? b * (1 + m) : 0;
  return { hand: h, mult: m, ret };
}

const HIGH = (r: number) => r >= 10;

/** Ranks with aces counted high, and also low when that helps a straight. */
function straightSpan(ranks: number[]): { span: number; gaps: number; high: number } | null {
  const sets = [ranks, ranks.map((r) => (r === 14 ? 1 : r))];
  let best: { span: number; gaps: number; high: number } | null = null;
  for (const rs of sets) {
    const u = [...new Set(rs)].sort((a, b) => a - b);
    if (u.length !== ranks.length) return null;
    const span = u[u.length - 1] - u[0] + 1;
    const cand = { span, gaps: span - u.length, high: rs.filter(HIGH).length };
    if (!best || cand.span < best.span) best = cand;
  }
  return best;
}

/** First decision (three cards): let it ride? Published basic strategy. */
export function rideFirst(cards: Card[]): boolean {
  const h3 = cards.map(rankOf);
  const counts = new Map<number, number>();
  for (const r of h3) counts.set(r, (counts.get(r) ?? 0) + 1);
  for (const [r, n] of counts) {
    if (n >= 3) return true;
    if (n === 2 && r >= 10) return true;
  }
  const suited = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  if (!suited) return false;
  const s = straightSpan(h3);
  if (!s || s.span > 5) return false;
  if (h3.every(HIGH)) return true; // three to a royal
  if (s.span === 3) {
    const sorted = [...h3].sort((a, b) => a - b).join(',');
    return sorted !== '2,3,4' && sorted !== '2,3,14';
  }
  if (s.span === 4) return s.high >= 1;
  return s.high >= 2;
}

/** Second decision (four cards): let it ride? */
export function rideSecond(cards: Card[]): boolean {
  const ranks = cards.map(rankOf);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()];
  if (groups.some(([, n]) => n >= 3)) return true;
  const pairs = groups.filter(([, n]) => n === 2);
  if (pairs.length >= 2) return true;
  if (pairs.some(([r]) => r >= 10)) return true;
  if (cards.every((c) => suitOf(c) === suitOf(cards[0]))) return true;
  const s = straightSpan(ranks);
  if (s && s.span <= 5) {
    const outside = s.span === 4 && !ranks.includes(14);
    if (outside && s.high >= 1) return true;
    if (s.high >= 4) return true;
  }
  return false;
}
