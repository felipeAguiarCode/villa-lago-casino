/**
 * Abyss Poker balance configuration. Business rules read every tunable number from here.
 */
export type SkillTier = 1 | 2 | 3 | 4;
export type ProfileId = 'conservative' | 'balanced' | 'aggressive' | 'callingStation' | 'unpredictable';

/** One behaviour policy of the dealer. All values are probabilities or probability shifts. */
export interface DealerProfile {
  /** Added to the fold probability when facing a bet (negative = folds less). */
  foldBias: number;
  /** 0..1: how often strength turns into bets and raises. */
  aggression: number;
  /** Base probability of a bluff bet when checked to. */
  bluff: number;
  /** Lowers the equity needed to call (positive = calls more). */
  callBias: number;
  /** Random spread applied to every parameter at each decision (Unpredictable). */
  jitter: number;
  /** Bet size as a fraction of the pot. */
  sizing: number;
}

export const ABYSS = {
  minAnte: 5,
  maxAnte: 500,
  /** Round budget = budgetMult × Ante, limited by the balance. Bets and skills share it. */
  budgetMult: 10,
  /** Price base = min(matched pot, priceCapMult × Ante). */
  priceCapMult: 5,
  tierRates: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 } as Record<SkillTier, number>,
  skillsPerStreet: 1,
  reuseSkills: false,
  raisesPerStreet: 1,
  /** Pressure: added to the dealer's fold probability (percentage points / 100). */
  pressureModifier: 0.2,
  dealerSkills: false,
  rake: 0,
  sideBets: false,
  /** Smallest chip amount for prices (the wallet works in whole chips here). */
  chipUnit: 1,
  /** Bet sizes offered to the player are rounded to this. */
  betStep: 5,
  /** A card is burned before the flop, the turn and the river. */
  burnCards: true,
  dealerSamples: 360,
  hintSamples: 700,
  profiles: {
    conservative: { foldBias: 0.12, aggression: 0.35, bluff: 0.04, callBias: -0.04, jitter: 0, sizing: 0.5 },
    balanced: { foldBias: 0, aggression: 0.55, bluff: 0.12, callBias: 0, jitter: 0, sizing: 0.66 },
    aggressive: { foldBias: -0.06, aggression: 0.8, bluff: 0.26, callBias: 0.03, jitter: 0, sizing: 0.9 },
    callingStation: { foldBias: -0.2, aggression: 0.25, bluff: 0.05, callBias: 0.18, jitter: 0, sizing: 0.5 },
    unpredictable: { foldBias: 0, aggression: 0.55, bluff: 0.18, callBias: 0, jitter: 0.2, sizing: 0.75 },
  } as Record<ProfileId, DealerProfile>,
  /** Relative chance of each profile being picked before the deal. */
  profileWeights: { conservative: 1, balanced: 1, aggressive: 1, callingStation: 1, unpredictable: 1 } as Record<ProfileId, number>,
};

export type AbyssConfig = typeof ABYSS;
