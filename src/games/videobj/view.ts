import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { Shoe } from '../../core/cards';
import { money } from '../../core/wallet';
import { dealCard, flipCard, peekCard, shake, slideCard, wait, slideChips } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { ChipPile } from '../../table/chips';
import { betRing, FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { shuffleShow } from '../../table/shuffle';
import type { BtnSpec, Pin } from '../../ui/hud';
import { CardTable, finishXP, highlightCards } from '../kit';
import { handValue, totalLabel } from '../blackjack/rules';
import { basicStrategy } from '../blackjack/strategy';
import type { GameCtx, GameView } from '../types';
import { MAX_SEATS, MultiHandRound, type MEvent } from './rules';

addStrings(
  {
    'vbj.title': 'VIDEO BLACKJACK',
    'vbj.print2': 'Play every hand against one dealer hand',
    'vbj.print3': 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17',
    'vbj.coin': 'COIN',
    'vbj.bet': 'BET',
    'vbj.win': 'WIN',
    'vbj.coinBtn': 'Coin {n}',
    'vbj.handsBtn': '{n} hands',
    'vbj.handBtn': '1 hand',
    'vbj.play': 'PLAY',
    'vbj.hint': 'Basic strategy: {move}',
    'vbj.handOf': 'Hand {i} of {n}',
    'vbj.rules': `
      <p>A blackjack machine with several hands. The dealer's hand sits in the middle; your hands are played <b>one at a time</b> in front of you, and each finished hand moves to its place in the <b>circle around the dealer</b>. When all are played, the dealer reveals his hand and every hand is settled against it.</p>
      <h4>Controls</h4>
      <p><b>Hands</b>: 1 to 5 hands · <b>Coin</b>: coin value · <b>Bet 1</b>: 1 to 5 coins per hand · <b>Deal</b>.</p>
      <h4>Machine rules</h4>
      <p>One deck, shuffled before every round · Blackjack pays <b>3 to 2</b> · Dealer stands on all 17s and peeks for blackjack · Double on any first two cards · One split per hand (split Aces get one card each) · No insurance.</p>
      <h4>Hint</h4><p>The light bulb shows the basic-strategy play for the hand in front of you.</p>`,
  },
  {
    'vbj.print2': 'Jogue todas as mãos contra uma mão do dealer',
    'vbj.print3': 'BLACKJACK PAGA 3 PARA 2 · DEALER PARA NO 17',
    'vbj.coin': 'FICHA',
    'vbj.bet': 'APOSTA',
    'vbj.win': 'GANHO',
    'vbj.coinBtn': 'Ficha {n}',
    'vbj.handsBtn': '{n} mãos',
    'vbj.handBtn': '1 mão',
    'vbj.play': 'JOGUE',
    'vbj.hint': 'Estratégia básica: {move}',
    'vbj.handOf': 'Mão {i} de {n}',
    'vbj.rules': `
      <p>Uma máquina de blackjack com várias mãos. A mão do dealer fica no centro; suas mãos são jogadas <b>uma de cada vez</b> na sua frente, e cada mão terminada vai para o seu lugar no <b>círculo em volta do dealer</b>. Quando todas forem jogadas, o dealer revela a mão e cada uma é comparada com ela.</p>
      <h4>Controles</h4>
      <p><b>Mãos</b>: de 1 a 5 · <b>Ficha</b>: valor da ficha · <b>Aposta 1</b>: de 1 a 5 fichas por mão · <b>Deal</b>.</p>
      <h4>Regras da máquina</h4>
      <p>Um baralho, embaralhado antes de cada rodada · Blackjack paga <b>3 para 2</b> · Dealer para em todos os 17 e espia o blackjack · Dobrar em quaisquer duas primeiras cartas · Uma divisão por mão (Ases divididos recebem uma carta cada) · Sem seguro.</p>
      <h4>Dica</h4><p>A lâmpada mostra a jogada da estratégia básica para a mão na sua frente.</p>`,
  },
);

const COINS = [5, 25, 100] as const;
const V = { dealer: 0.345, play: 0.625, playBet: 0.75, print: 0.415 };
const RING_SCALE = 0.7;

/** Ring places (u, v) around the dealer for 2..5 hands, in the order the hands are played. */
const SLOTS: Record<number, [number, number][]> = {
  2: [
    [0.2, 0.215],
    [0.8, 0.215],
  ],
  3: [
    [0.19, 0.24],
    [0.5, 0.16],
    [0.81, 0.24],
  ],
  4: [
    [0.19, 0.5],
    [0.19, 0.22],
    [0.81, 0.22],
    [0.81, 0.5],
  ],
  5: [
    [0.19, 0.5],
    [0.19, 0.24],
    [0.5, 0.16],
    [0.81, 0.24],
    [0.81, 0.5],
  ],
};

interface SeatView {
  /** Cards of each sub-hand (two after a split). */
  hands: Card3D[][];
  bubbles: Pin[];
  pile: ChipPile;
  /** Where the hand lives now: at the play spot or in its ring place. */
  inRing: boolean;
  center: THREE.Vector3;
  pileAt: THREE.Vector3;
}

export class VideoBlackjackView implements GameView {
  readonly id = 'videobj';
  readonly title = 'Video Blackjack';
  private state: 'idle' | 'shuffling' | 'playing' = 'idle';
  private coinIdx = 1;
  private coins = 5;
  private nHands = 3;
  private lastWin = 0;
  private cardsT: CardTable;
  private round: MultiHandRound | null = null;
  private dealer: Card3D[] = [];
  private seats: SeatView[] = [];
  private dealerBubble: Pin | null = null;
  private turnPin: Pin | null = null;
  private off: (() => void)[] = [];
  private busy = false;
  private tmp = new THREE.Vector3();

  constructor(private g: GameCtx) {
    this.cardsT = new CardTable(g);
  }

  get inRound() {
    return this.state !== 'idle';
  }

  rules() {
    return t('vbj.rules');
  }

  private get coin() {
    return COINS[this.coinIdx];
  }

  private get cost() {
    return this.coin * this.coins * this.nHands;
  }

  private at(u: number, v: number) {
    return this.g.stage.screenToTable(u, v);
  }

  // ---------------------------------------------------------------- places
  private slot(i: number): THREE.Vector3 {
    if (this.nHands === 1) return this.at(0.5, V.play);
    const [u, v] = SLOTS[this.nHands][i];
    return this.at(u, v);
  }

  private pilePlace(i: number): THREE.Vector3 {
    if (this.nHands === 1) return this.at(0.5, V.playBet);
    const s = this.slot(i);
    const [u] = SLOTS[this.nHands][i];
    // the top-centre place keeps its chips to the right; the side places keep them under the cards
    if (Math.abs(u - 0.5) < 0.05) return new THREE.Vector3(s.x + 0.62, 0, s.z + 0.05);
    return new THREE.Vector3(s.x, 0, s.z + 0.52);
  }

  /** Card places of one seat (all its sub-hands) at its current spot. */
  private seatPlaces(sv: SeatView) {
    const ring = sv.inRing && this.nHands > 1;
    const sc = ring ? RING_SCALE : 1;
    const c = ring ? sv.center : this.at(0.5, V.play);
    const fan = ring ? 0.2 : 0.3;
    const k = sv.hands.length;
    const sub = ring ? 0.42 : 0.78;
    return sv.hands.map((cards, h) => {
      const cx = c.x + (h - (k - 1) / 2) * sub;
      return cards.map((_, i) => ({
        pos: new THREE.Vector3(cx + (i - (cards.length - 1) / 2) * fan, REST_Y + i * 0.004, c.z + i * 0.02),
        yaw: 0,
        scale: sc,
      }));
    });
  }

  private async relayoutSeat(sv: SeatView, dur = 0.25) {
    const pl = this.seatPlaces(sv);
    const jobs: Promise<unknown>[] = [];
    sv.hands.forEach((cards, h) =>
      cards.forEach((c, i) => {
        const p = pl[h][i];
        jobs.push(slideCard(c, { pos: p.pos, yaw: p.yaw }, dur, sv.inRing ? 0.25 : 0.05));
        jobs.push(gsap.to(c.obj.scale, { x: p.scale, y: p.scale, z: p.scale, duration: dur, ease: 'power2.inOut' }).then(() => undefined));
      }),
    );
    await Promise.all(jobs);
  }

  private dealerPlaces() {
    const n = this.dealer.length;
    const z = this.at(0.5, V.dealer).z;
    const fan = n <= 2 ? 0.4 : 0.3;
    return this.dealer.map((_, i) => ({ pos: new THREE.Vector3((i - (n - 1) / 2) * fan, REST_Y + i * 0.004, z), yaw: 0 }));
  }

  // ---------------------------------------------------------------- lifecycle
  private decorate() {
    const { table } = this.g;
    table.clearDecals();
    table.addDecal(
      tablePrint(
        [
          { text: t('vbj.title'), y: 70, R: 1400, font: FONT.title(54), spacing: 6, color: GOLD },
          { text: t('vbj.print2'), y: 120, R: 1400, font: FONT.italic(34), color: INK_SOFT },
          { text: t('vbj.print3'), y: 166, R: 1400, font: FONT.title(24), color: GOLD, spacing: 3 },
        ],
        190,
      ),
      0.5,
      V.print,
      3.25,
    );
    // the play spot and one small ring per hand place
    if (this.nHands === 1) {
      const p = this.at(0.5, V.playBet);
      table.addDecalAt(betRing(t('vbj.bet')), p.x, p.z, 0.6);
    } else {
      const p = this.at(0.5, V.play);
      table.addDecalAt(betRing(t('vbj.play')), p.x, p.z, 1.05);
      for (let i = 0; i < this.nHands; i++) {
        const q = this.pilePlace(i);
        table.addDecalAt(betRing(String(i + 1)), q.x, q.z, 0.42);
      }
    }
  }

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(1);
    table.setFelt('videobj');
    this.decorate();
    this.dealerBubble = hud.pin('bubble');
    this.turnPin = hud.pin('handtag');
    this.off.push(stage.onFrame(() => this.sync()));
    hud.onHint = () => this.hint();
    this.state = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g);
    if (this.state !== 'shuffling') return;
    this.state = 'idle';
    this.idleBar();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.state = 'idle';
    this.busy = false;
    hud.setBetBar(null);
    hud.setActions(null);
    hud.showHint(false);
    hud.onHint = () => {};
    this.cardsT.destroyAll();
    this.dealer = [];
    for (const s of this.seats) {
      s.bubbles.forEach((b) => b.remove());
      s.pile.dispose();
    }
    this.seats = [];
    this.dealerBubble?.remove();
    this.turnPin?.remove();
    this.dealerBubble = null;
    this.turnPin = null;
    this.off.forEach((f) => f());
    this.off = [];
    table.clearDecals();
    stage.setZoom(1);
  }

  onWalletChange() {
    if (this.state === 'idle') this.idleBar();
  }

  // ---------------------------------------------------------------- machine controls
  private idleBar() {
    const { hud, wallet } = this.g;
    const buttons: BtnSpec[] = [
      { id: 'hands', label: this.nHands === 1 ? t('vbj.handBtn') : t('vbj.handsBtn', { n: this.nHands }), color: 'purple', icon: 'twin', onClick: () => this.cycleHands() },
      { id: 'coin', label: t('vbj.coinBtn', { n: this.coin }), color: 'gold', icon: 'chip', onClick: () => this.cycleCoin() },
      { id: 'betone', label: t('btn.betOne'), color: 'blue', icon: 'chips', onClick: () => this.betOne() },
      { id: 'deal', label: t('btn.deal'), color: 'green', icon: 'deal', enabled: wallet.canAfford(this.cost), onClick: () => this.deal() },
    ];
    hud.setBetBar({
      chips: [],
      onChip: () => {},
      leds: [
        { id: 'coin', label: t('vbj.coin'), value: money(this.coin) },
        { id: 'bet', label: t('vbj.bet'), value: `${this.coins} × ${this.nHands}` },
        { id: 'win', label: t('vbj.win'), value: money(this.lastWin), cls: 'red' },
      ],
      buttons,
    });
    hud.setActions(null);
    hud.showHint(false);
  }

  private cycleHands() {
    if (this.state !== 'idle') return;
    this.g.sfx.play('fan', { vol: 0.5 });
    this.nHands = (this.nHands % MAX_SEATS) + 1;
    this.decorate();
    this.idleBar();
  }

  private cycleCoin() {
    this.g.sfx.click();
    this.coinIdx = (this.coinIdx + 1) % COINS.length;
    this.idleBar();
  }

  private betOne() {
    this.g.sfx.play('chip', { vol: 0.7 });
    this.coins = (this.coins % 5) + 1;
    this.idleBar();
  }

  // ---------------------------------------------------------------- HUD pins
  private bubbleFor(sv: SeatView, h: number) {
    while (sv.bubbles.length <= h) sv.bubbles.push(this.g.hud.pin('bubble'));
    return sv.bubbles[h];
  }

  private sync() {
    const { stage } = this.g;
    const dz = this.at(0.5, V.dealer).z;
    if (this.dealerBubble) {
      const p = stage.toScreen(this.tmp.set(0, 0, dz + CARD_H / 2 + 0.27));
      this.dealerBubble.place(p.x, p.y);
      this.dealerBubble.show(this.dealer.length > 0);
    }
    this.seats.forEach((sv) => {
      const pl = this.seatPlaces(sv);
      sv.hands.forEach((cards, h) => {
        const b = sv.bubbles[h];
        if (!b) return;
        const first = pl[h][0];
        if (!first) {
          b.show(false);
          return;
        }
        const xs = pl[h].map((p) => p.pos.x);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const ring = sv.inRing && this.nHands > 1;
        const z = ring ? first.pos.z - (CARD_H * RING_SCALE) / 2 - 0.2 : first.pos.z + CARD_H / 2 + 0.25;
        const p = stage.toScreen(this.tmp.set(cx, 0, z));
        b.place(p.x, p.y);
        b.show(cards.length > 0);
      });
    });
    if (this.turnPin) {
      const r = this.round;
      const show = !!r && r.phase === 'player' && this.nHands > 1;
      if (show) {
        this.turnPin.set(t('vbj.handOf', { i: r.seat + 1, n: this.nHands }));
        const p = stage.toScreen(this.tmp.set(0, 0, this.at(0.5, V.play).z - CARD_H / 2 - 0.2));
        this.turnPin.place(p.x, p.y);
      }
      this.turnPin.show(show);
    }
  }

  private setBubbles() {
    const r = this.round;
    if (!r) return;
    const visible = this.dealer.filter((c) => c.faceUp).map((c) => c.card!);
    const dv = handValue(visible);
    this.dealerBubble?.set(totalLabel(visible), `bubble up${dv.total > 21 ? ' bust' : ''}`);
    this.seats.forEach((sv, s) =>
      sv.hands.forEach((_, h) => {
        const hand = r.seats[s]?.[h];
        if (!hand) return;
        const v = handValue(hand.cards);
        const ring = sv.inRing && this.nHands > 1;
        let cls = `bubble ${ring ? 'down' : 'up'}`;
        if (v.total > 21) cls += ' bust';
        else if (v.total === 21) cls += ' bj';
        if (hand.outcome) cls += hand.outcome === 'win' || hand.outcome === 'blackjack' ? ' win' : hand.outcome === 'push' ? '' : ' lose';
        else if (r.phase === 'player' && s === r.seat && h === r.hand && sv.hands.length > 1) cls += ' active';
        this.bubbleFor(sv, h).set(v.total > 21 ? String(v.total) : totalLabel(hand.cards), cls);
      }),
    );
  }

  // ---------------------------------------------------------------- round
  private fromPlayer() {
    const p = this.at(0.5, 0.97);
    p.y = 1.6;
    return p;
  }

  private async deal() {
    const { wallet, hud, sfx } = this.g;
    if (this.state !== 'idle' || this.busy) return;
    const cost = this.cost;
    if (!wallet.canAfford(cost)) return hud.toast(t('toast.noFunds'));
    this.state = 'playing';
    this.busy = true;
    this.lastWin = 0;
    hud.setBetBar(null);
    wallet.debit(cost);
    // chips fly to every hand's place
    const per = this.coin * this.coins;
    sfx.play('handle', { vol: 0.5 });
    this.seats = Array.from({ length: this.nHands }, (_, i) => ({
      hands: [[]],
      bubbles: [],
      pile: new ChipPile(this.g.chips, this.g.stage.table, this.pilePlace(i)),
      inRing: false,
      center: this.slot(i),
      pileAt: this.pilePlace(i),
    }));
    await Promise.all(this.seats.map((s, i) => wait(i * 0.08).then(() => s.pile.dropIn(per, this.fromPlayer(), 0.05))));
    this.round = new MultiHandRound(new Shoe(1, 1.01), Array(this.nHands).fill(per));
    await this.play(this.round.start());
    await this.next();
  }

  private async next() {
    const r = this.round!;
    if (r.phase === 'player') {
      this.busy = false;
      this.showActions();
      return;
    }
    await this.finish();
  }

  private showActions() {
    const { hud, wallet, settings } = this.g;
    const a = this.round!.actions(wallet.balance);
    const specs: BtnSpec[] = [{ id: 'stand', label: t('btn.stand'), color: 'red', icon: 'stand', onClick: () => this.act('stand') }];
    if (a.split) specs.push({ id: 'split', label: t('btn.split'), color: 'gold', icon: 'split', onClick: () => this.act('split') });
    specs.push({ id: 'double', label: t('btn.double'), color: 'blue', icon: 'double', enabled: a.double, onClick: () => this.act('double') });
    specs.push({ id: 'hit', label: t('btn.hit'), color: 'green', icon: 'hit', enabled: a.hit, onClick: () => this.act('hit') });
    hud.setActions(specs);
    hud.showHint(settings.hints);
  }

  private hint() {
    const r = this.round;
    if (!r || r.phase !== 'player' || this.busy) return;
    const a = r.actions(this.g.wallet.balance);
    const m = basicStrategy(r.current.cards, r.dealerUp, a.double, a.split);
    this.g.hud.highlight(m);
    this.g.hud.toast(t('vbj.hint', { move: t(`btn.${m}`).toUpperCase() }));
  }

  private async act(kind: 'hit' | 'stand' | 'double' | 'split') {
    const r = this.round;
    if (!r || this.busy || r.phase !== 'player') return;
    this.busy = true;
    this.g.hud.highlight(null);
    this.g.hud.lockActions(true);
    this.g.sfx.click();
    const evs = kind === 'hit' ? r.hit() : kind === 'stand' ? r.stand() : kind === 'double' ? r.double() : r.split();
    this.g.hud.setActions(null);
    this.g.hud.showHint(false);
    await this.play(evs);
    await this.next();
  }

  private async play(evs: MEvent[]) {
    const { sfx, wallet, table } = this.g;
    for (const e of evs) {
      switch (e.t) {
        case 'dealer': {
          const c = this.g.cards.create(e.card);
          c.obj.visible = false;
          this.cardsT.all.push(c);
          this.dealer.push(c);
          const pl = this.dealerPlaces();
          this.dealer.slice(0, -1).forEach((d, i) => slideCard(d, pl[i], 0.2));
          sfx.play('slide', { vol: 0.8 });
          await dealCard(c, table.shoeMouth(), table.shoeYaw, pl[pl.length - 1], { faceUp: e.faceUp, dur: 0.42, onLand: () => sfx.play('place', { vol: 0.5 }) });
          this.setBubbles();
          if (this.round?.holeRevealed) await wait(0.25);
          break;
        }
        case 'peek':
          await peekCard(this.dealer[1]);
          break;
        case 'seat':
          this.setBubbles();
          break;
        case 'card': {
          const sv = this.seats[e.seat];
          const c = this.g.cards.create(e.card);
          c.obj.visible = false;
          this.cardsT.all.push(c);
          sv.hands[e.hand].push(c);
          const pl = this.seatPlaces(sv);
          sv.hands.forEach((cards, h) => cards.forEach((x, i) => x !== c && slideCard(x, pl[h][i], 0.2)));
          const p = pl[e.hand][sv.hands[e.hand].length - 1];
          sfx.play('slide', { vol: 0.8 });
          await dealCard(c, table.shoeMouth(), table.shoeYaw, { pos: p.pos, yaw: p.yaw }, { faceUp: true, dur: 0.42, onLand: () => sfx.play('place', { vol: 0.5 }) });
          this.setBubbles();
          break;
        }
        case 'split': {
          const sv = this.seats[e.seat];
          const moved = sv.hands[e.hand].pop()!;
          sv.hands.splice(e.hand + 1, 0, [moved]);
          wallet.debit(e.bet);
          sfx.play('shove');
          await Promise.all([this.relayoutSeat(sv, 0.35), sv.pile.dropIn(e.bet, this.fromPlayer(), 0.05)]);
          this.setBubbles();
          break;
        }
        case 'double':
          wallet.debit(e.added);
          await this.seats[e.seat].pile.dropIn(e.added, this.fromPlayer(), 0.05);
          break;
        case 'active':
          this.setBubbles();
          break;
        case 'handDone': {
          this.setBubbles();
          const sv = this.seats[e.seat];
          if (e.reason === 'bust') {
            sfx.play('shove', { vol: 0.5 });
            await shake(sv.hands[e.hand].map((c) => c.obj));
          } else if (e.reason === 'blackjack') {
            highlightCards(this.g, sv.hands[e.hand]);
            sfx.win(true);
            await wait(0.35);
          }
          break;
        }
        case 'seatDone': {
          const sv = this.seats[e.seat];
          if (this.nHands > 1) {
            sv.inRing = true;
            this.setBubbles();
            sfx.play('shove', { vol: 0.55 });
            await this.relayoutSeat(sv, 0.45);
          }
          break;
        }
        case 'flipHole':
          sfx.play('fan', { vol: 0.6 });
          await flipCard(this.dealer[1], { onMid: () => sfx.play('place', { vol: 0.5 }) });
          this.setBubbles();
          await wait(0.2);
          break;
        case 'dealerDone':
          this.setBubbles();
          if (e.bust) {
            sfx.play('shove', { vol: 0.6 });
            await shake(
              this.dealer.map((c) => c.obj),
              0.04,
            );
          }
          break;
        case 'settle':
          await this.settle(e.results);
          break;
      }
    }
  }

  /** Each hand around the circle is paid or taken in turn, then the total is shown. */
  private async settle(results: Extract<MEvent, { t: 'settle' }>['results']) {
    const { wallet, hud, sfx, fx } = this.g;
    this.setBubbles();
    const dealerSide = this.at(0.5, V.dealer);
    dealerSide.y = 0.8;
    let ret = 0;
    let wager = 0;
    let bj = false;
    for (let s = 0; s < this.seats.length; s++) {
      const sv = this.seats[s];
      const rs = results.filter((r) => r.seat === s);
      const sRet = rs.reduce((a, r) => a + r.ret, 0);
      const sBet = rs.reduce((a, r) => a + r.bet, 0);
      ret += sRet;
      wager += sBet;
      rs.forEach((r) => {
        if (r.outcome === 'blackjack') bj = true;
        if (r.ret > r.bet) highlightCards(this.g, sv.hands[r.hand]);
      });
      if (sRet > sBet) {
        sfx.play('handle', { vol: 0.5 });
        await sv.pile.dropIn(sRet - sBet, dealerSide, 0.04);
        fx.burst(new THREE.Vector3(sv.pileAt.x, 0.3, sv.pileAt.z), 40);
      } else if (sRet === 0) {
        sfx.play('handle', { vol: 0.4 });
        const home = sv.pile.group.position.clone();
        await slideChips(sv.pile.group, new THREE.Vector3(dealerSide.x, 0, dealerSide.z - 1.2), 0.4, 0.15, 'power2.in');
        sv.pile.clear();
        sv.pile.group.position.copy(home);
      } else if (sRet < sBet) sv.pile.set(sRet);
      await wait(0.15);
    }
    const net = ret - wager;
    if (ret > 0) wallet.credit(ret);
    this.lastWin = ret;
    let banner: Promise<void>;
    if (net > 0) {
      sfx.win(bj || net >= wager);
      banner = hud.banner(bj && this.nHands === 1 ? 'BLACKJACK!' : t('win.you'), `+${money(net)}`, 'win', 1500);
    } else if (net === 0) {
      sfx.push();
      banner = hud.banner(t('win.push'), t('win.pushSub'), 'small', 1100);
    } else {
      sfx.lose();
      banner = hud.banner(t('win.dealer'), `-${money(-net)}`, 'lose small', 1100);
    }
    await wait(0.6);
    // what's left on the table slides to the player
    const bottom = this.at(0.5, 1.2);
    const piles = this.seats.map((s) => s.pile).filter((p) => p.amount > 0);
    if (piles.length) sfx.play('handle', { vol: 0.6 });
    await Promise.all(piles.map((p) => slideChips(p.group, new THREE.Vector3(p.group.position.x, 0, bottom.z), 0.5, 0.08, 'power2.in')));
    await finishXP(this.g, wager, net, banner);
  }

  private async finish() {
    await wait(0.4);
    // totals disappear before the cards fly to the tray
    for (const s of this.seats) {
      s.bubbles.forEach((b) => b.remove());
      s.bubbles = [];
    }
    this.dealerBubble?.show(false);
    const dealerCards = this.dealer;
    this.dealer = [];
    void dealerCards;
    await this.cardsT.collect();
    for (const s of this.seats) s.pile.dispose();
    this.seats = [];
    this.round = null;
    this.busy = false;
    this.state = 'idle';
    this.idleBar();
  }
}
