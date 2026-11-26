import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { best4, Cat4 } from '../../core/eval4';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand4Name } from '../fourcard/view';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { C4, c4Advice, canPlay3x, settleC4 } from './rules';

addStrings(
  {
    'c4.ante': 'ANTE',
    'c4.super': 'SUPER BONUS',
    'c4.queens': 'QUEENS UP',
    'c4.play': 'PLAY',
    'c4.print1': 'CRAZY 4 POKER',
    'c4.print2': 'Best four of five · Dealer opens with King high',
    'c4.print3': 'PLAY 3× WITH A PAIR OF ACES OR BETTER',
    'c4.needAnte': 'Bet the ANTE (the SUPER BONUS matches it)',
    'c4.noOpen': 'DEALER DOES NOT OPEN',
    'c4.hint3': 'Strategy: PLAY 3×',
    'c4.hint1': 'Strategy: PLAY 1× (K-Q-8-4 or better)',
    'c4.hintFold': 'Strategy: FOLD',
    'c4.fourAces': 'Four Aces',
    'c4.qq': 'Pair of Queens+',
    'c4.rules': `
      <p>Make the best <b>four-card</b> hand from five cards. Bet the <b>Ante</b>; an equal <b>Super Bonus</b> is made with it. <b>Queens Up</b> is optional.</p>
      <h4>Play</h4>
      <p>After seeing your cards, <b>fold</b> (lose Ante and Super Bonus) or <b>play 1×</b> the Ante — or <b>3×</b> with a pair of Aces or better.</p>
      <h4>Dealer opens with King high</h4>
      <p>If the dealer doesn't open, the Ante pushes and Play pays 1:1. Otherwise the better hand wins Ante and Play 1:1; ties push.</p>
      <h4>Super Bonus</h4>
      <p>Four Aces 200 · Four of a kind 30 · Straight flush 15 · Three of a kind 2 · Flush 3:2 · Straight 1 — paid whatever the dealer holds. With less than a straight it pushes, unless the dealer opens and beats you.</p>
      <h4>Queens Up</h4><p>Four of a kind 50 · Straight flush 40 · Three of a kind 7 · Flush 4 · Straight 3 · Two pair 2 · Pair of Queens or better 1.</p>`,
  },
  {
    'c4.print2': 'Melhores quatro de cinco · Dealer abre com Rei alto',
    'c4.print3': 'JOGUE 3× COM PAR DE ASES OU MELHOR',
    'c4.needAnte': 'Aposte no ANTE (o SUPER BONUS acompanha)',
    'c4.noOpen': 'DEALER NÃO ABRE',
    'c4.hint3': 'Estratégia: JOGAR 3×',
    'c4.hint1': 'Estratégia: JOGAR 1× (K-Q-8-4 ou melhor)',
    'c4.hintFold': 'Estratégia: DESISTIR',
    'c4.fourAces': 'Quatro Ases',
    'c4.qq': 'Par de Damas+',
    'c4.rules': `
      <p>Forme a melhor mão de <b>quatro cartas</b> entre cinco. Aposte no <b>Ante</b>; um <b>Super Bonus</b> igual é feito junto. <b>Queens Up</b> é opcional.</p>
      <h4>Jogar</h4>
      <p>Depois de ver suas cartas, <b>desista</b> (perde Ante e Super Bonus) ou <b>jogue 1×</b> o Ante — ou <b>3×</b> com par de Ases ou melhor.</p>
      <h4>Dealer abre com Rei alto</h4>
      <p>Se o dealer não abrir, o Ante empata e o Play paga 1:1. Senão a melhor mão ganha Ante e Play 1:1; empate devolve.</p>
      <h4>Super Bonus</h4>
      <p>Quatro Ases 200 · Quadra 30 · Straight flush 15 · Trinca 2 · Flush 3:2 · Sequência 1 — pago seja qual for a mão do dealer. Abaixo de sequência empata, a não ser que o dealer abra e vença você.</p>
      <h4>Queens Up</h4><p>Quadra 50 · Straight flush 40 · Trinca 7 · Flush 4 · Sequência 3 · Dois pares 2 · Par de Damas ou melhor 1.</p>`,
  },
);

const V = { dealer: 0.245, print: 0.39, player: 0.53 };

export class Crazy4View extends TableGame {
  readonly id = 'crazy4';
  readonly title = 'Crazy 4 Poker';
  protected readonly felt = 'crazy4' as const;
  private mine: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('c4.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'queensUp', label: t('c4.queens'), u: 0.5, v: 0.652, size: 0.54, max: 500 },
      { id: 'ante', label: t('c4.ante'), u: 0.2, v: 0.745, size: 0.54, max: C4.maxBet },
      { id: 'superBonus', label: t('c4.super'), u: 0.5, v: 0.745, size: 0.54, mirror: 'ante' },
      { id: 'play', label: t('c4.play'), sub: '1× / 3×', u: 0.8, v: 0.745, size: 0.54, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25, superBonus: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('c4.print1'), y: 112, R: 900, font: FONT.title(70), spacing: 6 },
          { text: t('c4.print2'), y: 180, R: 900, font: FONT.italic(40), color: INK_SOFT },
          { text: t('c4.print3'), y: 266, R: 900, font: FONT.title(30), color: GOLD, spacing: 4 },
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
    const n = (c: Cat4) => hand4Name({ cat: c, ranks: [14], score: 0, cards: [] });
    this.paytable = new Paytable(
      hud.root,
      '',
      [
        [t('c4.fourAces'), '200:1', '50:1'],
        [n(Cat4.Quads), '30:1', '50:1'],
        [n(Cat4.StraightFlush), '15:1', '40:1'],
        [n(Cat4.Trips), '2:1', '7:1'],
        [n(Cat4.Flush), '3:2', '4:1'],
        [n(Cat4.Straight), '1:1', '3:1'],
        [n(Cat4.TwoPair), '—', '2:1'],
        [t('c4.qq'), '—', '1:1'],
      ],
      { head: ['', 'SUPER BONUS', 'QUEENS UP'] },
    );
  }

  protected validate() {
    const a = this.spots.amounts();
    if ((a.ante ?? 0) < C4.minBet) return t('c4.needAnte');
    if (!this.g.wallet.canAfford(this.spots.total + a.ante * 3)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    if (!this.mine.length) return null;
    const m = c4Advice(this.mine);
    return m === 3 ? { id: 'play3', msg: t('c4.hint3') } : m === 1 ? { id: 'play1', msg: t('c4.hint1') } : { id: 'fold', msg: t('c4.hintFold') };
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pPl = row(0, pz, 5, 0.56);
    const dPl = row(0, dz, 5, 0.56);
    const player: Card[] = [];
    const dealer: Card[] = [];
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      player.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false, { dur: 0.44 }).then((c) => (p3[i] = c)));
      await wait(0.15);
      jobs.push(this.cardsT.deal(dc, dPl[i], false, { dur: 0.44 }).then((c) => (d3[i] = c)));
      await wait(0.15);
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.45);
      await wait(0.08);
    }
    await wait(0.4);
    const ph0 = best4(player);
    this.tag(hand4Name(ph0), '', 0, pz + 0.52);
    this.mine = player;
    const ante = bets.ante;
    const pick = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'play1', label: '1×', color: 'blue', text: '1×', enabled: wallet.canAfford(ante) },
      { id: 'play3', label: '3×', color: 'green', text: '3×', enabled: canPlay3x(ph0) && wallet.canAfford(ante * 3) },
    ]);
    this.mine = [];
    const mult = pick === 'fold' ? 0 : Number(pick.slice(4));
    if (mult) await this.place('play', ante * mult);
    else {
      sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
    }
    await wait(0.25);
    for (const c of d3) await this.cardsT.flip(c, 0.4);
    const res = settleC4(player, dealer, { ante, superBonus: bets.superBonus, queensUp: bets.queensUp ?? 0 }, ante * mult);
    this.tag(res.opens ? hand4Name(res.dealer) : t('c4.noOpen'), 'dealer', 0, dz + 0.52);
    if ((mult && (res.cmp > 0 || !res.opens)) || res.ret.queensUp > 0) {
      const used = new Set(res.player.cards);
      highlightCards(this.g, p3.filter((c) => used.has(c.card!)));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat4.Straight ? 140 : 70);
    }
    const big = mult && res.ret.superBonus > bets.superBonus ? hand4Name(res.player).toUpperCase() : undefined;
    await this.settle(res.ret, { big, folded: !mult && !(res.ret.queensUp > 0) });
  }
}
