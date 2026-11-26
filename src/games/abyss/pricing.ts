import type { AbyssConfig, SkillTier } from './config';

/**
 * Skill Pricing Engine. The price only depends on the matched pot, the Ante and the skill's tier:
 * never on the balance, the player's history or anything else about the player.
 */

/** Price base: the matched pot (unmatched bets excluded), capped at priceCapMult × Ante. */
export function priceBase(matchedPot: number, ante: number, cfg: AbyssConfig): number {
  return Math.min(matchedPot, cfg.priceCapMult * ante);
}

/** Highest price a tier can ever reach (rounded down to the chip unit). */
export function priceCeiling(tier: SkillTier, ante: number, cfg: AbyssConfig): number {
  const u = cfg.chipUnit;
  return Math.floor((cfg.priceCapMult * ante * cfg.tierRates[tier]) / u + 1e-9) * u;
}

/**
 * Price of a skill now: base × tier rate, rounded to the nearest chip unit, never above the tier's
 * ceiling and never free (at least one unit).
 */
export function skillPrice(tier: SkillTier, matchedPot: number, ante: number, cfg: AbyssConfig): number {
  const u = cfg.chipUnit;
  const raw = priceBase(matchedPot, ante, cfg) * cfg.tierRates[tier];
  const rounded = Math.round(raw / u + 1e-9) * u;
  return Math.max(u, Math.min(rounded, priceCeiling(tier, ante, cfg)));
}
