# ♠ Poker: Against the House

**Gênero:** Poker RPG / Casino Career Simulator

**Formato:** Single-player — Player vs. Dealer

**Proposta:** Construir uma carreira no mundo do poker, dominar diferentes modalidades e conquistar seu lugar entre os jogadores de elite.

---

## Villa Lago Casino

The game is set at the Villa Lago casino, whose symbol is **VL on a golden chip**. A portrait, mobile-first 3D card casino made with **three.js**: twenty-eight games against the dealer, rich card animations, chips that fly and stack, and a big video-poker style HUD.

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
| Manilha Draw | 40-card Truco deck with a Vira and suit-ranked manilhas (Zap ♣ highest); Play or Fold, one free draw, then three duels against the dealer's fixed order |
| Manilha Hold'em | Two hole cards, three board cards, best three with at least one hole card, compared card by card |
| Pife Express | Six cards, up to two draws, sets and runs of three; most groups then least deadwood beats the dealer |
| Video Pife | Nine cards, up to three draws, paid by groups: Perfect Pife (3) 7×, Double Set (2) 2× |
| Canastra Draw | Two decks, nine cards, best single run with 2s as wild (one substitute per run); Clean Canastra 3:1, Dirty 2:1, runs 1:1 |
| Dragon Tiger | Eight-deck shoe with a burn card, one card to Dragon and one to Tiger (Ace low, King high): Dragon / Tiger 1:1 with half back on ties, Tie 11:1, Suited Tie 50:1 and twelve side bets (Big, Small, Odd, Even, Red, Black on either card); exact payouts in cents, round history, statistics and recovery of interrupted rounds |
| Abyss Poker | Heads-up Texas Hold'em against a dealer with five behaviour profiles (conservative, balanced, aggressive, calling station, unpredictable) that bets, raises, calls, folds and bluffs; 11 skills in four tiers bought with chips (reads on the dealer's cards, Pressure, Lock Raise, Block Bet, Reveal Card, Peek, Make 'Em Chase), priced from the matched pot |
| Showdown Poker | Build a five-card hand one confirmed card at a time against a Monte Carlo dealer; Check / Double / Fold after cards 2 and 4, 1:1 on the total bet |
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

Every table opens with a cardistry show picked at random, never the same one twice in a row: ribbon spread with a wave turnover, pressure fan, triple cut with a twirl, card spring, waterfall, faro weave, overhand, circle spread, chemmy wash, riffle and bridge (seven opening routines, five shorter reshuffles). Cards are dealt from a sealed Villa Lago deck box with gold-foil print, and the tables use icon buttons. Motion is physically modelled: cards fly low, land and slide on the felt with friction, and turn over by rolling on one edge; chips fly on ballistic arcs, bounce and wobble flat like coins; stacks lean with inertia when pushed. Levels follow an RPG curve (`src/core/progression.ts`): the first levels come in a few hands and every level asks for more XP than the last, while bigger bets add XP with diminishing returns; each level-up pays a chip bonus. Text is in English by default with Portuguese available in the settings.

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run dev -- --host  # open from a phone on the same network
npm run test         # 230 rule / payout / RTP tests
npm run sim:showdown # Showdown Poker balance report → docs/showdown-balance.md
npm run sim:abyss    # Abyss Poker balance report → docs/abyss-balance.md
npm run sim:brazil   # Brazilian games balance report → docs/brazil-balance.md
npm run build        # static site in dist/
```

## Tech

Vite · TypeScript · three.js · GSAP · Vitest. Game rules are pure TypeScript modules (`src/games/*/rules.ts`) with tests; the views animate their events.

## Credits

All third-party assets are CC0 or open licensed — see [CREDITS.md](CREDITS.md):
Kenney *Casino Audio* (CC0), *Felt Backgrounds* by jbp4444 (CC0), English pattern court cards by Dmitry Fomin (CC0), Cinzel and Barlow Condensed (SIL OFL), three.js (MIT), GSAP.

---

### Português

Cassino de cartas 3D para celular em pé, feito com three.js: 28 jogos contra o dealer, animações de cartas e fichas, HUD estilo video poker. Somente fichas fictícias — sem dinheiro real. Rode com `npm install` e `npm run dev`.
