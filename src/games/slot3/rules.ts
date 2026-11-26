import { rankOf, suitOf, type Card } from '../../core/cards';
import { Cat3, eval3 } from '../../core/eval3';

/**
 * Slot Machine Three Card Poker: three reels each stop on a card (one deck, no repeats) and the
 * three-card poker hand is paid by the table. Pays are "for" one coin (stake included); RTP 98.8 %.
 */
export type SlotKey = 'miniRoyal' | 'straightFlush' | 'trips' | 'straight' | 'flush' | 'pair';

export const SLOT_ROWS: { key: SlotKey; pays: number }[] = [
  { key: 'miniRoyal', pays: 101 },
  { key: 'straightFlush', pays: 41 },
  { key: 'trips', pays: 31 },
  { key: 'straight', pays: 7 },
  { key: 'flush', pays: 5 },
  { key: 'pair', pays: 2 },
];

/** Max-bet bonus: the Mini Royal pays 150 per coin at 5 coins (RTP 99.7 % at max bet). */
export const MINI_ROYAL_MAX = 150;
export const SLOT = { coins: [5, 25, 100] as const, maxCoins: 5 };

export function slotKey(cards: Card[]): SlotKey | null {
  const h = eval3(cards);
  if (h.cat === Cat3.StraightFlush) {
    const r = cards.map(rankOf).sort((a, b) => b - a);
    return r[0] === 14 && r[1] === 13 && r[2] === 12 && suitOf(cards[0]) === suitOf(cards[1]) ? 'miniRoyal' : 'straightFlush';
  }
  if (h.cat === Cat3.Trips) return 'trips';
  if (h.cat === Cat3.Straight) return 'straight';
  if (h.cat === Cat3.Flush) return 'flush';
  if (h.cat === Cat3.Pair) return 'pair';
  return null;
}

/** Coins returned for a spin. */
export function slotPays(cards: Card[], coins: number): number {
  const k = slotKey(cards);
  if (!k) return 0;
  if (k === 'miniRoyal' && coins === SLOT.maxCoins) return MINI_ROYAL_MAX * coins;
  return SLOT_ROWS.find((r) => r.key === k)!.pays * coins;
}
