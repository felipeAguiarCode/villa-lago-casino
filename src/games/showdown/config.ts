/** Every tunable number of Showdown Poker lives here. */
export const SHOWDOWN = {
  minAnte: 5,
  maxAnte: 1000,
  /** Largest total bet (ante + doubles) a round may reach. */
  maxTotal: 4000,
  /** Cards each side holds while building. */
  handCards: 4,
  /** Cards in a finished hand. */
  finalCards: 5,
  /** Betting windows open after these selection turns. */
  windows: [2, 4] as readonly number[],
  /** A win pays winPays:1 on the total bet. */
  winPays: 1,
  /** Monte Carlo samples per decision for the dealer. */
  dealerSamples: 240,
  /** Monte Carlo samples for the player's hint lamp. */
  hintSamples: 300,
  /** The hint suggests Double when the estimated hand strength is at least this (0..1). */
  doubleAt: [0.62, 0.6] as readonly number[],
};

export type ShowdownConfig = typeof SHOWDOWN;
