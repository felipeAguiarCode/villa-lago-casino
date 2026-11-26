import { cryptoRng, shuffle, type Rng } from '../../core/rng';

/**
 * Trump 21 — an original "duel" blackjack: one deck of eleven cards numbered 1–11, the player
 * against the dealer, and trump cards that bend the rules (target, draws, stakes…).
 */

export type Side = 'player' | 'dealer';

export type TrumpId =
  // draw control
  | 'precision'
  | 'feather'
  | 'call2'
  | 'call3'
  | 'call4'
  | 'call5'
  | 'call6'
  | 'call7'
  | 'twin'
  | 'redraw'
  | 'recall'
  // information
  | 'glimpse'
  | 'foresight'
  | 'reshuffle'
  // target
  | 'line17'
  | 'line24'
  | 'line27'
  | 'reset21'
  // attack
  | 'burn'
  | 'switch'
  | 'force'
  | 'freeze'
  | 'shatter'
  | 'pickpocket'
  | 'blindfold'
  // stakes
  | 'guard'
  | 'fortress'
  | 'stakes'
  | 'bounty';

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface TrumpInfo {
  id: TrumpId;
  rarity: Rarity;
  /** Can the dealer receive it? */
  dealer?: boolean;
}

/** Every trump, in codex order. Rarity sets how often it is dealt. */
export const TRUMPS: TrumpInfo[] = [
  { id: 'precision', rarity: 'common', dealer: true },
  { id: 'feather', rarity: 'common' },
  { id: 'call2', rarity: 'common' },
  { id: 'call3', rarity: 'common' },
  { id: 'call4', rarity: 'common', dealer: true },
  { id: 'call5', rarity: 'common', dealer: true },
  { id: 'call6', rarity: 'common' },
  { id: 'call7', rarity: 'common' },
  { id: 'twin', rarity: 'uncommon' },
  { id: 'redraw', rarity: 'uncommon' },
  { id: 'recall', rarity: 'common', dealer: true },
  { id: 'glimpse', rarity: 'common' },
  { id: 'foresight', rarity: 'common' },
  { id: 'reshuffle', rarity: 'common' },
  { id: 'line17', rarity: 'uncommon', dealer: true },
  { id: 'line24', rarity: 'uncommon', dealer: true },
  { id: 'line27', rarity: 'uncommon', dealer: true },
  { id: 'reset21', rarity: 'uncommon', dealer: true },
  { id: 'burn', rarity: 'uncommon', dealer: true },
  { id: 'switch', rarity: 'uncommon' },
  { id: 'force', rarity: 'uncommon', dealer: true },
  { id: 'freeze', rarity: 'uncommon', dealer: true },
  { id: 'shatter', rarity: 'uncommon', dealer: true },
  { id: 'pickpocket', rarity: 'rare' },
  { id: 'blindfold', rarity: 'rare' },
  { id: 'guard', rarity: 'common' },
  { id: 'fortress', rarity: 'rare' },
  { id: 'stakes', rarity: 'rare' },
  { id: 'bounty', rarity: 'rare' },
];

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, uncommon: 5, rare: 2 };
export const rarityOf = (id: TrumpId) => TRUMPS.find((t) => t.id === id)!.rarity;
export const PLAYER_TRUMPS: TrumpId[] = TRUMPS.map((t) => t.id);
export const DEALER_TRUMPS: TrumpId[] = TRUMPS.filter((t) => t.dealer).map((t) => t.id);
export const MAX_TRUMPS = 5;
export const TRUMP_ON_HIT = 0.3;

const CALLS: Partial<Record<TrumpId, number>> = { call2: 2, call3: 3, call4: 4, call5: 5, call6: 6, call7: 7 };
const LINES: Partial<Record<TrumpId, number>> = { line17: 17, line24: 24, line27: 27, reset21: 21 };

export type DuelEvent =
  | { t: 'draw'; side: Side; value: number }
  | { t: 'back'; side: Side; value: number }
  | { t: 'switch'; a: number; b: number }
  | { t: 'target'; n: number }
  | { t: 'trump'; side: Side; id: TrumpId; ok: boolean }
  | { t: 'gain'; side: Side; id: TrumpId }
  | { t: 'lose'; side: Side; id: TrumpId; by: 'shatter' | 'pickpocket' }
  | { t: 'foresee'; value: number }
  | { t: 'shuffle' }
  | { t: 'freeze'; side: Side }
  | { t: 'reveal' }
  | { t: 'stand'; side: Side };

export class Duel {
  deck: number[] = [];
  player: number[] = [];
  dealer: number[] = [];
  target = 21;
  guard = false;
  fortress = false;
  stakes = 1;
  /** Extra winnings multiplier (Bounty: a win pays 2:1). */
  winMult = 1;
  glimpsed = false;
  /** The player knows the top card of the deck (Foresight). */
  knownTop = false;
  /** Frozen side must stand on its next turn. */
  frozen: Record<Side, boolean> = { player: false, dealer: false };
  /** The dealer can't play trumps this round (Blindfold). */
  blinded = false;
  /** Chance (0..1) that the dealer plays a trump when he has a good one. */
  aggression = 0.6;
  stood: Record<Side, boolean> = { player: false, dealer: false };
  trumps: Record<Side, TrumpId[]>;
  private evs: DuelEvent[] = [];

  constructor(
    private rng: Rng = cryptoRng,
    trumps?: Record<Side, TrumpId[]>,
  ) {
    this.trumps = trumps ?? { player: [], dealer: [] };
  }

  private emit(e: DuelEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }

  total(side: Side) {
    return this[side].reduce((a, b) => a + b, 0);
  }

  /** Total the dealer can see of the player's hand (the first card is hidden from him). */
  visiblePlayerTotal() {
    return this.player.slice(1).reduce((a, b) => a + b, 0);
  }

  get over() {
    return this.stood.player && this.stood.dealer;
  }

  /** Value of the top card when the player has seen it with Foresight. */
  get nextCard(): number | null {
    return this.knownTop && this.deck.length ? this.deck[0] : null;
  }

  private give(side: Side, value?: number): number | null {
    let v: number | undefined;
    if (value !== undefined) {
      const i = this.deck.indexOf(value);
      if (i < 0) return null;
      v = this.deck.splice(i, 1)[0];
      if (i === 0) this.knownTop = false;
    } else {
      v = this.deck.shift();
      this.knownTop = false;
    }
    if (v === undefined) return null;
    this[side].push(v);
    this.emit({ t: 'draw', side, value: v });
    return v;
  }

  /** Puts a card back into the deck and reshuffles it. */
  private giveBack(side: Side) {
    const v = this[side].pop()!;
    this.deck.push(v);
    this.deck = shuffle(this.deck, this.rng);
    this.knownTop = false;
    this.emit({ t: 'back', side, value: v });
  }

  private pickTrump(side: Side): TrumpId {
    const pool = TRUMPS.filter((t) => side === 'player' || t.dealer);
    const total = pool.reduce((a, t) => a + RARITY_WEIGHT[t.rarity], 0);
    let r = this.rng(total);
    for (const t of pool) {
      r -= RARITY_WEIGHT[t.rarity];
      if (r < 0) return t.id;
    }
    return pool[0].id;
  }

  private grant(side: Side, chance: number) {
    if (this.trumps[side].length >= MAX_TRUMPS) return;
    if (this.rng(1000) >= chance * 1000) return;
    const id = this.pickTrump(side);
    this.trumps[side].push(id);
    this.emit({ t: 'gain', side, id });
  }

  /** New round: fresh 11-card deck, two cards each (dealer's first face down), one trump each. */
  start(): DuelEvent[] {
    this.deck = shuffle(Array.from({ length: 11 }, (_, i) => i + 1), this.rng);
    this.player = [];
    this.dealer = [];
    this.target = 21;
    this.guard = false;
    this.fortress = false;
    this.stakes = 1;
    this.winMult = 1;
    this.glimpsed = false;
    this.knownTop = false;
    this.frozen = { player: false, dealer: false };
    this.blinded = false;
    this.stood = { player: false, dealer: false };
    this.give('player');
    this.give('dealer');
    this.give('player');
    this.give('dealer');
    this.grant('player', 1);
    this.grant('dealer', 1);
    return this.flush();
  }

  hit(side: Side): DuelEvent[] {
    if (this.frozen[side]) return this.stand(side);
    if (this.give(side) !== null) {
      this.stood = { player: false, dealer: false };
      this.grant(side, TRUMP_ON_HIT);
    } else this.stood[side] = true;
    return this.flush();
  }

  stand(side: Side): DuelEvent[] {
    this.stood[side] = true;
    this.frozen[side] = false;
    this.emit({ t: 'stand', side });
    return this.flush();
  }

  /** Whether a trump would do anything right now. */
  canUse(side: Side, id: TrumpId): boolean {
    const other: Side = side === 'player' ? 'dealer' : 'player';
    const me = this[side];
    const opp = this[other];
    if (CALLS[id] !== undefined) return this.deck.includes(CALLS[id]!);
    if (LINES[id] !== undefined) return this.target !== LINES[id];
    switch (id) {
      case 'precision':
      case 'feather':
        return this.deck.length > 0;
      case 'twin':
        return this.deck.length >= 2;
      case 'redraw':
        return me.length >= 2 && this.deck.length > 0;
      case 'recall':
        return me.length >= 2;
      case 'glimpse':
        return side === 'player' && !this.glimpsed;
      case 'foresight':
        return side === 'player' && !this.knownTop && this.deck.length > 0;
      case 'reshuffle':
        return this.deck.length > 1;
      case 'burn':
        return opp.length >= 2;
      case 'switch':
        return me.length >= 2 && opp.length >= 2;
      case 'force':
        return this.deck.length > 0;
      case 'freeze':
        return !this.frozen[other];
      case 'shatter':
      case 'pickpocket':
        return this.trumps[other].length > 0;
      case 'blindfold':
        return side === 'player' && !this.blinded;
      case 'guard':
        return side === 'player' && !this.guard && !this.fortress;
      case 'fortress':
        return side === 'player' && !this.fortress;
      case 'stakes':
        return side === 'player' && this.stakes === 1;
      case 'bounty':
        return side === 'player' && this.winMult === 1;
      default:
        return false;
    }
  }

  useTrump(side: Side, id: TrumpId): DuelEvent[] {
    const hand = this.trumps[side];
    const i = hand.indexOf(id);
    if (i < 0 || !this.canUse(side, id)) return [];
    hand.splice(i, 1);
    this.emit({ t: 'trump', side, id, ok: true });
    const other: Side = side === 'player' ? 'dealer' : 'player';
    const drew = () => (this.stood = { player: false, dealer: false });
    if (CALLS[id] !== undefined) {
      this.give(side, CALLS[id]);
      drew();
      return this.flush();
    }
    if (LINES[id] !== undefined) {
      this.target = LINES[id]!;
      this.emit({ t: 'target', n: this.target });
      return this.flush();
    }
    switch (id) {
      case 'precision': {
        const room = this.target - this.total(side);
        const fit = this.deck.filter((v) => v <= room);
        this.give(side, fit.length ? Math.max(...fit) : Math.min(...this.deck));
        drew();
        break;
      }
      case 'feather':
        this.give(side, Math.min(...this.deck));
        drew();
        break;
      case 'twin':
        this.give(side);
        this.give(side);
        drew();
        break;
      case 'redraw': {
        // draw first, then return the old card, so the new one is always different
        const old = this[side].length - 1;
        this.give(side);
        const [v] = this[side].splice(old, 1);
        this.deck.push(v);
        this.deck = shuffle(this.deck, this.rng);
        this.knownTop = false;
        this.emit({ t: 'back', side, value: v });
        drew();
        break;
      }
      case 'recall':
        this.giveBack(side);
        drew();
        break;
      case 'glimpse':
        this.glimpsed = true;
        this.emit({ t: 'reveal' });
        break;
      case 'foresight':
        this.knownTop = true;
        this.emit({ t: 'foresee', value: this.deck[0] });
        break;
      case 'reshuffle':
        this.deck = shuffle(this.deck, this.rng);
        this.knownTop = false;
        this.emit({ t: 'shuffle' });
        break;
      case 'burn':
        this.giveBack(other);
        drew();
        break;
      case 'switch': {
        const a = this[side].pop()!;
        const b = this[other].pop()!;
        this[side].push(b);
        this[other].push(a);
        this.emit({ t: 'switch', a, b });
        drew();
        break;
      }
      case 'force':
        this.give(other);
        drew();
        break;
      case 'freeze':
        this.frozen[other] = true;
        this.emit({ t: 'freeze', side: other });
        break;
      case 'shatter': {
        const list = this.trumps[other];
        const [lost] = list.splice(this.rng(list.length), 1);
        this.emit({ t: 'lose', side: other, id: lost, by: 'shatter' });
        break;
      }
      case 'pickpocket': {
        const list = this.trumps[other];
        const [got] = list.splice(this.rng(list.length), 1);
        this.emit({ t: 'lose', side: other, id: got, by: 'pickpocket' });
        if (this.trumps[side].length < MAX_TRUMPS) {
          this.trumps[side].push(got);
          this.emit({ t: 'gain', side, id: got });
        }
        break;
      }
      case 'blindfold':
        this.blinded = true;
        break;
      case 'guard':
        this.guard = true;
        break;
      case 'fortress':
        this.fortress = true;
        break;
      case 'stakes':
        this.stakes = 2;
        break;
      case 'bounty':
        this.winMult = 2;
        break;
    }
    return this.flush();
  }

  /** 1 player wins, -1 dealer wins. Closest to the target wins; over the target busts; ties go to the player. */
  outcome(): 1 | -1 {
    const p = this.total('player');
    const d = this.total('dealer');
    const pb = p > this.target;
    const db = d > this.target;
    if (pb && db) return p <= d ? 1 : -1;
    if (pb) return -1;
    if (db) return 1;
    return p >= d ? 1 : -1;
  }

  /** Amount returned on a stake (stake already includes the Stakes Up raise). */
  payout(stake: number): number {
    const o = this.outcome();
    if (o > 0) return stake * (1 + this.winMult);
    if (this.fortress) return stake;
    return this.guard ? stake / 2 : 0;
  }

  // ---------------------------------------------------------------- dealer AI

  /** Probability that one more unknown card keeps `side` at or under the target (dealer's view). */
  private safeOdds(total: number): number {
    // cards unknown to the dealer: the deck plus the player's hidden first card
    const unknown = [...this.deck, ...(this.player.length ? [this.player[0]] : [])];
    if (!unknown.length) return 0;
    return unknown.filter((v) => total + v <= this.target).length / unknown.length;
  }

  /** Picks the dealer's trump for this turn (or null). */
  private dealerTrump(): TrumpId | null {
    if (this.blinded) return null;
    const d = this.total('dealer');
    const pv = this.visiblePlayerTotal();
    const est = pv + 6;
    const T = this.target;
    const has = (id: TrumpId) => this.trumps.dealer.includes(id) && this.canUse('dealer', id);
    if (d > T && has('recall')) return 'recall';
    if (d > T && d <= 21 && has('reset21')) return 'reset21';
    if (d > T && d <= 24 && has('line24')) return 'line24';
    if (d > T && d <= 27 && has('line27')) return 'line27';
    if (this.trumps.player.length >= 3 && has('shatter')) return 'shatter';
    if (T === 21 && d >= 14 && d <= 17 && est > 17 && has('line17')) return 'line17';
    if (est >= T - 3 && est <= T && has('force')) return 'force';
    if (this.player.length >= 2 && this.player[this.player.length - 1] >= 6 && est >= T - 2 && has('burn')) return 'burn';
    if (est <= T - 7 && has('freeze')) return 'freeze';
    if (d <= T - 4 && has('precision')) return 'precision';
    for (const c of ['call5', 'call4'] as const) {
      const n = CALLS[c]!;
      if (d + n <= T && d + n >= T - 3 && has(c)) return c;
    }
    return null;
  }

  /** The dealer's turn: maybe one trump, then hit or stand. */
  dealerTurn(): DuelEvent[] {
    const out: DuelEvent[] = [];
    if (this.frozen.dealer) {
      out.push(...this.stand('dealer'));
      return out;
    }
    const trump = this.dealerTrump();
    if (trump && this.rng(1000) < this.aggression * 1000) out.push(...this.useTrump('dealer', trump));
    const now = this.total('dealer');
    const estPlayer = this.visiblePlayerTotal() + 6;
    const odds = this.safeOdds(now);
    const behind = now < Math.min(this.target, estPlayer);
    const hit = this.deck.length > 0 && now < this.target && (now <= this.target - 6 || (behind && odds >= 0.45) || odds >= 0.75);
    out.push(...(hit ? this.hit('dealer') : this.stand('dealer')));
    return out;
  }

  /** Hint for the player: hit when the odds of staying safe are good (exact when the next card is known). */
  advice(): 'hit' | 'stand' {
    const p = this.total('player');
    if (p >= this.target || !this.deck.length || this.frozen.player) return 'stand';
    const next = this.nextCard;
    if (next !== null) return p + next <= this.target ? 'hit' : 'stand';
    const unknown = [...this.deck, ...(this.glimpsed ? [] : [this.dealer[0]])];
    const safe = unknown.filter((v) => p + v <= this.target).length / unknown.length;
    return safe >= 0.5 ? 'hit' : 'stand';
  }
}
