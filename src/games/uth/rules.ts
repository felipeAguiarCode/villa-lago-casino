import { rankOf, suitOf, type Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';

/** Blind pays (to 1) when the player wins; lower hands push the Blind. */
export const BLIND_PAYS: Partial<Record<Cat5, number>> = {
  [Cat5.Royal]: 500,
  [Cat5.StraightFlush]: 50,
  [Cat5.Quads]: 10,
  [Cat5.FullHouse]: 3,
  [Cat5.Flush]: 1.5,
  [Cat5.Straight]: 1,
};

/** Trips side bet pays (to 1) on the player's final hand, regardless of the dealer. */
export const TRIPS_PAYS: Partial<Record<Cat5, number>> = {
  [Cat5.Royal]: 50,
  [Cat5.StraightFlush]: 40,
  [Cat5.Quads]: 30,
  [Cat5.FullHouse]: 8,
  [Cat5.Flush]: 7,
  [Cat5.Straight]: 4,
  [Cat5.Trips]: 3,
};

export const UTH = { minBet: 5, maxBet: 1000 };

export const dealerQualifies = (h: Hand5) => h.cat >= Cat5.Pair;

export interface UthResult {
  player: Hand5;
  dealer: Hand5;
  qualifies: boolean;
  cmp: number;
  ret: { ante: number; blind: number; play: number; trips: number };
}

/** `play` is the amount bet on Play (0 when folded). */
export function settleUth(hole: Card[], dealer: Card[], board: Card[], bets: { ante: number; blind: number; trips: number }, play: number, folded: boolean): UthResult {
  const ph = bestOf([...hole, ...board]);
  const dh = bestOf([...dealer, ...board]);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, blind: 0, play: 0, trips: 0 };
  if (!folded) {
    if (cmp > 0) {
      ret.ante = qualifies ? bets.ante * 2 : bets.ante;
      ret.play = play * 2;
      ret.blind = bets.blind * (1 + (BLIND_PAYS[ph.cat] ?? 0));
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.play = play;
      ret.blind = bets.blind;
    } else {
      ret.ante = qualifies ? 0 : bets.ante;
    }
  }
  const tm = TRIPS_PAYS[ph.cat];
  if (bets.trips > 0 && tm) ret.trips = bets.trips * (1 + tm);
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}

// ---------------------------------------------------------------- simplified strategy (Wizard of Odds style)

/** Pre-flop: bet 4× with any pair 3s+, any Ace, K2s+/K5o+, Q6s+/Q8o+, J8s+/JTo+. */
export function preflopRaise(hole: Card[]): boolean {
  const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  if (a === b) return a >= 3;
  if (a === 14) return true;
  if (a === 13) return suited ? true : b >= 5;
  if (a === 12) return suited ? b >= 6 : b >= 8;
  if (a === 11) return suited ? b >= 8 : b >= 10;
  return false;
}

/** Flop: bet 2× with two pair+, a pair using a hole card (not pocket 2s), or 4 to a flush with a hidden 10+. */
export function flopRaise(hole: Card[], board: Card[]): boolean {
  const h = bestOf([...hole, ...board]);
  if (h.cat >= Cat5.TwoPair && madeUsesHole(h, hole)) return true;
  // hidden pair, except pocket deuces
  if (h.cat === Cat5.Pair && hole.some((c) => rankOf(c) === h.ranks[0]) && !(rankOf(hole[0]) === 2 && rankOf(hole[1]) === 2)) return true;
  for (let s = 0; s < 4; s++) {
    const all = [...hole, ...board].filter((c) => suitOf(c) === s);
    if (all.length >= 4 && hole.some((c) => suitOf(c) === s && rankOf(c) >= 10)) return true;
  }
  return false;
}

/** Number of unseen cards that, together with the board, would beat the player's hand ("dealer outs"). */
export function dealerOuts(hole: Card[], board: Card[]): number {
  const mine = bestOf([...hole, ...board]).score;
  const seen = new Set([...hole, ...board]);
  let outs = 0;
  for (let c = 0; c < 52; c++) {
    if (seen.has(c)) continue;
    if (bestOf([...board, c]).score > mine) outs++;
  }
  return outs;
}

/**
 * A made hand of pair or better that really uses a hole card (a better kicker alone does not count):
 * either a higher category than the board alone, or the same category with different made ranks.
 */
export function hiddenMade(hole: Card[], board: Card[]): boolean {
  const h = bestOf([...hole, ...board]);
  if (h.cat < Cat5.Pair) return false;
  if (board.length < 5) return h.cat > Cat5.High && hole.some((c) => h.cards.includes(c)) && madeUsesHole(h, hole);
  const b = bestOf(board);
  if (h.cat > b.cat) return true;
  if (h.cat < b.cat) return false;
  const made = h.cat === Cat5.TwoPair || h.cat === Cat5.FullHouse ? 2 : 1;
  for (let i = 0; i < made; i++) if (h.ranks[i] !== b.ranks[i]) return true;
  return false;
}

function madeUsesHole(h: ReturnType<typeof bestOf>, hole: Card[]): boolean {
  if (h.cat >= Cat5.Straight && h.cat !== Cat5.Quads && h.cat !== Cat5.FullHouse) return hole.some((c) => h.cards.includes(c));
  const counts = new Map<number, number>();
  for (const c of h.cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  return hole.some((c) => h.cards.includes(c) && (counts.get(rankOf(c)) ?? 0) >= 2);
}

/** River: bet 1× with a hidden pair or better, or when fewer than 21 dealer outs beat you; otherwise fold. */
export function riverBet(hole: Card[], board: Card[]): boolean {
  if (hiddenMade(hole, board)) return true;
  return dealerOuts(hole, board) < 21;
}
