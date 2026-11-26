import { freshDeck, rankOf, suitOf, type Card } from '../../core/cards';
import { cryptoRng, shuffle, type Rng } from '../../core/rng';

/**
 * Dragon Tiger card values and the eight-deck Card Shoe. Cards are the casino's own 0..51 cards;
 * each physical copy in the shoe gets its own id so identical cards from different decks stay
 * distinguishable.
 */

/** Dragon Tiger value: A = 1 … K = 13 (only in this mode; other games keep the Ace high). */
export function dtValue(c: Card): number {
  const r = rankOf(c);
  return r === 14 ? 1 : r;
}

export const isRedCard = (c: Card) => suitOf(c) === 1 || suitOf(c) === 2;

export interface CardInstance {
  /** Unique within the shoe: deck × 52 + card. */
  uid: number;
  card: Card;
  deck: number;
}

let shoeSeq = 0;

export class CardShoe {
  id = '';
  private cards: CardInstance[] = [];
  private pos = 0;
  private drawn = new Set<number>();
  readonly size: number;

  constructor(
    readonly deckCount: number,
    private rng: Rng = cryptoRng,
  ) {
    this.size = deckCount * 52;
    this.shuffle();
  }

  /** Fresh shoe with every card back in, shuffled (only ever called between rounds). */
  shuffle() {
    const all = freshDeck(this.deckCount).map((card, i) => ({ uid: i, card, deck: Math.floor(i / 52) }));
    this.cards = shuffle(all, this.rng);
    this.pos = 0;
    this.drawn.clear();
    this.id = `shoe-${Date.now().toString(36)}-${(++shoeSeq).toString(36)}`;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }

  /** Cards already used (dealt or burned) since the last shuffle. */
  get discarded() {
    return this.pos;
  }

  draw(): CardInstance {
    if (this.pos >= this.cards.length) throw new Error('the shoe is empty');
    const c = this.cards[this.pos++];
    if (this.drawn.has(c.uid)) throw new Error('a card was drawn twice');
    this.drawn.add(c.uid);
    return c;
  }

  /** Testing: puts these cards (in order) on top of the remaining shoe. */
  stackTop(cards: Card[]) {
    for (const [k, card] of cards.entries()) {
      const at = this.cards.findIndex((c, i) => i >= this.pos + k && c.card === card);
      if (at < 0) throw new Error('card not in the shoe');
      const t = this.cards[this.pos + k];
      this.cards[this.pos + k] = this.cards[at];
      this.cards[at] = t;
    }
  }

  /** Copy of the remaining cards' composition (testing / statistics). */
  remainingCards(): CardInstance[] {
    return this.cards.slice(this.pos);
  }
}
