/**
 * Player progression, RPG style: the first levels come quickly, every next level asks for more XP
 * than the one before (a power curve), and bigger bets give a little more XP per hand with
 * diminishing returns, so high stakes can't buy levels.
 */
export const PROGRESSION = {
  /** XP to clear level L = base × L^exponent + offset, rounded to `step`. */
  base: 80,
  exponent: 1.5,
  offset: 20,
  step: 10,
  /** XP for every finished hand. */
  handXp: 10,
  /** Extra XP = stakeXp × log2(1 + wagered / stakeUnit). */
  stakeXp: 4,
  stakeUnit: 25,
  /** Chips granted on reaching level L = bonusPerLevel × L. */
  bonusPerLevel: 250,
};

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number, p = PROGRESSION): number {
  const raw = p.base * Math.pow(Math.max(1, level), p.exponent) + p.offset;
  return Math.round(raw / p.step) * p.step;
}

/** Total XP from level 1 to reach `level`. */
export function totalXpTo(level: number, p = PROGRESSION): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpForLevel(l, p);
  return sum;
}

/** XP earned by one finished hand. */
export function xpForHand(wagered: number, p = PROGRESSION): number {
  const stake = Math.max(0, wagered);
  return p.handXp + Math.floor(p.stakeXp * Math.log2(1 + stake / p.stakeUnit));
}

export const levelBonus = (level: number, p = PROGRESSION) => p.bonusPerLevel * level;
