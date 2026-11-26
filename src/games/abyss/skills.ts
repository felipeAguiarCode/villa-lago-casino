import { rankOf, suitOf, type Card } from '../../core/cards';
import type { Cat5 } from '../../core/eval5';
import type { Rng } from '../../core/rng';
import { legalActions, toCall, type BetState, type Street } from './betting';
import type { SkillTier } from './config';
import { categoryOf } from './evaluator';

/**
 * Skill catalogue and Skill Effect Engine. Skills are bought with chips (see pricing.ts); there are
 * no skill points of any kind. Information skills resolve at once and are recorded; control
 * skills stay active until the end of the street they were bought on.
 */
export type SkillId =
  | 'sharpEye'
  | 'suitReader'
  | 'highCardReader'
  | 'connectionReader'
  | 'pressure'
  | 'lockRaise'
  | 'handReader'
  | 'blockBet'
  | 'revealCard'
  | 'peek'
  | 'makeEmChase';

export type SkillCategory = 'Observation' | 'Manipulation' | 'Intelligence' | 'Dominance';

export interface SkillDef {
  id: SkillId;
  category: SkillCategory;
  tier: SkillTier;
  streets: Street[];
  kind: 'info' | 'control';
  /** 'instant' information or a 'street' long restriction on the dealer. */
  duration: 'instant' | 'street';
}

const ALL: Street[] = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'];
const POSTFLOP: Street[] = ['FLOP', 'TURN', 'RIVER'];

export const SKILLS: SkillDef[] = [
  { id: 'sharpEye', category: 'Observation', tier: 1, streets: ALL, kind: 'info', duration: 'instant' },
  { id: 'suitReader', category: 'Observation', tier: 1, streets: ALL, kind: 'info', duration: 'instant' },
  { id: 'highCardReader', category: 'Observation', tier: 1, streets: ALL, kind: 'info', duration: 'instant' },
  { id: 'connectionReader', category: 'Observation', tier: 1, streets: ALL, kind: 'info', duration: 'instant' },
  { id: 'pressure', category: 'Manipulation', tier: 2, streets: ALL, kind: 'control', duration: 'street' },
  { id: 'lockRaise', category: 'Manipulation', tier: 2, streets: ALL, kind: 'control', duration: 'street' },
  { id: 'handReader', category: 'Intelligence', tier: 3, streets: POSTFLOP, kind: 'info', duration: 'instant' },
  { id: 'blockBet', category: 'Intelligence', tier: 3, streets: ALL, kind: 'control', duration: 'street' },
  { id: 'revealCard', category: 'Dominance', tier: 4, streets: ALL, kind: 'info', duration: 'instant' },
  { id: 'peek', category: 'Dominance', tier: 4, streets: ['PRE_FLOP', 'FLOP', 'TURN'], kind: 'info', duration: 'instant' },
  { id: 'makeEmChase', category: 'Dominance', tier: 4, streets: ALL, kind: 'control', duration: 'street' },
];

export const skillDef = (id: SkillId) => SKILLS.find((s) => s.id === id)!;

/** What a bought information skill discovered (true at the moment of purchase). */
export type SkillInfo =
  | { id: 'sharpEye'; pair: boolean }
  | { id: 'suitReader'; suited: boolean }
  | { id: 'highCardReader'; high: boolean }
  | { id: 'connectionReader'; connected: boolean }
  | { id: 'handReader'; category: Cat5; street: Street }
  | { id: 'revealCard'; card: Card; index: number }
  | { id: 'peek'; card: Card; street: Street };

/** Restrictions on the dealer from the control skills active this street. */
export interface DealerLimits {
  noRaise: boolean;
  noBet: boolean;
  noFold: boolean;
  /** Added to the fold probability when facing a bet. */
  foldBoost: number;
}

export const NO_LIMITS: DealerLimits = { noRaise: false, noBet: false, noFold: false, foldBoost: 0 };

export function limitsFrom(active: SkillId[], pressure: number): DealerLimits {
  return {
    noRaise: active.includes('lockRaise'),
    noBet: active.includes('blockBet'),
    noFold: active.includes('makeEmChase'),
    foldBoost: active.includes('pressure') ? pressure : 0,
  };
}

export const isHighRank = (r: number) => r >= 11;
/** Consecutive ranks, A-K and A-2 included. */
export function connected(a: Card, b: Card) {
  const x = rankOf(a);
  const y = rankOf(b);
  const d = Math.abs(x - y);
  return d === 1 || (Math.min(x, y) === 2 && Math.max(x, y) === 14);
}

/**
 * Whether a skill's effect can still apply now (beyond the general purchase rules).
 * '' = applicable, otherwise a short reason code.
 */
export function effectApplicable(id: SkillId, s: BetState, street: Street, dealerActedThisStreet: boolean): '' | 'street' | 'useless' {
  const def = skillDef(id);
  if (!def.streets.includes(street)) return 'street';
  const L = legalActions(s, 'player');
  const facing = toCall(s, 'player') > 0;
  const canPush = facing ? !!L.raise : !!L.bet;
  switch (id) {
    case 'pressure':
    case 'makeEmChase':
      // the dealer will only face a decision if the player can still bet or raise this street
      return canPush ? '' : 'useless';
    case 'lockRaise':
      // the dealer can only raise in answer to a bet the player hasn't made yet
      return !facing && s.raisesLeft > 0 && !!L.bet ? '' : 'useless';
    case 'blockBet':
      // only while the dealer still has to act on a street with no bet
      return !facing && !s.betMade && !dealerActedThisStreet ? '' : 'useless';
    default:
      return '';
  }
}

/** Resolves an information skill from the real cards. */
export function resolveInfo(id: SkillId, ctx: { dealerHole: Card[]; community: Card[]; street: Street; hidden: number[]; nextCommunity: Card | null; rng: Rng }): SkillInfo | null {
  const [a, b] = ctx.dealerHole;
  switch (id) {
    case 'sharpEye':
      return { id, pair: rankOf(a) === rankOf(b) };
    case 'suitReader':
      return { id, suited: suitOf(a) === suitOf(b) };
    case 'highCardReader':
      return { id, high: isHighRank(rankOf(a)) || isHighRank(rankOf(b)) };
    case 'connectionReader':
      return { id, connected: connected(a, b) };
    case 'handReader':
      return { id, category: categoryOf([...ctx.dealerHole, ...ctx.community]), street: ctx.street };
    case 'revealCard': {
      const index = ctx.hidden[ctx.rng(ctx.hidden.length)];
      return { id, card: ctx.dealerHole[index], index };
    }
    case 'peek':
      return ctx.nextCommunity === null ? null : { id, card: ctx.nextCommunity, street: ctx.street };
    default:
      return null;
  }
}
