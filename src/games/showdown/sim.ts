import { Cat5 } from '../../core/eval5';
import type { Rng } from '../../core/rng';
import type { ShowdownConfig } from './config';
import { ShowdownRound, type BetDecision } from './round';
import { estimateStrength, type PickStrategy, type SeatView } from './strategy';

/** Decides Check / Double / Fold in a betting window from what the player knows. */
export type BetPolicy = (n: 1 | 2, view: SeatView) => BetDecision;

export const alwaysCheck: BetPolicy = () => 'check';
export const alwaysDouble: BetPolicy = () => 'double';

/** Doubles when the estimated strength reaches a threshold; folds below `foldBelow` (if given). */
export function thresholdPolicy(rng: Rng, doubleAt: readonly number[], foldBelow: readonly number[] | null = null, samples = 120): BetPolicy {
  return (n, view) => {
    const s = estimateStrength(view, rng, samples);
    if (foldBelow && s < foldBelow[n - 1]) return 'fold';
    return s >= doubleAt[n - 1] ? 'double' : 'check';
  };
}

export interface SimResult {
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  folds: number;
  doubles: [number, number];
  wagered: number;
  returned: number;
  /** Final hand categories (index = Cat5) for rounds that reached the showdown. */
  playerCats: number[];
  dealerCats: number[];
  /** Player return per chip wagered (1 = break-even). */
  rtp: number;
  /** Player result per round in antes (house edge = -this). */
  perAnte: number;
}

export interface SimOptions {
  rounds: number;
  player: PickStrategy;
  dealer: PickStrategy;
  bet?: BetPolicy;
  rng: Rng;
  ante?: number;
  cfg?: Partial<ShowdownConfig>;
}

/** Plays complete rounds with an unlimited bank and tallies the outcome. */
export function simulate(o: SimOptions): SimResult {
  const bet = o.bet ?? alwaysCheck;
  const ante = o.ante ?? 10;
  const r: SimResult = {
    rounds: o.rounds,
    wins: 0,
    losses: 0,
    pushes: 0,
    folds: 0,
    doubles: [0, 0],
    wagered: 0,
    returned: 0,
    playerCats: new Array(10).fill(0),
    dealerCats: new Array(10).fill(0),
    rtp: 0,
    perAnte: 0,
  };
  const bank = { canAfford: () => true, debit: (n: number) => (r.wagered += n), credit: (n: number) => (r.returned += n) };
  for (let i = 0; i < o.rounds; i++) {
    const round = new ShowdownRound({ bank, dealer: o.dealer, rng: o.rng, cfg: o.cfg });
    round.start(ante);
    while (round.state !== 'ROUND_COMPLETE') {
      const w = round.inWindow;
      if (w) {
        const d = bet(w, round.playerView());
        if (d === 'double' && !round.doubleBlock()) {
          round.double();
          r.doubles[w - 1]++;
        } else if (d === 'fold') round.fold();
        else round.check();
        continue;
      }
      const v = round.playerView();
      round.select(v.available[o.player(v)]);
    }
    if (round.result === 'win') r.wins++;
    else if (round.result === 'lose') r.losses++;
    else if (round.result === 'push') r.pushes++;
    else r.folds++;
    if (round.playerHand && round.dealerHand) {
      r.playerCats[round.playerHand.cat]++;
      r.dealerCats[round.dealerHand.cat]++;
    }
  }
  r.rtp = r.returned / r.wagered;
  r.perAnte = (r.returned - r.wagered) / (o.rounds * ante);
  return r;
}

export const CAT_LABEL: Record<Cat5, string> = {
  [Cat5.High]: 'High card',
  [Cat5.Pair]: 'Pair',
  [Cat5.TwoPair]: 'Two pair',
  [Cat5.Trips]: 'Three of a kind',
  [Cat5.Straight]: 'Straight',
  [Cat5.Flush]: 'Flush',
  [Cat5.FullHouse]: 'Full house',
  [Cat5.Quads]: 'Four of a kind',
  [Cat5.StraightFlush]: 'Straight flush',
  [Cat5.Royal]: 'Royal flush',
};
