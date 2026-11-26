import { rankOf, suitOf, type Card } from '../../core/cards';
import { Cat3, eval3, type Hand3 } from '../../core/eval3';

export const H3 = { minBet: 5, maxBet: 1000 };

/** Best Three Card Poker hand out of 3..5 cards (playing the board is allowed). */
export function best3(cards: Card[]): Hand3 & { cards: Card[] } {
  let best: (Hand3 & { cards: Card[] }) | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const cs = [cards[a], cards[b], cards[c]];
        const h = eval3(cs);
        if (!best || h.score > best.score) best = { ...h, cards: cs };
      }
  return best!;
}

/** Dealer qualifies with a pair of 4s or better. */
export const dealerQualifies = (h: Hand3) => h.cat > Cat3.Pair || (h.cat === Cat3.Pair && h.ranks[0] >= 4);

/** "Pair or Suited" side bet on the two pocket cards. */
export function pairOrSuited(pocket: Card[]): number {
  const [a, b] = pocket.map(rankOf).sort((x, y) => y - x);
  const suited = suitOf(pocket[0]) === suitOf(pocket[1]);
  if (suited && a === 14 && b === 13) return 30;
  if (a === b) return a === 14 ? 20 : a === 13 ? 10 : 4;
  return suited ? 1 : 0;
}

/** "Straight or Up" side bet on the player's best three of five. */
export function straightOrUp(five: Card[]): number {
  // AKQ suited plus a pair with the other two cards
  for (let s = 0; s < 4; s++) {
    const royal = [14, 13, 12].map((r) => five.find((c) => rankOf(c) === r && suitOf(c) === s));
    if (royal.every((c) => c !== undefined)) {
      const rest = five.filter((c) => !royal.includes(c));
      return rest.length === 2 && rankOf(rest[0]) === rankOf(rest[1]) ? 100 : 40;
    }
  }
  const h = best3(five);
  if (h.cat === Cat3.StraightFlush) return 10;
  if (h.cat === Cat3.Trips) return 9;
  if (h.cat === Cat3.Straight) return 1;
  return 0;
}

/** Decision 1 (pocket cards + first community card): raise or fold. */
export function raiseFirst(pocket: Card[], first: Card): boolean {
  const pr = pocket.map(rankOf);
  if (pr.some((r) => r >= 10)) return true;
  const three = [...pocket, first];
  for (const p of pocket)
    for (const q of three) {
      if (p === q) continue;
      const a = rankOf(p);
      const b = rankOf(q);
      if (a === b) return true; // any pair
      if (suitOf(p) === suitOf(q)) return true; // two to a flush
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (hi - lo <= 2 || (hi === 14 && lo <= 3)) return true; // two to a straight
    }
  return false;
}

/** Decision 2 (two community cards showing): raise again with a made hand that uses a pocket card. */
export function raiseSecond(pocket: Card[], board: Card[]): boolean {
  const all = [...pocket, ...board];
  const h = best3(all);
  if (h.cat >= Cat3.Pair && h.cards.some((c) => pocket.includes(c))) return h.cat > Cat3.Pair || h.ranks[0] >= 4;
  return false;
}

export interface H3Result {
  player: Hand3 & { cards: Card[] };
  dealer: Hand3 & { cards: Card[] };
  qualifies: boolean;
  cmp: number;
  ret: { ante: number; raise: number; pairSuited: number; straightUp: number };
}

export function settleH3(pocket: Card[], dealer: Card[], board: Card[], bets: { ante: number; pairSuited: number; straightUp: number }, raise: number, folded: boolean): H3Result {
  const ph = best3([...pocket, ...board]);
  const dh = best3([...dealer, ...board]);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, raise: 0, pairSuited: 0, straightUp: 0 };
  if (!folded) {
    if (cmp > 0) {
      ret.raise = raise * 2;
      ret.ante = qualifies ? bets.ante * 2 : bets.ante;
    } else if (cmp === 0) {
      ret.raise = raise;
      ret.ante = bets.ante;
    }
  }
  const ps = pairOrSuited(pocket);
  if (bets.pairSuited > 0 && ps > 0) ret.pairSuited = bets.pairSuited * (1 + ps);
  const su = straightOrUp([...pocket, ...board]);
  if (bets.straightUp > 0 && su > 0) ret.straightUp = bets.straightUp * (1 + su);
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}
