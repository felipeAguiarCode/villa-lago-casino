import { rankOf, suitOf, type Card } from '../../../core/cards';

/**
 * Pife Rules Engine (rummy family): three-card sets and three-card runs, best partition with no
 * card used twice, deadwood of the rest. Pure and deterministic. Not the poker evaluator.
 */
export interface PifeOptions {
  setsEnabled: boolean;
  sequencesEnabled: boolean;
  aceLowEnabled: boolean;
  aceHighEnabled: boolean;
  maxGroups: number;
}

export const PIFE_DEFAULTS: PifeOptions = { setsEnabled: true, sequencesEnabled: true, aceLowEnabled: true, aceHighEnabled: true, maxGroups: 3 };

export interface PifeGroup {
  kind: 'SET' | 'RUN';
  /** Indices into the evaluated hand. */
  cards: number[];
}

export interface PifeResult {
  groups: PifeGroup[];
  /** Indices not in any group. */
  residual: number[];
  deadwood: number;
}

/** Deadwood value: A 1, 2..10 face value, J Q K 10. */
export function deadwoodValue(c: Card): number {
  const r = rankOf(c);
  return r === 14 ? 1 : Math.min(10, r);
}

/** Every valid three-card group (as index triples), sets and runs. */
export function candidateGroups(hand: Card[], o: PifeOptions = PIFE_DEFAULTS): PifeGroup[] {
  const out: PifeGroup[] = [];
  const n = hand.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const t = [hand[a], hand[b], hand[c]];
        if (o.setsEnabled && isSet(t)) out.push({ kind: 'SET', cards: [a, b, c] });
        else if (o.sequencesEnabled && isRun(t, o)) out.push({ kind: 'RUN', cards: [a, b, c] });
      }
  return out;
}

/** Three cards of one value in three different suits. */
export function isSet(t: Card[]): boolean {
  return t.length === 3 && rankOf(t[0]) === rankOf(t[1]) && rankOf(t[1]) === rankOf(t[2]) && new Set(t.map(suitOf)).size === 3;
}

/** Three consecutive cards of one suit; the Ace is low (A-2-3) or high (Q-K-A), never both (no K-A-2). */
export function isRun(t: Card[], o: PifeOptions = PIFE_DEFAULTS): boolean {
  if (t.length !== 3 || new Set(t.map(suitOf)).size !== 1) return false;
  const ranks = t.map(rankOf);
  const fits = (vals: number[]) => {
    const s = [...vals].sort((x, y) => x - y);
    return s[1] === s[0] + 1 && s[2] === s[1] + 1;
  };
  if (o.aceHighEnabled && fits(ranks)) return true;
  if (o.aceLowEnabled && ranks.includes(14) && fits(ranks.map((r) => (r === 14 ? 1 : r)))) return true;
  return false;
}

/**
 * Best partition: most groups first, then least deadwood. All disjoint group choices are searched
 * (overlaps included); ties keep the first in a fixed order of card indices, which never changes
 * the competitive result.
 */
export function evaluatePife(hand: Card[], o: PifeOptions = PIFE_DEFAULTS): PifeResult {
  const groups = candidateGroups(hand, o);
  const total = hand.reduce((s, c) => s + deadwoodValue(c), 0);
  let best: { picks: number[]; count: number; dead: number } = { picks: [], count: 0, dead: total };
  const used = new Array<boolean>(hand.length).fill(false);
  const picks: number[] = [];
  const rec = (from: number, dead: number) => {
    const better = picks.length > best.count || (picks.length === best.count && dead < best.dead);
    if (better) best = { picks: [...picks], count: picks.length, dead };
    if (picks.length >= o.maxGroups) return;
    for (let g = from; g < groups.length; g++) {
      const cs = groups[g].cards;
      if (used[cs[0]] || used[cs[1]] || used[cs[2]]) continue;
      for (const i of cs) used[i] = true;
      picks.push(g);
      rec(g + 1, dead - cs.reduce((s, i) => s + deadwoodValue(hand[i]), 0));
      picks.pop();
      for (const i of cs) used[i] = false;
    }
  };
  rec(0, total);
  const chosen = best.picks.map((g) => groups[g]);
  const inGroup = new Set(chosen.flatMap((g) => g.cards));
  return { groups: chosen, residual: hand.map((_, i) => i).filter((i) => !inGroup.has(i)), deadwood: best.dead };
}

/** >0 when a ranks above b: more groups, then less deadwood. */
export function comparePife(a: PifeResult, b: PifeResult): number {
  if (a.groups.length !== b.groups.length) return Math.sign(a.groups.length - b.groups.length);
  return Math.sign(b.deadwood - a.deadwood);
}
