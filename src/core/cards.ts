import { cryptoRng, shuffle, type Rng } from './rng';

/**
 * A card is an integer 0..51: suit = floor(c / 13) (0 ♠, 1 ♥, 2 ♦, 3 ♣),
 * rank = c % 13 + 2 (2..14, where 11 J, 12 Q, 13 K, 14 A).
 */
export type Card = number;

export const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_LETTER = ['s', 'h', 'd', 'c'] as const;
export const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANK_CHARS = '23456789TJQKA';

export const suitOf = (c: Card) => (c / 13) | 0;
/** Two jokers live after the 52 regular cards (Double Draw Poker). */
export const JOKERS: Card[] = [52, 53];
export const isJoker = (c: Card) => c === 52 || c === 53;
export const rankOf = (c: Card) => (c % 13) + 2;
export const isRed = (c: Card) => {
  const s = suitOf(c);
  return s === 1 || s === 2;
};
export const makeCard = (rank: number, suit: number): Card => suit * 13 + (rank - 2);

export function rankLabel(rank: number): string {
  if (rank <= 10) return String(rank);
  return ['J', 'Q', 'K', 'A'][rank - 11];
}

export const cardLabel = (c: Card) => (isJoker(c) ? 'JKR' : rankLabel(rankOf(c)) + SUIT_SYMBOL[suitOf(c)]);

/** Parses short codes like "As", "Td", "10h", "7c". */
export function parseCard(code: string): Card {
  const s = code.trim();
  const suitCh = s[s.length - 1].toLowerCase();
  const rankStr = s.slice(0, -1).toUpperCase();
  const suit = SUIT_LETTER.indexOf(suitCh as (typeof SUIT_LETTER)[number]);
  const rank = rankStr === '10' ? 10 : RANK_CHARS.indexOf(rankStr) + 2;
  if (suit < 0 || rank < 2 || rank > 14) throw new Error('bad card ' + code);
  return makeCard(rank, suit);
}

export const parseCards = (codes: string) => codes.split(/\s+/).filter(Boolean).map(parseCard);

export function freshDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) out.push(c);
  return out;
}

/** Multi-deck shoe with a cut card. */
export class Shoe {
  private cards: Card[] = [];
  private pos = 0;
  private cut = 0;
  /** Cards queued to be dealt first (testing / scripted demos). */
  stack: Card[] = [];

  constructor(
    readonly decks: number,
    readonly penetration = 0.75,
    private rng: Rng = cryptoRng,
    /** Extra cards added to the deck (jokers). */
    private extra: Card[] = [],
  ) {
    this.shuffle();
  }

  shuffle() {
    this.cards = shuffle([...freshDeck(this.decks), ...this.extra], this.rng);
    this.pos = 0;
    const n = this.cards.length;
    // cut card lands within ±4% of the nominal penetration
    this.cut = Math.floor(n * (this.penetration - 0.04 + this.rng(81) / 1000));
  }

  /** True once the cut card has come out: reshuffle before the next round. */
  get needsShuffle() {
    return this.pos >= this.cut;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }

  get total() {
    return this.cards.length;
  }

  draw(): Card {
    if (this.stack.length) return this.stack.shift()!;
    if (this.pos >= this.cards.length) this.shuffle();
    return this.cards[this.pos++];
  }
}
