import { freshDeck, type Card } from '../../core/cards';
import type { Hand5 } from '../../core/eval5';
import { cryptoRng, shuffle, type Rng } from '../../core/rng';
import {
  applyAction,
  bettingExhausted,
  BettingError,
  legalActions,
  matchedPot,
  newBetState,
  newStreet,
  remaining,
  STREETS,
  toCall,
  totalPot,
  type Action,
  type Actor,
  type ActionType,
  type BetState,
  type Legal,
  type Street,
} from './betting';
import { ABYSS, type AbyssConfig, type ProfileId } from './config';
import { decide, pickProfile, type DealerView, type PublicAction } from './dealerAI';
import { bestHand } from './evaluator';
import { skillPrice } from './pricing';
import { effectApplicable, limitsFrom, resolveInfo, skillDef, SKILLS, type SkillId, type SkillInfo } from './skills';
import { credited, settle, type Outcome, type Settlement } from './settlement';

/**
 * Abyss Poker hand: heads-up Texas Hold'em against the dealer with an Ante, four betting streets
 * and skills bought with chips. Explicit state machine; money moves through the casino wallet.
 */
export type AbState =
  | 'BETTING'
  | 'DEALING'
  | 'PRE_FLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'PLAYER_ACTION'
  | 'DEALER_ACTION'
  | 'SKILL_PURCHASE'
  | 'SKILL_RESOLUTION'
  | 'ALL_IN_RUNOUT'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'ROUND_COMPLETE';

/** Events for the presentation layer. Dealer hole cards only appear in `reveal` or a Reveal Card result. */
export type AbEvent =
  | { t: 'state'; state: AbState }
  | { t: 'profile'; profile: ProfileId }
  | { t: 'deal'; who: 'player'; index: number; card: Card }
  | { t: 'deal'; who: 'dealer'; index: number }
  | { t: 'street'; street: Street; cards: Card[] }
  | { t: 'action'; who: Actor; type: ActionType; added: number; contrib: { player: number; dealer: number } }
  | { t: 'streetEnd'; street: Street }
  | { t: 'skill'; id: SkillId; price: number; info: SkillInfo | null }
  | { t: 'expire'; ids: SkillId[] }
  | { t: 'reveal'; cards: Card[] }
  | { t: 'showdown'; player: Hand5; dealer: Hand5 }
  | { t: 'settle'; settlement: Settlement };

export type AbErrorCode = 'state' | 'ante' | 'funds' | 'action' | 'skill' | 'deck';

export class AbyssError extends Error {
  constructor(
    readonly code: AbErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

/** The casino wallet. */
export interface Bank {
  readonly balance: number;
  canAfford(n: number): boolean;
  debit(n: number): void;
  credit(n: number): void;
}

export interface RoundOptions {
  bank: Bank;
  rng?: Rng;
  /** Random source of the dealer's decisions (kept apart from the deck). */
  aiRng?: Rng;
  profile?: ProfileId;
  cfg?: Partial<AbyssConfig>;
  /** Cards dealt first, in order (tests). */
  stack?: Card[];
  /** Replaces the dealer policy (tests, simulations). */
  dealer?: (v: DealerView) => Action;
}

export interface SkillOffer {
  id: SkillId;
  price: number;
  /** '' when it can be bought now, otherwise the reason. */
  block: '' | 'state' | 'used' | 'street' | 'useless' | 'funds' | 'budget' | 'call';
}

let seq = 0;

export class AbyssRound {
  readonly id: string;
  readonly cfg: AbyssConfig;
  state: AbState = 'BETTING';
  readonly history: AbState[] = ['BETTING'];
  street: Street = 'PRE_FLOP';
  ante = 0;
  /** Most the player may spend this hand on bets and skills together. */
  budget = 0;
  profile: ProfileId = 'balanced';
  readonly community: Card[] = [];
  readonly actions: PublicAction[] = [];
  readonly purchased: { id: SkillId; price: number; street: Street }[] = [];
  readonly revealed: SkillInfo[] = [];
  /** Control skills active on the current street. */
  active: SkillId[] = [];
  skillCosts = 0;
  settlement: Settlement | null = null;

  private bet!: BetState;
  private deck: Card[] = [];
  private pos = 0;
  private playerHole: Card[] = [];
  private dealerHole: Card[] = [];
  private dealerActed = false;
  private evs: AbEvent[] = [];
  private readonly bank: Bank;
  private readonly rng: Rng;
  private readonly aiRng: Rng;
  private readonly dealerPolicy: (v: DealerView) => Action;

  constructor(private o: RoundOptions) {
    this.bank = o.bank;
    this.rng = o.rng ?? cryptoRng;
    this.aiRng = o.aiRng ?? cryptoRng;
    this.cfg = { ...ABYSS, ...o.cfg };
    this.dealerPolicy = o.dealer ?? ((v) => decide(v, this.aiRng));
    this.id = `ab-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  }

  // ---------------------------------------------------------------- read-only state
  get playerCards(): readonly Card[] {
    return this.playerHole;
  }
  /** The dealer's hole cards, only after the showdown. */
  get dealerCards(): readonly Card[] | null {
    return this.history.includes('SHOWDOWN') ? this.dealerHole : null;
  }
  get contrib() {
    return { ...this.bet.contrib };
  }
  get matchedPot() {
    return matchedPot(this.bet);
  }
  get totalPot() {
    return totalPot(this.bet);
  }
  /** Most the player can still bet (budget minus skills minus chips already in). */
  get playerRemaining() {
    return remaining(this.bet, 'player');
  }
  get playerLimit() {
    return this.bet.limit;
  }
  get toCall() {
    return toCall(this.bet, 'player');
  }
  get raisesLeft() {
    return this.bet.raisesLeft;
  }
  get lastRaise() {
    return this.bet.lastRaise;
  }
  get actor(): Actor | null {
    return this.state === 'PLAYER_ACTION' ? 'player' : this.state === 'DEALER_ACTION' ? 'dealer' : null;
  }
  get skillsThisStreet() {
    return this.purchased.filter((p) => p.street === this.street).length;
  }

  legal(): Legal {
    if (this.state !== 'PLAYER_ACTION') return legalActions({ ...this.bet, toAct: 'dealer' }, 'player');
    return legalActions(this.bet, 'player');
  }

  // ---------------------------------------------------------------- start
  start(ante: number): AbEvent[] {
    this.expect('BETTING');
    const c = this.cfg;
    if (!Number.isInteger(ante) || ante < c.minAnte || ante > c.maxAnte) throw new AbyssError('ante', `ante must be ${c.minAnte}..${c.maxAnte}`);
    if (!this.bank.canAfford(ante)) throw new AbyssError('funds', 'insufficient balance for the ante');
    this.budget = Math.min(c.budgetMult * ante, Math.floor(this.bank.balance));
    this.bank.debit(ante);
    this.ante = ante;
    this.bet = newBetState(ante, this.budget, c);
    this.to('DEALING');
    // the dealer's behaviour is chosen before any card is dealt, from its own random source
    this.profile = this.o.profile ?? pickProfile(this.aiRng, c.profileWeights);
    this.emit({ t: 'profile', profile: this.profile });
    this.deck = this.buildDeck();
    this.pos = 0;
    for (let i = 0; i < 2; i++) {
      const pc = this.draw();
      this.playerHole.push(pc);
      this.emit({ t: 'deal', who: 'player', index: i, card: pc });
      this.dealerHole.push(this.draw());
      this.emit({ t: 'deal', who: 'dealer', index: i });
    }
    this.street = 'PRE_FLOP';
    this.to('PRE_FLOP');
    newStreet(this.bet, 'player', c);
    this.dealerActed = false;
    this.to('PLAYER_ACTION');
    return this.flush();
  }

  // ---------------------------------------------------------------- player betting
  act(action: Action): AbEvent[] {
    this.expect('PLAYER_ACTION');
    this.applyBet('player', action);
    this.run();
    return this.flush();
  }

  // ---------------------------------------------------------------- skills
  offers(): SkillOffer[] {
    return SKILLS.map((d) => ({ id: d.id, price: this.priceOf(d.id), block: this.skillBlock(d.id) }));
  }

  priceOf(id: SkillId) {
    return skillPrice(skillDef(id).tier, this.matchedPot, this.ante, this.cfg);
  }

  skillBlock(id: SkillId): SkillOffer['block'] {
    if (this.state !== 'PLAYER_ACTION') return 'state';
    if (!this.cfg.reuseSkills && this.purchased.some((p) => p.id === id)) return 'used';
    if (this.skillsThisStreet >= this.cfg.skillsPerStreet) return 'used';
    const fx = effectApplicable(id, this.bet, this.street, this.dealerActed);
    if (fx) return fx;
    const price = this.priceOf(id);
    if (!this.bank.canAfford(price)) return 'funds';
    const limitAfter = this.bet.limit - price;
    // the dealer's chips already in must stay callable, and a betting unit must remain
    if (limitAfter < this.bet.contrib.dealer) return 'call';
    if (limitAfter - this.bet.contrib.player < Math.max(this.toCall, this.cfg.chipUnit)) return 'budget';
    return '';
  }

  /** Buys and resolves a skill. Nothing is charged unless every check passes. */
  buySkill(id: SkillId): AbEvent[] {
    this.expect('PLAYER_ACTION');
    const block = this.skillBlock(id);
    if (block) throw new AbyssError('skill', `cannot buy ${id}: ${block}`);
    const price = this.priceOf(id);
    this.to('SKILL_PURCHASE');
    try {
      this.bank.debit(price);
    } catch (e) {
      this.to('PLAYER_ACTION');
      throw new AbyssError('funds', String(e));
    }
    this.skillCosts += price;
    this.bet.limit -= price;
    this.purchased.push({ id, price, street: this.street });
    this.to('SKILL_RESOLUTION');
    const def = skillDef(id);
    let info: SkillInfo | null = null;
    if (def.kind === 'info') {
      info = resolveInfo(id, {
        dealerHole: this.dealerHole,
        community: this.community,
        street: this.street,
        hidden: [0, 1].filter((i) => !this.revealed.some((r) => r.id === 'revealCard' && r.index === i)),
        nextCommunity: this.nextCommunityCard(),
        rng: this.rng,
      });
      if (info) this.revealed.push(info);
    } else this.active.push(id);
    this.emit({ t: 'skill', id, price, info });
    this.to('PLAYER_ACTION');
    return this.flush();
  }

  /** The next community card in deck order, after the burn (Peek). */
  private nextCommunityCard(): Card | null {
    if (this.street === 'RIVER') return null;
    const i = this.pos + (this.cfg.burnCards ? 1 : 0);
    return this.deck[i] ?? null;
  }

  // ---------------------------------------------------------------- flow
  private applyBet(who: Actor, action: Action) {
    let r;
    try {
      if (who === 'player') {
        // dry run first: a wager the wallet can't cover changes nothing
        const probe = { ...this.bet, contrib: { ...this.bet.contrib }, acted: { ...this.bet.acted } };
        const need = applyAction(probe, who, action).added;
        if (need > 0 && !this.bank.canAfford(need)) throw new AbyssError('funds', 'insufficient balance');
      }
      r = applyAction(this.bet, who, action);
    } catch (e) {
      if (e instanceof BettingError) throw new AbyssError('action', e.message);
      throw e;
    }
    if (who === 'player' && r.added > 0) this.bank.debit(r.added);
    if (who === 'dealer') this.dealerActed = true;
    this.actions.push({ who, type: r.as, added: r.added, street: this.street });
    this.emit({ t: 'action', who, type: r.as, added: r.added, contrib: { ...this.bet.contrib } });
    if (this.bet.folded) return this.finish(who === 'player' ? 'playerFold' : 'dealerFold');
    if (r.streetClosed) this.closeStreet();
    else this.to(this.bet.toAct === 'player' ? 'PLAYER_ACTION' : 'DEALER_ACTION');
  }

  /** Lets the dealer act until it's the player's turn or the hand is over. */
  private run() {
    while (this.state === 'DEALER_ACTION') {
      const view = this.dealerView();
      let act = this.dealerPolicy(view);
      // skill restrictions are rules, enforced even if a policy forgets them
      const lim = view.limits;
      if ((act.type === 'raise' && lim.noRaise) || ((act.type === 'bet' || act.type === 'allin' || act.type === 'double') && lim.noBet && view.toCall === 0)) act = view.toCall > 0 ? { type: 'call' } : { type: 'check' };
      if (act.type === 'fold' && lim.noFold) act = view.toCall > 0 ? { type: 'call' } : { type: 'check' };
      this.applyBet('dealer', act);
    }
  }

  private dealerView(): DealerView {
    return Object.freeze({
      hole: Object.freeze([...this.dealerHole]),
      community: Object.freeze([...this.community]),
      street: this.street,
      toCall: toCall(this.bet, 'dealer'),
      matchedPot: this.matchedPot,
      totalPot: this.totalPot,
      ante: this.ante,
      legal: legalActions(this.bet, 'dealer'),
      limits: limitsFrom(this.active, this.cfg.pressureModifier),
      history: Object.freeze([...this.actions]),
      profile: this.profile,
    });
  }

  private closeStreet() {
    this.emit({ t: 'streetEnd', street: this.street });
    if (this.active.length) {
      this.emit({ t: 'expire', ids: [...this.active] });
      this.active = [];
    }
    if (this.street === 'RIVER') return this.showdown();
    if (bettingExhausted(this.bet)) {
      this.to('ALL_IN_RUNOUT');
      while ((this.street as Street) !== 'RIVER') this.dealStreet();
      return this.showdown();
    }
    this.dealStreet();
    newStreet(this.bet, 'dealer', this.cfg);
    this.dealerActed = false;
    this.to('DEALER_ACTION');
  }

  private dealStreet() {
    const next = STREETS[STREETS.indexOf(this.street) + 1];
    if (this.cfg.burnCards) this.draw();
    const n = next === 'FLOP' ? 3 : 1;
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) cards.push(this.draw());
    this.community.push(...cards);
    this.street = next;
    this.to(next);
    this.emit({ t: 'street', street: next, cards });
  }

  private showdown() {
    this.to('SHOWDOWN');
    this.emit({ t: 'reveal', cards: [...this.dealerHole] });
    const ph = bestHand([...this.playerHole, ...this.community]);
    const dh = bestHand([...this.dealerHole, ...this.community]);
    this.emit({ t: 'showdown', player: ph, dealer: dh });
    this.finish(ph.score > dh.score ? 'win' : ph.score < dh.score ? 'lose' : 'tie');
  }

  /** The only place chips come back. Runs once per hand. */
  private finish(outcome: Outcome) {
    if (this.settlement) throw new AbyssError('state', 'already settled');
    this.to('SETTLEMENT');
    const s = settle(this.bet.contrib, outcome, this.skillCosts, this.cfg.rake);
    this.settlement = s;
    const back = credited(s);
    if (back > 0) this.bank.credit(back);
    this.emit({ t: 'settle', settlement: s });
    this.to('ROUND_COMPLETE');
  }

  // ---------------------------------------------------------------- helpers
  private buildDeck(): Card[] {
    const st = this.o.stack ?? [];
    if (new Set(st).size !== st.length || st.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) throw new AbyssError('deck', 'stacked cards must be unique cards 0..51');
    return [...st, ...shuffle(freshDeck(1).filter((c) => !st.includes(c)), this.rng)];
  }

  private draw(): Card {
    if (this.pos >= this.deck.length) throw new AbyssError('deck', 'deck exhausted');
    return this.deck[this.pos++];
  }

  private expect(s: AbState) {
    if (this.state !== s) throw new AbyssError('state', `expected ${s}, hand is ${this.state}`);
  }

  private to(s: AbState) {
    this.state = s;
    this.history.push(s);
    this.emit({ t: 'state', state: s });
  }

  private emit(e: AbEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }
}
