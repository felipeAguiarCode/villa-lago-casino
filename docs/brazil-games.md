# Brazilian card games — implementation notes

Five modes: `MANILHA_DRAW`, `MANILHA_HOLDEM`, `PIFE_EXPRESS`, `VIDEO_PIFE`, `CANASTRA_DRAW` (`src/games/brazil/`).

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Decks | `shared/deck.ts` | Built from the casino's 0..51 cards (`freshDeck`, `shuffle`, `cryptoRng`). Each physical card has a uid, so the two 7♥ of Canastra's double deck are distinct. TRUCO_40 drops 8, 9 and 10. The shuffled order is fixed for the round and saved. |
| Round base | `shared/round.ts` | Explicit state machine with validated transitions; one wallet debit per bet; one settlement per round (integer chips only); snapshot saved after every transition; `void()` refunds once; `resumeRound()` restores an interrupted round, drops one that was already settled, or voids an unreadable one with a single refund. |
| Persistence | `shared/store.ts` | Pending round, last 100 rounds and stats per mode, on the browser storage the casino already uses (`src/core/storage.ts`). |
| Manilha engine | `manilha/engine.ts` | Truco Paulista order, Vira → manilha, suit-ranked manilhas, card and sorted-hand comparison, best three with at least one hole card. |
| Pife engine | `pife/engine.ts`, `pife/strategy.ts` | Sets and three-card runs, exhaustive search for the best partition (more groups, then less deadwood, deterministic tie order), discard plan by enumeration of the unseen cards. |
| Canastra engine | `canastra/engine.ts` | Best single same-suit run with at most one substitute 2, natural 2 in its own place, Ace low or high without wrap; dealer discard policy of the spec. |
| Rounds | `manilha/draw.ts`, `manilha/holdem.ts`, `pife/express.ts`, `pife/video.ts`, `canastra/draw.ts` | Each holds its ruleset (with a version string), state machine and settlement. |
| Tables | `view/*.ts` | Only existing pieces: `TableGame`, bet circles, `CardPicker`, action buttons, tags, `Paytable`, banners. `TableGame.resumeRound()` is an opt-in addition used to continue a restored round. |
| Simulation | `sim.ts`, `sim/brazil.sim.ts` | Drives the real round classes; `npm run sim:brazil` → `docs/brazil-balance.md`. |

## Decisions and known limitations

- **Canastra wild position.** The spec says a 2 replaces "uma carta ausente dentro de uma sequência". The engine also lets the one substitute stand at either end of a run (5-6-2 = 5-6-7). The spec does not say otherwise, and it matches common Canastra practice.
- **Pife Express dealer.** The dealer enumerates every replacement combination exactly: about 15,500 evaluations, a few tens of milliseconds. The rules expose `dealerSamples` for faster sampling; it is off (exact) in the game.
- **Video Pife hint and Monte Carlo player.** These are sampled estimates, not a proven optimal strategy.
- **Recovery granularity.** Rounds are saved after every transition. Each player action runs synchronously, so a saved round always sits at a player decision. Opening the table resumes it there, with the same cards, decisions and dealer order.
- **Storage.** Recovery and history live in this browser's storage, as the wallet does. Clearing site data or switching devices loses an unfinished round, but its chips were already counted in the wallet.
- **Payouts.** The tables are the spec's v1 (`version` fields `…/1`). The simulation report shows how each mode performs. No payout was changed; any change should become a new ruleset version.
- **Layout.** The spec asks for no UI work, so nine-card hands are shown as one overlapping row, which the existing card picker supports.

## Balance findings (seed 2026, see `brazil-balance.md`)

Payouts are unchanged (v1). These results are reported for a design decision. Under the spec, a revision means a new ruleset version.

- **Video Pife:** the v1 paytable returns about **15%** with the best reference player (Monte Carlo hold, 14.8% ± 2.3). Nine cards with three replacements reach Double Set only about 7% of the time, and Perfect Pife almost never. The mode needs a new paytable (Single Set paying, larger multipliers), or more replacements, before the economy can use it.
- **Pife Express:** the dealer follows the spec's priority (two groups, then one group, then expected deadwood). Most hands (about 80%) end with no group, so the result is decided on deadwood. A player who just throws the two highest loose cards reaches **118.5% ± 4.9**. Playing the dealer's own policy gives 97.5% ± 5.0. The in-game hint follows the dealer's policy, so it is not the strongest known play.
- **Manilha Hold'em:** always playing gives 100.6% ± 1.0. Playing only with a hole card of K or better gives **107.9% ± 1.0**, a player edge.
- **Manilha Draw:** sensible play sits at about 100% (100.2% ± 0.9). Random play gives 49%.
- **Canastra Draw:** the dealer's policy gives 101.0% ± 1.3. Not drawing gives 73.9%. Canastras are very rare (about 0.2% of hands), so the 2:1 and 3:1 lines barely move the RTP.
