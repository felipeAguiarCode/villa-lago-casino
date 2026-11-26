import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, suitOf, rankOf, SUIT_SYMBOL, type Card } from '../../core/cards';
import { slideCard, wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import type { BtnSpec } from '../../ui/hud';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { bestFlush, hcfAdvice, HCF, maxRaise, settleHcf, type FlushHand } from './rules';

addStrings(
  {
    'hcf.ante': 'ANTE',
    'hcf.raise': 'RAISE',
    'hcf.flush': 'FLUSH',
    'hcf.sflush': 'STR. FLUSH',
    'hcf.print1': 'HIGH CARD FLUSH',
    'hcf.print2': 'Most cards of one suit wins',
    'hcf.print3': 'DEALER QUALIFIES WITH A 9-HIGH 3-CARD FLUSH',
    'hcf.needAnte': 'Place a bet on ANTE',
    'hcf.noQualify': 'DEALER DOES NOT QUALIFY',
    'hcf.cards': '{n}-card flush · {r} high',
    'hcf.hintRaise': 'Strategy: RAISE {n}×',
    'hcf.hintFold': 'Strategy: FOLD (below a T-8-6 flush)',
    'hcf.raiseN': 'Raise {n}×',
    'hcf.len': '{n} cards',
    'hcf.rules': `
      <p>Seven cards each; the hand is your <b>longest flush</b> (most cards of one suit). A longer flush always wins; equal lengths compare the high cards of the flush.</p>
      <h4>Raise</h4>
      <p>After seeing your cards, <b>fold</b> (lose the Ante) or <b>raise</b>: up to 1× with a flush of 2–4 cards, 2× with 5 cards, 3× with 6 or 7 cards.</p>
      <h4>Dealer qualifies with a 3-card flush, 9 high</h4>
      <p>If he doesn't, the Ante pays 1:1 and the Raise pushes. Otherwise the better flush wins both bets 1:1; ties push.</p>
      <h4>Side bets</h4>
      <p><b>Flush</b>: 7 cards 300 · 6 cards 100 · 5 cards 10 · 4 cards 1. <b>Straight Flush</b>: 7 cards 8000 · 6 cards 1000 · 5 cards 100 · 4 cards 60 · 3 cards 7.</p>`,
  },
  {
    'hcf.sflush': 'STR. FLUSH',
    'hcf.print2': 'Vence quem tiver mais cartas do mesmo naipe',
    'hcf.print3': 'DEALER QUALIFICA COM FLUSH DE 3 CARTAS 9 ALTO',
    'hcf.needAnte': 'Aposte no ANTE',
    'hcf.noQualify': 'DEALER NÃO QUALIFICA',
    'hcf.cards': 'Flush de {n} cartas · {r} alto',
    'hcf.hintRaise': 'Estratégia: AUMENTAR {n}×',
    'hcf.hintFold': 'Estratégia: DESISTIR (abaixo de flush T-8-6)',
    'hcf.raiseN': 'Aumentar {n}×',
    'hcf.len': '{n} cartas',
    'hcf.rules': `
      <p>Sete cartas para cada um; a mão é o seu <b>maior flush</b> (mais cartas do mesmo naipe). Flush mais longo sempre vence; tamanhos iguais comparam as cartas altas do flush.</p>
      <h4>Aumentar</h4>
      <p>Depois de ver suas cartas, <b>desista</b> (perde o Ante) ou <b>aumente</b>: até 1× com flush de 2–4 cartas, 2× com 5 cartas, 3× com 6 ou 7.</p>
      <h4>Dealer qualifica com flush de 3 cartas, 9 alto</h4>
      <p>Se não qualificar, o Ante paga 1:1 e o aumento empata. Senão o melhor flush ganha as duas apostas 1:1; empate devolve.</p>
      <h4>Apostas laterais</h4>
      <p><b>Flush</b>: 7 cartas 300 · 6 cartas 100 · 5 cartas 10 · 4 cartas 1. <b>Straight Flush</b>: 7 cartas 8000 · 6 cartas 1000 · 5 cartas 100 · 4 cartas 60 · 3 cartas 7.</p>`,
  },
);

const V = { dealer: 0.245, print: 0.39, player: 0.53 };
const GAP = 0.42;

export const flushName = (h: FlushHand) => t('hcf.cards', { n: h.ranks.length, r: `${rankLabel(h.ranks[0])}${SUIT_SYMBOL[h.suit]}` });

/** Order: the flush suit first (high to low), then the other cards grouped by suit. */
function sortForFlush(cards: Card[], h: FlushHand): Card[] {
  return [...cards].sort((a, b) => {
    const fa = suitOf(a) === h.suit ? 0 : 1;
    const fb = suitOf(b) === h.suit ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (suitOf(a) !== suitOf(b)) return suitOf(a) - suitOf(b);
    return rankOf(b) - rankOf(a);
  });
}

export class HcfView extends TableGame {
  readonly id = 'hcf';
  readonly title = 'High Card Flush';
  protected readonly felt = 'hcf' as const;
  private mine: FlushHand | null = null;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('hcf.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'flush', label: t('hcf.flush'), u: 0.3, v: 0.652, size: 0.54, max: 500 },
      { id: 'sflush', label: t('hcf.sflush'), u: 0.7, v: 0.652, size: 0.54, max: 500 },
      { id: 'ante', label: t('hcf.ante'), u: 0.3, v: 0.745, size: 0.6, max: HCF.maxBet },
      { id: 'raise', label: t('hcf.raise'), sub: '1× – 3×', u: 0.7, v: 0.745, size: 0.6, auto: true },
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
          { text: t('hcf.print1'), y: 112, R: 900, font: FONT.title(70), spacing: 6 },
          { text: t('hcf.print2'), y: 180, R: 900, font: FONT.italic(42), color: INK_SOFT },
          { text: t('hcf.print3'), y: 266, R: 900, font: FONT.title(26), color: GOLD, spacing: 3 },
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
    const L = (n: number) => t('hcf.len', { n });
    this.paytable = new Paytable(
      hud.root,
      '',
      [
        [L(7), '300:1', '8000:1'],
        [L(6), '100:1', '1000:1'],
        [L(5), '10:1', '100:1'],
        [L(4), '1:1', '60:1'],
        [L(3), '—', '7:1'],
      ],
      { head: ['', 'FLUSH', 'STRAIGHT FLUSH'] },
    );
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < HCF.minBet) return t('hcf.needAnte');
    if (!this.g.wallet.canAfford(this.spots.total + a * 3)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    if (!this.mine) return null;
    const m = hcfAdvice(this.mine);
    return m ? { id: `raise${m}`, msg: t('hcf.hintRaise', { n: m }) } : { id: 'fold', msg: t('hcf.hintFold') };
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pPl = row(0, pz, 7, GAP);
    const dPl = row(0, dz, 7, GAP);
    let player: Card[] = [];
    let dealer: Card[] = [];
    let p3: Card3D[] = [];
    let d3: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 7; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      player.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false, { dur: 0.4 }).then((c) => (p3[i] = c)));
      await wait(0.11);
      jobs.push(this.cardsT.deal(dc, dPl[i], false, { dur: 0.4 }).then((c) => (d3[i] = c)));
      await wait(0.11);
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.42);
      await wait(0.06);
    }
    await wait(0.3);
    // the player sorts the hand: the flush suit slides to the left
    const ph0 = bestFlush(player);
    const regroup = async (cards: Card[], c3: Card3D[], h: FlushHand, places: typeof pPl) => {
      const sorted = sortForFlush(cards, h);
      const sorted3 = sorted.map((c) => c3[cards.indexOf(c)]);
      this.g.sfx.play('fan', { vol: 0.4 });
      await Promise.all(sorted3.map((c, i) => slideCard(c, places[i], 0.32, 0.08)));
      return { cards: sorted, c3: sorted3 };
    };
    ({ cards: player, c3: p3 } = await regroup(player, p3, ph0, pPl));
    highlightCards(this.g, p3.slice(0, ph0.ranks.length), '#9fd0ff');
    this.tag(flushName(ph0), '', 0, pz + 0.52);
    this.mine = ph0;
    const ante = bets.ante;
    const top = maxRaise(ph0.ranks.length);
    const opts: Omit<BtnSpec, 'onClick'>[] = [{ id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' }];
    const colors: BtnSpec['color'][] = ['blue', 'gold', 'green'];
    for (let k = 1; k <= top; k++) opts.push({ id: `raise${k}`, label: t('hcf.raiseN', { n: k }), color: colors[k - 1], text: `${k}×`, enabled: wallet.canAfford(ante * k) });
    const pick = await this.choose(opts);
    this.mine = null;
    const mult = pick === 'fold' ? 0 : Number(pick.slice(5));
    if (mult) await this.place('raise', ante * mult);
    else {
      sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
    }
    await wait(0.25);
    for (const c of d3) {
      this.cardsT.flip(c, 0.38);
      await wait(0.07);
    }
    await wait(0.4);
    const dh0 = bestFlush(dealer);
    ({ cards: dealer, c3: d3 } = await regroup(dealer, d3, dh0, dPl));
    const res = settleHcf(player, dealer, { ante, flush: bets.flush ?? 0, sflush: bets.sflush ?? 0 }, ante * mult);
    this.tag(res.qualifies ? flushName(res.dealer) : t('hcf.noQualify'), 'dealer', 0, dz + 0.52);
    if ((mult && res.cmp > 0) || res.ret.flush > 0 || res.ret.sflush > 0) {
      highlightCards(this.g, p3.slice(0, res.player.ranks.length));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.ranks.length >= 5 ? 150 : 70);
    }
    if (res.ret.flush > 0) this.paytable?.highlight(7 - res.player.ranks.length);
    const big = res.player.ranks.length >= 5 && (res.ret.flush > 0 || (mult && res.cmp > 0)) ? flushName(res.player).toUpperCase() : undefined;
    await this.settle(res.ret, { big, folded: !mult && !res.ret.flush && !res.ret.sflush });
    this.paytable?.highlight(null);
  }
}
