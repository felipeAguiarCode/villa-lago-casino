import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { Cat5, eval5 } from '../../core/eval5';
import { arcTo, wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { CardPicker, highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { dealerReplace, RUS, RUS_PAYS, rusAdvice, settleRus } from './rules';

addStrings(
  {
    'rus.ante': 'ANTE',
    'rus.call': 'CALL',
    'rus.fee': 'BUY',
    'rus.print1': 'RUSSIAN POKER',
    'rus.print2': 'Buy a sixth card or exchange cards',
    'rus.print3': 'DEALER QUALIFIES WITH ACE-KING',
    'rus.needAnte': 'Place a bet on ANTE',
    'rus.buy6': 'Buy 6th',
    'rus.swap': 'Exchange',
    'rus.swapGo': 'Swap',
    'rus.back': 'Back',
    'rus.pickSwap': 'Tap up to 4 cards to exchange',
    'rus.discard': 'SWAP',
    'rus.noQualify': 'DEALER DOES NOT QUALIFY',
    'rus.buyGameTitle': 'BUY A GAME?',
    'rus.buyGameText': 'The dealer did not qualify, so your Ante wins 1:1. Pay {n} to make him replace his highest card and play for your hand instead?',
    'rus.takeAnte': 'Take ante',
    'rus.buyGame': 'Buy game',
    'rus.hintCall': 'Strategy: CALL',
    'rus.hintFold': 'Strategy: FOLD',
    'rus.hintSwap': 'Strategy: EXCHANGE the odd card for a draw',
    'rus.ak': 'Ace-King',
    'rus.rules': `
      <p>Caribbean-style five-card stud against the dealer, with extra options. Bet the <b>Ante</b>; you and the dealer get five cards and one dealer card is turned up.</p>
      <h4>Your options</h4>
      <p><b>Fold</b> (lose the Ante) · <b>Call</b> with 2× the Ante · <b>Buy a 6th card</b> for 1× the Ante (your best five play) · <b>Exchange</b> up to four cards for 1× the Ante. After buying or exchanging you call or fold.</p>
      <h4>Dealer qualifies with Ace-King</h4>
      <p>If he doesn't, your Ante pays 1:1 and the Call is returned — or you may <b>buy a game</b> for 1× the Ante: he replaces his highest card and you play for your hand.</p>
      <h4>Payouts (Call)</h4>
      <p>Royal 100 · Straight flush 50 · Quads 20 · Full house 7 · Flush 5 · Straight 4 · Trips 3 · Two pair 2 · Pair 1 · Ace-King 1. The Ante pays 1:1 too, unless you bought or exchanged cards (then it is returned). Ties push. Purchases are never refunded.</p>`,
  },
  {
    'rus.fee': 'COMPRA',
    'rus.print2': 'Compre a sexta carta ou troque cartas',
    'rus.print3': 'DEALER QUALIFICA COM ÁS-REI',
    'rus.needAnte': 'Aposte no ANTE',
    'rus.buy6': 'Comprar 6ª',
    'rus.swap': 'Trocar',
    'rus.swapGo': 'Trocar',
    'rus.back': 'Voltar',
    'rus.pickSwap': 'Toque em até 4 cartas para trocar',
    'rus.discard': 'TROCA',
    'rus.noQualify': 'DEALER NÃO QUALIFICA',
    'rus.buyGameTitle': 'COMPRAR O JOGO?',
    'rus.buyGameText': 'O dealer não qualificou e seu Ante ganha 1:1. Pagar {n} para ele trocar a carta mais alta e jogar pela sua mão?',
    'rus.takeAnte': 'Levar ante',
    'rus.buyGame': 'Comprar jogo',
    'rus.hintCall': 'Estratégia: CALL',
    'rus.hintFold': 'Estratégia: DESISTIR',
    'rus.hintSwap': 'Estratégia: TROCAR a carta solta para buscar o jogo',
    'rus.ak': 'Ás-Rei',
    'rus.rules': `
      <p>Pôquer de cinco cartas estilo Caribbean contra o dealer, com opções extras. Aposte no <b>Ante</b>; você e o dealer recebem cinco cartas e uma do dealer fica aberta.</p>
      <h4>Suas opções</h4>
      <p><b>Desistir</b> (perde o Ante) · <b>Call</b> com 2× o Ante · <b>Comprar a 6ª carta</b> por 1× o Ante (valem suas cinco melhores) · <b>Trocar</b> até quatro cartas por 1× o Ante. Depois de comprar ou trocar, você dá call ou desiste.</p>
      <h4>Dealer qualifica com Ás-Rei</h4>
      <p>Se não qualificar, seu Ante paga 1:1 e o Call volta — ou você pode <b>comprar o jogo</b> por 1× o Ante: ele troca a carta mais alta e você joga pela sua mão.</p>
      <h4>Pagamentos (Call)</h4>
      <p>Royal 100 · Straight flush 50 · Quadra 20 · Full house 7 · Flush 5 · Sequência 4 · Trinca 3 · Dois pares 2 · Par 1 · Ás-Rei 1. O Ante também paga 1:1, a não ser que você tenha comprado ou trocado cartas (aí ele volta). Empate devolve. Compras nunca são reembolsadas.</p>`,
  },
);

const V = { dealer: 0.245, print: 0.39, player: 0.53 };

export class RussianView extends TableGame {
  readonly id = 'russian';
  readonly title = 'Russian Poker';
  protected readonly felt = 'russian' as const;
  private picker: CardPicker;
  private advise: { cards: Card[]; up: Card; first: boolean } | null = null;

  constructor(g: GameCtx) {
    super(g, 1);
    this.picker = new CardPicker(g, 4, t('rus.discard'), () => this.refreshSwap());
  }

  rules() {
    return t('rus.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'fee', label: t('rus.fee'), u: 0.5, v: 0.655, size: 0.5, auto: true },
      { id: 'ante', label: t('rus.ante'), u: 0.3, v: 0.745, size: 0.62, max: RUS.maxBet },
      { id: 'call', label: t('rus.call'), u: 0.7, v: 0.745, size: 0.62, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('rus.print1'), y: 112, R: 900, font: FONT.title(70), spacing: 5 },
          { text: t('rus.print2'), y: 180, R: 900, font: FONT.italic(42), color: INK_SOFT },
          { text: t('rus.print3'), y: 266, R: 900, font: FONT.title(32), color: GOLD, spacing: 5 },
        ],
        316,
        [
          { y: 220, R: 900, half: 0.4 },
          { y: 282, R: 900, half: 0.4 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
    const n = (c: Cat5) => hand5Name({ cat: c, ranks: [14, 13], score: 0, cards: [] }).split(' · ')[0];
    const L = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush];
    const Rr = [Cat5.Straight, Cat5.Trips, Cat5.TwoPair, Cat5.Pair];
    this.paytable = new Paytable(
      hud.root,
      'CALL',
      L.map((c, i) => [n(c), `${RUS_PAYS[c]}:1`, i < 4 ? n(Rr[i]) : t('rus.ak'), i < 4 ? `${RUS_PAYS[Rr[i]]}:1` : '1:1']),
    );
  }

  protected cleanup() {
    this.picker.detach();
  }

  protected onSync() {
    this.picker.sync();
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < RUS.minBet) return t('rus.needAnte');
    if (!this.g.wallet.canAfford(a * 3)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    if (this.picker.active && this.advise) {
      const a = rusAdvice(this.advise.cards, this.advise.up);
      if (a.swap) this.picker.set(a.swap);
      return { id: 'swapGo', msg: t('rus.hintSwap') };
    }
    if (!this.advise) return null;
    const a = rusAdvice(this.advise.cards, this.advise.up);
    if (!this.advise.first) {
      const call = a.move === 'call' || eval5(this.advise.cards.slice(0, 5)).cat >= Cat5.Pair;
      return { id: call ? 'call' : 'fold', msg: call ? t('rus.hintCall') : t('rus.hintFold') };
    }
    if (a.move === 'swap') return { id: 'swap', msg: t('rus.hintSwap') };
    return { id: a.move, msg: a.move === 'call' ? t('rus.hintCall') : t('rus.hintFold') };
  }

  private refreshSwap() {
    const b = this.g.hud.root.querySelector<HTMLButtonElement>('.actions .vbtn[data-id="swapGo"]');
    if (b) b.disabled = this.picker.sel.size === 0;
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const ante = this.spots.amounts().ante;
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pPl = row(0, pz, 5, 0.58);
    const dPl = row(0, dz, 5, 0.58);
    let player: Card[] = [];
    let dealer: Card[] = [];
    let p3: Card3D[] = [];
    const d3: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      player.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false, { dur: 0.44 }).then((c) => (p3[i] = c)));
      await wait(0.15);
      jobs.push(this.cardsT.deal(dc, dPl[i], i === 4, { dur: 0.44 }).then((c) => (d3[i] = c)));
      await wait(0.15);
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.45);
      await wait(0.08);
    }
    await wait(0.4);
    const showTag = () => {
      this.clearTags();
      this.tag(hand5Name(player.length > 5 ? this.best(player) : eval5(player)), '', 0, pz + 0.52);
    };
    showTag();

    let paid = false;
    let first = true;
    let decision: string | null = null;
    while (decision === null) {
      this.advise = { cards: player, up: dealer[4], first };
      const opts = first
        ? [
            { id: 'fold', label: t('btn.fold'), color: 'red' as const, icon: 'fold' as const },
            { id: 'buy6', label: t('rus.buy6'), color: 'purple' as const, icon: 'deal' as const, enabled: wallet.canAfford(ante * 3) },
            { id: 'swap', label: t('rus.swap'), color: 'blue' as const, icon: 'redo' as const, enabled: wallet.canAfford(ante * 3) },
            { id: 'call', label: `${t('rus.call').charAt(0)}${t('rus.call').slice(1).toLowerCase()} 2×`, color: 'green' as const, icon: 'raise' as const, enabled: wallet.canAfford(ante * 2) },
          ]
        : [
            { id: 'fold', label: t('btn.fold'), color: 'red' as const, icon: 'fold' as const },
            { id: 'call', label: `${t('rus.call').charAt(0)}${t('rus.call').slice(1).toLowerCase()} 2×`, color: 'green' as const, icon: 'raise' as const, enabled: wallet.canAfford(ante * 2) },
          ];
      const pick = await this.choose(opts);
      if (pick === 'buy6') {
        await this.place('fee', ante);
        paid = true;
        first = false;
        const c = this.shoe.draw();
        player.push(c);
        const pl = row(0, pz, 6, 0.5);
        p3.forEach((x, i) => arcTo(x.obj, pl[i].pos, 0.3, 0.05));
        p3.push(await this.cardsT.deal(c, pl[5], true, { dur: 0.45 }));
        showTag();
      } else if (pick === 'swap') {
        this.picker.attach(p3, 4);
        sfx.click();
        this.g.hud.toast(t('rus.pickSwap'), 2000);
        const go = await this.choose([
          { id: 'back', label: t('rus.back'), color: 'dark', icon: 'close' },
          { id: 'swapGo', label: t('rus.swapGo'), color: 'green', icon: 'check', enabled: false },
        ]);
        const sel = [...this.picker.sel].sort((a, b) => a - b);
        this.picker.detach();
        if (go === 'back' || !sel.length) {
          p3.forEach((x, i) => arcTo(x.obj, pPl[i].pos, 0.15, 0.02));
          continue;
        }
        await this.place('fee', ante);
        paid = true;
        first = false;
        // exchanged cards fly back to the dealer, replacements are dealt face up
        const out = sel.map((i) => p3[i]);
        sfx.play('shove', { vol: 0.6 });
        await Promise.all(out.map((c, k) => arcTo(c.obj, new THREE.Vector3(c.obj.position.x, 0.4, dz - 1.2), 0.35, 0.2, 'power2.in', k * 0.05)));
        for (const c of out) {
          this.g.cards.destroy(c);
          this.cardsT.all.splice(this.cardsT.all.indexOf(c), 1);
        }
        for (const i of sel) {
          player[i] = this.shoe.draw();
          p3[i] = await this.cardsT.deal(player[i], pPl[i], true, { dur: 0.38 });
        }
        player = player.slice();
        p3 = p3.slice();
        showTag();
      } else decision = pick;
    }
    this.advise = null;
    const called = decision === 'call';
    if (called) await this.place('call', ante * 2);
    else {
      sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
    }
    await wait(0.25);
    for (let i = 0; i < 4; i++) await this.cardsT.flip(d3[i], 0.4);
    let res = settleRus(player, dealer, ante, called, paid);
    if (called && !res.qualifies) {
      this.tag(t('rus.noQualify'), 'dealer', 0, dz + 0.52);
      if (wallet.canAfford(ante) && res.player.cat >= Cat5.Pair) {
        const choice = await this.g.hud.prompt(t('rus.buyGameTitle'), t('rus.buyGameText', { n: this.moneyStr(ante) }), [
          { id: 'take', label: t('rus.takeAnte'), color: 'blue', icon: 'check' },
          { id: 'buy', label: t('rus.buyGame'), color: 'gold', icon: 'redo' },
        ]);
        if (choice === 'buy') {
          await this.place('fee', ante);
          const before = dealer.slice();
          dealer = dealerReplace(dealer, () => this.shoe.draw());
          const idx = before.findIndex((c, i) => c !== dealer[i]);
          const old = d3[idx];
          sfx.play('shove', { vol: 0.6 });
          await arcTo(old.obj, new THREE.Vector3(old.obj.position.x, 0.4, dz - 1.4), 0.35, 0.2, 'power2.in');
          this.g.cards.destroy(old);
          this.cardsT.all.splice(this.cardsT.all.indexOf(old), 1);
          d3[idx] = await this.cardsT.deal(dealer[idx], dPl[idx], true, { dur: 0.5 });
          await wait(0.3);
          this.clearTags();
          showTag();
          res = settleRus(player, dealer, ante, called, true);
          if (!res.qualifies) res.ret.ante = ante * 2;
        }
      }
    }
    this.clearTags();
    showTag();
    this.tag(res.qualifies ? hand5Name(res.dealer) : t('rus.noQualify'), 'dealer', 0, dz + 0.52);
    if (called && res.qualifies && res.cmp > 0) {
      const used = new Set(res.player.cards);
      highlightCards(this.g, p3.filter((c) => used.has(c.card!)));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat5.Straight ? 150 : 70);
    }
    const big = called && res.qualifies && res.cmp > 0 && res.player.cat >= Cat5.Straight ? hand5Name(res.player).toUpperCase() : undefined;
    await this.settle({ ante: res.ret.ante, call: res.ret.call, fee: 0 }, { big, folded: !called });
  }

  private best(cards: Card[]) {
    return settleRus(cards, cards.slice(0, 5), 0, false, false).player;
  }
}
