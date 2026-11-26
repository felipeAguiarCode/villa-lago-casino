# Villa Lago Casino

A portrait, mobile-first 3D card casino made with **three.js**: twenty games against the dealer, rich card animations, chips that fly and stack, and a big video-poker style HUD.

> **Play chips only.** There is no real money, no real-money gambling and nothing to buy. Chips have no cash value. "Villa Lago" is an original name, not affiliated with any real casino.

## Games

| Table | Highlights |
|---|---|
| Blackjack | 6 decks, 3:2, split up to 4 hands, double after split, insurance / even money, basic-strategy hint |
| Trump 21 | Original duel blackjack with an 11-card deck (1–11) and **29 trump cards** in three rarities that change the target, draws and stakes |
| Three Card Poker | Ante / Play, Pair Plus, **Lucky 6**, ante bonus, and six table modes: Classic, **Ultimate** (raise up to 3×), **Face Up** (one dealer card shown), **Prime** (colour bet), **Draw** (replace a card), **Hold'em** (shared cards) |
| Three Card Slots | Slot machine with three card reels, Mini Royal |
| Video Blackjack | Machine blackjack with up to 5 hands played one by one in a circle around the dealer, coin meters, one split per hand |
| Texas Hold'em Bonus | Flop 2×, turn and river bets, AA bonus up to 1000:1 |
| Crazy 4 Poker | Super Bonus (four Aces 200:1), Queens Up, play 3× with Aces |
| High Card Flush | Seven cards, longest flush wins, raise up to 3×, flush side bets |
| Four Card Poker | Play 1×–3×, player wins ties, Aces Up |
| 3 Card Hold'em | Two raises, best three cards of five, Pair or Suited and Straight or Up side bets |
| Video Poker | Jacks or Better 9/6, hold & draw, LED meters, simple-strategy hint |
| Double Draw Poker | Two jokers, two draws, bonus table up to 500:1 |
| Baccarat | Punto Banco with card squeeze and bead road |
| Caribbean Stud | Call 2×, fictional progressive jackpot |
| Russian Poker | Buy a sixth card, exchange cards, buy a game |
| Ultimate Texas Hold'em | Bet 4×/3× pre-flop, 2× flop, 1× river, Trips |
| Let It Ride | Pull back two of three bets |
| Pai Gow Poker | Split seven cards into 5 + 2, house way |
| Casino War | War or surrender on ties, tie bet 10:1 |
| Red Dog | Spread payouts, raise, three of a kind 11:1 |

Every table opens with a shuffle show (ribbon spread, wave turnover, riffle, bridge), deals and collects cards with animation, and uses icon buttons. Text is in English by default with Portuguese available in the settings.

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run dev -- --host  # open from a phone on the same network
npm run test         # 102 rule / payout / RTP tests
npm run build        # static site in dist/
```

## Tech

Vite · TypeScript · three.js · GSAP · Vitest. Game rules are pure TypeScript modules (`src/games/*/rules.ts`) with tests; the views animate their events.

## Credits

All third-party assets are CC0 or open licensed — see [CREDITS.md](CREDITS.md):
Kenney *Casino Audio* (CC0), *Felt Backgrounds* by jbp4444 (CC0), English pattern court cards by Dmitry Fomin (CC0), Cinzel and Barlow Condensed (SIL OFL), three.js (MIT), GSAP.

---

### Português

Cassino de cartas 3D para celular em pé, feito com three.js: 15 jogos contra o dealer, animações de cartas e fichas, HUD estilo video poker. Somente fichas fictícias — sem dinheiro real. Rode com `npm install` e `npm run dev`.
