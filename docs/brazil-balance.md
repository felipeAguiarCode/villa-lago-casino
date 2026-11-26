# Brazilian card games — balance simulation

Real round classes, evaluators, dealer policies and settlement; base bet 10; seed 2026 (reproducible). RTP = chips returned ÷ chips bet. The ± is a 95% confidence interval. Strategies are reference players, not proven optimal play.

## MANILHA_DRAW

40000 rounds per strategy.

| Strategy | Win | Loss | Push | Fold | Avg bet | Avg return | Net / round | RTP | House edge | SD |
|---|---|---|---|---|---|---|---|---|---|---|
| Random | 16.35% | 29.42% | 3.96% | 50.27% | 1.50 | 0.733 | -0.764 | 48.97% ± 0.91 | 51.03% | 1.32 |
| Always play, no draw, cards in order | 33.25% | 58.42% | 8.33% | 0.00% | 2.00 | 1.497 | -0.503 | 74.83% ± 0.91 | 25.17% | 1.85 |
| Always play, dealer-style draw, strongest first | 45.40% | 45.20% | 9.39% | 0.00% | 2.00 | 2.004 | +0.004 | 100.20% ± 0.93 | -0.20% | 1.90 |
| Always play, dealer-style draw, weakest first | 45.32% | 45.62% | 9.06% | 0.00% | 2.00 | 1.994 | -0.006 | 99.70% ± 0.93 | 0.30% | 1.91 |
| Conservative: fold without a 2, 3 or manilha | 36.88% | 21.03% | 5.99% | 36.10% | 1.64 | 1.595 | -0.044 | 97.31% ± 0.98 | 2.69% | 1.64 |

Payout distribution (total return in base bets → share of rounds):

- Random: 0× 79.69%, 2× 3.96%, 4× 16.35%
- Always play, no draw, cards in order: 0× 58.42%, 2× 8.33%, 4× 33.25%
- Always play, dealer-style draw, strongest first: 0× 45.20%, 2× 9.39%, 4× 45.40%
- Always play, dealer-style draw, weakest first: 0× 45.62%, 2× 9.06%, 4× 45.32%
- Conservative: fold without a 2, 3 or manilha: 0× 57.13%, 2× 5.99%, 4× 36.88%

## MANILHA_HOLDEM

40000 rounds per strategy.

| Strategy | Win | Loss | Push | Fold | Avg bet | Avg return | Net / round | RTP | House edge | SD |
|---|---|---|---|---|---|---|---|---|---|---|
| Random | 23.90% | 23.40% | 2.50% | 50.20% | 1.50 | 1.006 | -0.492 | 67.16% ± 1.00 | 32.84% | 1.47 |
| Always play | 47.89% | 47.30% | 4.81% | 0.00% | 2.00 | 2.012 | +0.012 | 100.59% ± 0.96 | -0.59% | 1.95 |
| Conservative: play with a 2, 3 or manilha in hand or on the board | 39.65% | 20.84% | 3.06% | 36.45% | 1.64 | 1.647 | +0.012 | 100.71% ± 1.00 | -0.71% | 1.67 |
| Play with a hole card of strength ≥ 7 (K or better) | 44.46% | 23.31% | 3.52% | 28.72% | 1.71 | 1.849 | +0.136 | 107.93% ± 0.98 | -7.93% | 1.73 |

Payout distribution (total return in base bets → share of rounds):

- Random: 0× 73.60%, 2× 2.50%, 4× 23.90%
- Always play: 0× 47.30%, 2× 4.81%, 4× 47.89%
- Conservative: play with a 2, 3 or manilha in hand or on the board: 0× 57.29%, 2× 3.06%, 4× 39.65%
- Play with a hole card of strength ≥ 7 (K or better): 0× 52.02%, 2× 3.52%, 4× 44.46%

## PIFE_EXPRESS

1500 rounds per strategy.

| Strategy | Win | Loss | Push | Fold | Avg bet | Avg return | Net / round | RTP | House edge | SD |
|---|---|---|---|---|---|---|---|---|---|---|
| Random | 40.80% | 56.33% | 2.87% | 0.00% | 1.00 | 0.845 | -0.155 | 84.47% ± 4.93 | 15.53% | 0.97 |
| No discards | 41.27% | 55.40% | 3.33% | 0.00% | 1.00 | 0.859 | -0.141 | 85.87% ± 4.92 | 14.13% | 0.97 |
| Heuristic: throw the two highest loose cards | 58.07% | 39.53% | 2.40% | 0.00% | 1.00 | 1.185 | +0.185 | 118.53% ± 4.91 | -18.53% | 0.97 |
| Dealer's exact policy (groups first, then deadwood) | 47.53% | 50.07% | 2.40% | 0.00% | 1.00 | 0.975 | -0.025 | 97.47% ± 5.00 | 2.53% | 0.99 |

Final class of the player's hand:

| Strategy | NO_SET | PERFECT_PIFE | SINGLE_SET |
|---|---|---|---|
| Random | 91.27% | 0.00% | 8.73% |
| No discards | 91.80% | 0.07% | 8.13% |
| Heuristic: throw the two highest loose cards | 83.60% | 0.20% | 16.20% |
| Dealer's exact policy (groups first, then deadwood) | 79.53% | 0.40% | 20.07% |

Payout distribution (total return in base bets → share of rounds):

- Random: 0× 56.33%, 1× 2.87%, 2× 40.80%
- No discards: 0× 55.40%, 1× 3.33%, 2× 41.27%
- Heuristic: throw the two highest loose cards: 0× 39.53%, 1× 2.40%, 2× 58.07%
- Dealer's exact policy (groups first, then deadwood): 0× 50.07%, 1× 2.40%, 2× 47.53%

## VIDEO_PIFE

2000 rounds per strategy.

| Strategy | Win | Loss | Push | Fold | Avg bet | Avg return | Net / round | RTP | House edge | SD |
|---|---|---|---|---|---|---|---|---|---|---|
| Random | 1.40% | 98.60% | 0.00% | 0.00% | 1.00 | 0.028 | -0.972 | 2.80% ± 1.03 | 97.20% | 0.24 |
| Stand | 1.35% | 98.65% | 0.00% | 0.00% | 1.00 | 0.027 | -0.973 | 2.70% ± 1.01 | 97.30% | 0.23 |
| Heuristic: throw up to three highest loose cards | 5.10% | 94.90% | 0.00% | 0.00% | 1.00 | 0.104 | -0.895 | 10.45% ± 2.03 | 89.55% | 0.46 |
| Monte Carlo hold (40 samples per choice) | 7.40% | 92.60% | 0.00% | 0.00% | 1.00 | 0.148 | -0.852 | 14.80% ± 2.29 | 85.20% | 0.52 |

Final class of the player's hand:

| Strategy | DOUBLE_SET | NO_SET | PERFECT_PIFE | SINGLE_SET |
|---|---|---|---|---|
| Random | 1.40% | 70.05% | 0.00% | 28.55% |
| Stand | 1.35% | 69.30% | 0.00% | 29.35% |
| Heuristic: throw up to three highest loose cards | 5.05% | 49.85% | 0.05% | 45.05% |
| Monte Carlo hold (40 samples per choice) | 7.40% | 46.15% | 0.00% | 46.45% |

Payout distribution (total return in base bets → share of rounds):

- Random: 0× 98.60%, 2× 1.40%
- Stand: 0× 98.65%, 2× 1.35%
- Heuristic: throw up to three highest loose cards: 0× 94.90%, 2× 5.05%, 7× 0.05%
- Monte Carlo hold (40 samples per choice): 0× 92.60%, 2× 7.40%

## CANASTRA_DRAW

20000 rounds per strategy.

| Strategy | Win | Loss | Push | Fold | Avg bet | Avg return | Net / round | RTP | House edge | SD |
|---|---|---|---|---|---|---|---|---|---|---|
| Random | 30.54% | 56.52% | 12.95% | 0.00% | 1.00 | 0.740 | -0.260 | 74.03% ± 1.24 | 25.97% | 0.90 |
| No discards | 30.49% | 56.64% | 12.87% | 0.00% | 1.00 | 0.739 | -0.261 | 73.87% ± 1.24 | 26.13% | 0.90 |
| Dealer's policy | 45.95% | 45.16% | 8.89% | 0.00% | 1.00 | 1.010 | +0.010 | 100.98% ± 1.33 | -0.98% | 0.96 |

Final class of the player's hand:

| Strategy | CLEAN_CANASTRA | DIRTY_CANASTRA | LONG_SEQUENCE | NO_SEQUENCE | SHORT_SEQUENCE |
|---|---|---|---|---|---|
| Random | 0.00% | 0.01% | 1.89% | 44.51% | 53.60% |
| No discards | 0.00% | 0.02% | 1.93% | 44.40% | 53.65% |
| Dealer's policy | 0.01% | 0.17% | 7.40% | 27.83% | 64.59% |

Payout distribution (total return in base bets → share of rounds):

- Random: 0× 56.52%, 1× 12.95%, 2× 30.53%, 3× 0.01%
- No discards: 0× 56.64%, 1× 12.87%, 2× 30.47%, 3× 0.02%
- Dealer's policy: 0× 45.16%, 1× 8.89%, 2× 45.77%, 3× 0.17%, 4× 0.01%

_Generated by sim/brazil.sim.ts in 509 s._
