/**
 * Dragon Tiger ruleset. Every payout, limit and switch of the mode lives here.
 * Payouts are net multipliers ("1" = 1:1) with at most two decimals, so a bet of whole chips
 * always returns a whole number of cents.
 */
export const MODE_ID = 'DRAGON_TIGER';

export const MAIN_BETS = ['DRAGON', 'TIGER', 'TIE', 'SUITED_TIE'] as const;
export const SIDE_KINDS = ['BIG', 'SMALL', 'ODD', 'EVEN', 'RED', 'BLACK'] as const;
export const SIDES = ['DRAGON', 'TIGER'] as const;

export type MainBet = (typeof MAIN_BETS)[number];
export type SideKind = (typeof SIDE_KINDS)[number];
export type Side = (typeof SIDES)[number];
export type SideBet = `${Side}_${SideKind}`;
export type BetId = MainBet | SideBet;

export const SIDE_BETS: SideBet[] = SIDES.flatMap((s) => SIDE_KINDS.map((k) => `${s}_${k}` as SideBet));
export const ALL_BETS: BetId[] = [...MAIN_BETS, ...SIDE_BETS];

export const isMainBet = (id: BetId): id is MainBet => (MAIN_BETS as readonly string[]).includes(id);

export interface Limit {
  min: number;
  max: number;
}

export interface DragonTigerRuleset {
  deckCount: number;
  cardsPerDeck: number;
  aceHigh: boolean;
  jokersEnabled: boolean;
  burnCardEnabled: boolean;
  /** Share of a Dragon or Tiger bet returned on any tie (0.5 = 50%). */
  tieRefundPercentage: number;
  dragonPayout: number;
  tigerPayout: number;
  tiePayout: number;
  suitedTiePayout: number;
  bigPayout: number;
  smallPayout: number;
  oddPayout: number;
  evenPayout: number;
  redPayout: number;
  blackPayout: number;
  excludedBigSmallRank: number;
  excludedOddRank: number;
  sideBetsEnabled: boolean;
  /** Most chips that may be placed on side bets in one round (null = no limit). */
  sideBetRoundLimit: number | null;
  multipleBetsEnabled: boolean;
  mainBetRequired: boolean;
  /** Reshuffle between rounds once fewer cards than this remain. */
  reshuffleAt: number;
  /** Bet limits (table limits of the casino: 5 is the smallest chip). */
  limits: { main: Limit; tie: Limit; suitedTie: Limit; side: Limit };
  /** Each bet type can be switched off. */
  enabled: Record<BetId, boolean>;
}

export const DT_RULESET: DragonTigerRuleset = {
  deckCount: 8,
  cardsPerDeck: 52,
  aceHigh: false,
  jokersEnabled: false,
  burnCardEnabled: true,
  tieRefundPercentage: 0.5,
  dragonPayout: 1,
  tigerPayout: 1,
  tiePayout: 11,
  suitedTiePayout: 50,
  bigPayout: 1,
  smallPayout: 1,
  oddPayout: 1,
  evenPayout: 1,
  redPayout: 0.9,
  blackPayout: 0.9,
  excludedBigSmallRank: 7,
  excludedOddRank: 7,
  sideBetsEnabled: true,
  sideBetRoundLimit: null,
  multipleBetsEnabled: true,
  mainBetRequired: false,
  reshuffleAt: 52,
  limits: {
    main: { min: 5, max: 1000 },
    tie: { min: 5, max: 200 },
    suitedTie: { min: 5, max: 100 },
    side: { min: 5, max: 500 },
  },
  enabled: Object.fromEntries(ALL_BETS.map((b) => [b, true])) as Record<BetId, boolean>,
};

export function makeRuleset(over: Partial<DragonTigerRuleset> = {}): DragonTigerRuleset {
  const r = { ...DT_RULESET, ...over, limits: { ...DT_RULESET.limits, ...over.limits }, enabled: { ...DT_RULESET.enabled, ...over.enabled } };
  for (const k of ['dragonPayout', 'tigerPayout', 'tiePayout', 'suitedTiePayout', 'bigPayout', 'smallPayout', 'oddPayout', 'evenPayout', 'redPayout', 'blackPayout'] as const) {
    if (!(r[k] >= 0) || Math.abs(r[k] * 100 - Math.round(r[k] * 100)) > 1e-9) throw new Error(`${k} must be a non-negative amount with at most two decimals`);
  }
  if (r.jokersEnabled) throw new Error('Dragon Tiger is played without jokers');
  if (r.aceHigh) throw new Error('in Dragon Tiger the Ace is always the lowest card');
  return r;
}

export function limitOf(id: BetId, r: DragonTigerRuleset): Limit {
  if (id === 'DRAGON' || id === 'TIGER') return r.limits.main;
  if (id === 'TIE') return r.limits.tie;
  if (id === 'SUITED_TIE') return r.limits.suitedTie;
  return r.limits.side;
}

/** Net payout of a winning bet. */
export function payoutOf(id: BetId, r: DragonTigerRuleset): number {
  switch (id) {
    case 'DRAGON':
      return r.dragonPayout;
    case 'TIGER':
      return r.tigerPayout;
    case 'TIE':
      return r.tiePayout;
    case 'SUITED_TIE':
      return r.suitedTiePayout;
  }
  const kind = id.split('_')[1] as SideKind;
  return { BIG: r.bigPayout, SMALL: r.smallPayout, ODD: r.oddPayout, EVEN: r.evenPayout, RED: r.redPayout, BLACK: r.blackPayout }[kind];
}
