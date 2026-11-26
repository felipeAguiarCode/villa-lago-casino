import { rankOf, suitOf, type Card } from '../../../core/cards';

/**
 * Manilha Rules Engine (Truco Paulista ranking). Pure functions: nothing here changes the shared
 * card model. Ranks use the casino's numbers (11 J, 12 Q, 13 K, 14 A).
 */

/** Weakest to strongest: 4 5 6 7 Q J K A 2 3. */
export const TRUCO_ORDER = [4, 5, 6, 7, 12, 11, 13, 14, 2, 3] as const;

/** Manilha suit strength: ouros (♦) 11, espadas (♠) 12, copas (♥) 13, paus (♣ "zap") 14. */
export const MANILHA_SUIT_STRENGTH: Record<number, number> = { 2: 11, 0: 12, 1: 13, 3: 14 };
export const MANILHA_SUIT_NAME: Record<number, string> = { 2: 'Pica-fumo', 0: 'Espadilha', 1: 'Copeta', 3: 'Zap' };

/** Base strength 1..10 of a common card. */
export function baseStrength(c: Card): number {
  const i = TRUCO_ORDER.indexOf(rankOf(c) as (typeof TRUCO_ORDER)[number]);
  if (i < 0) throw new Error('8, 9 and 10 are not in the Truco deck');
  return i + 1;
}

/** The manilha rank for a Vira: the next rank in the circular order. */
export function manilhaRank(vira: Card): number {
  const i = TRUCO_ORDER.indexOf(rankOf(vira) as (typeof TRUCO_ORDER)[number]);
  return TRUCO_ORDER[(i + 1) % TRUCO_ORDER.length];
}

export const isManilha = (c: Card, manilha: number) => rankOf(c) === manilha;

/** Effective strength: manilhas 11..14 by suit, other cards 1..10 (suit irrelevant). */
export function strength(c: Card, manilha: number): number {
  return isManilha(c, manilha) ? MANILHA_SUIT_STRENGTH[suitOf(c)] : baseStrength(c);
}

/** >0 when a beats b, <0 when it loses, 0 for a tie. */
export const compareCards = (a: Card, b: Card, manilha: number) => Math.sign(strength(a, manilha) - strength(b, manilha));

/** Strengths sorted strongest first. */
export const sortedStrengths = (cards: Card[], manilha: number) => cards.map((c) => strength(c, manilha)).sort((x, y) => y - x);

/** Lexicographic comparison of strengths sorted strongest first (no sums). */
export function compareStrengths(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export interface ThreeCardHand {
  cards: Card[];
  strengths: number[];
  holeUsed: number;
}

/**
 * Best three cards out of two hole cards and three board cards, using at least `minHole` hole
 * cards (board-only hands are not allowed).
 */
export function bestThree(hole: Card[], board: Card[], manilha: number, minHole = 1): ThreeCardHand {
  const pool = [...hole.map((c) => ({ c, hole: true })), ...board.map((c) => ({ c, hole: false }))];
  let best: ThreeCardHand | null = null;
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++)
      for (let d = b + 1; d < pool.length; d++) {
        const pick = [pool[a], pool[b], pool[d]];
        const holeUsed = pick.filter((p) => p.hole).length;
        if (holeUsed < minHole) continue;
        const cards = pick.map((p) => p.c);
        const strengths = sortedStrengths(cards, manilha);
        if (!best || compareStrengths(strengths, best.strengths) > 0) best = { cards, strengths, holeUsed };
      }
  if (!best) throw new Error('no valid three-card hand');
  return best;
}
