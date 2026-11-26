import { freshDeck, rankOf, type Card } from '../../../core/cards';
import { cryptoRng, shuffle, type Rng } from '../../../core/rng';

/**
 * Round decks of the Brazilian card games, built from the casino's own cards. Every physical card
 * has a uid (its index in the unshuffled composition), so two copies of the same card from
 * different decks stay distinct. The shuffled order is kept for the whole round and can be saved.
 */
export type DeckType = 'TRUCO_40' | 'STANDARD_52';

/** Composition in uid order. TRUCO_40 drops every 8, 9 and 10 (no jokers in either). */
export function deckCards(type: DeckType, decks: number): Card[] {
  const all = freshDeck(decks);
  return type === 'TRUCO_40' ? all.filter((c) => rankOf(c) < 8 || rankOf(c) > 10) : all;
}

export interface DeckState {
  type: DeckType;
  decks: number;
  /** Shuffled uids. */
  order: number[];
  /** Next uid to deal is order[pos]. */
  pos: number;
}

export class RoundDeck {
  readonly cards: Card[];
  private order: number[];
  private pos: number;

  private constructor(
    readonly type: DeckType,
    readonly decks: number,
    order: number[],
    pos: number,
  ) {
    this.cards = deckCards(type, decks);
    this.order = order;
    this.pos = pos;
  }

  /** A whole deck shuffled for one round. */
  static shuffled(type: DeckType, decks: number, rng: Rng = cryptoRng): RoundDeck {
    const n = deckCards(type, decks).length;
    return new RoundDeck(type, decks, shuffle(Array.from({ length: n }, (_, i) => i), rng), 0);
  }

  /** Testing: these cards (by value) come first, the rest shuffled behind. */
  static stacked(type: DeckType, decks: number, first: Card[], rng: Rng = cryptoRng): RoundDeck {
    const cards = deckCards(type, decks);
    const taken = new Set<number>();
    const head = first.map((c) => {
      const uid = cards.findIndex((x, i) => x === c && !taken.has(i));
      if (uid < 0) throw new Error(`card ${c} is not in a ${type} deck`);
      taken.add(uid);
      return uid;
    });
    const rest = shuffle(
      cards.map((_, i) => i).filter((i) => !taken.has(i)),
      rng,
    );
    return new RoundDeck(type, decks, [...head, ...rest], 0);
  }

  /** Rebuilds a saved deck; throws when the saved order is not a full permutation. */
  static restore(s: DeckState): RoundDeck {
    const n = deckCards(s.type, s.decks).length;
    const ok = Array.isArray(s.order) && s.order.length === n && new Set(s.order).size === n && s.order.every((u) => Number.isInteger(u) && u >= 0 && u < n) && Number.isInteger(s.pos) && s.pos >= 0 && s.pos <= n;
    if (!ok) throw new Error('saved deck is corrupted');
    return new RoundDeck(s.type, s.decks, [...s.order], s.pos);
  }

  get size() {
    return this.order.length;
  }

  get remaining() {
    return this.order.length - this.pos;
  }

  /** Uids already dealt, in order. */
  get dealt(): number[] {
    return this.order.slice(0, this.pos);
  }

  draw(): number {
    if (this.pos >= this.order.length) throw new Error('the deck is empty');
    return this.order[this.pos++];
  }

  cardOf(uid: number): Card {
    return this.cards[uid];
  }

  state(): DeckState {
    return { type: this.type, decks: this.decks, order: [...this.order], pos: this.pos };
  }
}
