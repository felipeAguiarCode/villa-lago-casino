import type { Card } from '../../../core/cards';
import type { Rng } from '../../../core/rng';
import { evaluatePife, type PifeOptions } from './engine';

/**
 * Pife discard policy (the Pife Express dealer, also usable by simulated players). It only looks
 * at its own hand: replacements are drawn in theory from every card it has not seen.
 * Priority: P(all groups) ↑, P(at least one group) ↑, E[deadwood] ↓, fewer discards, original order.
 */
export interface DiscardPlan {
  discard: number[];
  pFull: number;
  pAny: number;
  eDead: number;
}

function* subsets(n: number, k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i < n; i++) {
    acc.push(i);
    yield* subsets(n, k, i + 1, acc);
    acc.pop();
  }
}

/**
 * Best discard set of size 0..maxDiscards. Exact over all replacement combinations unless
 * `samples` limits the combinations looked at (simulations), in which case it samples them.
 */
export function pifeDiscardPlan(hand: Card[], maxDiscards: number, fullGroups: number, o: PifeOptions, rng?: Rng, samples?: number): DiscardPlan {
  const start = evaluatePife(hand, o);
  if (start.groups.length >= fullGroups) return { discard: [], pFull: 1, pAny: 1, eDead: 0 };
  const seen = new Set(hand);
  const unknown: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) unknown.push(c);
  let best: DiscardPlan | null = null;
  const better = (a: DiscardPlan, b: DiscardPlan) => {
    const eps = 1e-12;
    if (Math.abs(a.pFull - b.pFull) > eps) return a.pFull > b.pFull;
    if (Math.abs(a.pAny - b.pAny) > eps) return a.pAny > b.pAny;
    if (Math.abs(a.eDead - b.eDead) > eps) return a.eDead < b.eDead;
    return a.discard.length < b.discard.length;
  };
  for (let k = 0; k <= maxDiscards; k++)
    for (const d of subsets(hand.length, k)) {
      const keep = hand.filter((_, i) => !d.includes(i));
      let full = 0;
      let any = 0;
      let dead = 0;
      let n = 0;
      const tally = (extra: Card[]) => {
        const r = evaluatePife([...keep, ...extra], o);
        if (r.groups.length >= fullGroups) full++;
        if (r.groups.length >= 1) any++;
        dead += r.deadwood;
        n++;
      };
      if (k === 0) tally([]);
      else if (samples && rng) {
        for (let s = 0; s < samples; s++) {
          const pool = [...unknown];
          const pick: Card[] = [];
          for (let j = 0; j < k; j++) pick.push(pool.splice(rng(pool.length), 1)[0]);
          tally(pick);
        }
      } else for (const idx of subsets(unknown.length, k)) tally(idx.map((i) => unknown[i]));
      const plan = { discard: d, pFull: full / n, pAny: any / n, eDead: dead / n };
      // subsets come in increasing order, so the first of equal plans keeps the original order
      if (!best || better(plan, best)) best = plan;
    }
  return best!;
}
