import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { Cat3 } from '../../core/eval3';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import { hand3Name } from '../threecard/view';
import type { GameCtx } from '../types';
import { H3, raiseFirst, raiseSecond, settleH3 } from './rules';

addStrings(
  {
    'h3.ante': 'ANTE',
    'h3.raise': 'RAISE',
    'h3.pairSuited': 'PAIR / SUITED',
    'h3.straightUp': 'STRAIGHT UP',
    'h3.print1': "3 CARD HOLD'EM",
    'h3.print2': 'Best three cards of five · Dealer qualifies with 4-4',
    'h3.print3': 'RAISE UP TO 2× THE ANTE',
    'h3.needAnte': 'Place a bet on ANTE',
    'h3.noQualify': 'DEALER DOES NOT QUALIFY',
    'h3.hintRaise': 'Strategy: RAISE',
    'h3.hintFold': 'Strategy: FOLD',
    'h3.hintCheck': 'Strategy: CHECK',
    'h3.akqp': 'AKQ suited + pair',
    'h3.akq': 'AKQ suited',
    'h3.aks': 'AK suited',
    'h3.pair': 'Pair 2–Q',
    'h3.suited': 'Suited',
    'h3.rules': `
      <p>Hold'em played with <b>three-card</b> hands. You and the dealer get two pocket cards; three community cards are shared. Each side makes the best three-card hand out of five (playing the board is allowed).</p>
      <h4>Hand ranks</h4><p>Straight flush · Three of a kind · Straight · Flush · Pair · High card.</p>
      <h4>Betting</h4>
      <p>After your pocket cards and the first community card: <b>fold</b> or <b>raise 1×</b> the Ante. After the second community card you may <b>raise 1× again</b> or check.</p>
      <h4>Showdown</h4>
      <p>The dealer qualifies with a <b>pair of 4s</b> or better. Win against a qualifying dealer: Ante and raises pay 1:1. Win against a non-qualifying dealer: raises pay 1:1 and the Ante pushes. Ties push; otherwise you lose.</p>
      <h4>Side bets</h4>
      <p><b>Pair or Suited</b> (pocket cards): AK suited 30 · AA 20 · KK 10 · Pair 2–Q 4 · Suited 1. <b>Straight or Up</b> (best three of five): AKQ suited with a pair 100 · AKQ suited 40 · Straight flush 10 · Three of a kind 9 · Straight 1.</p>`,
  },
  {
    'h3.print2': 'Melhores três cartas de cinco · Dealer qualifica com 4-4',
    'h3.print3': 'AUMENTE ATÉ 2× O ANTE',
    'h3.needAnte': 'Aposte no ANTE',
    'h3.noQualify': 'DEALER NÃO QUALIFICA',
    'h3.hintRaise': 'Estratégia: AUMENTAR',
    'h3.hintFold': 'Estratégia: DESISTIR',
    'h3.hintCheck': 'Estratégia: PASSAR',
    'h3.akqp': 'AKQ naipados + par',
    'h3.akq': 'AKQ naipados',
    'h3.aks': 'AK naipados',
    'h3.pair': 'Par 2–Q',
    'h3.suited': 'Naipados',
    'h3.rules': `
      <p>Hold'em com mãos de <b>três cartas</b>. Você e o dealer recebem duas cartas; três cartas comunitárias são compartilhadas. Cada lado forma a melhor mão de três cartas entre cinco (vale jogar só com a mesa).</p>
      <h4>Mãos</h4><p>Straight flush · Trinca · Sequência · Flush · Par · Carta alta.</p>
      <h4>Apostas</h4>
      <p>Depois das suas cartas e da primeira comunitária: <b>desista</b> ou <b>aumente 1×</b> o Ante. Depois da segunda comunitária você pode <b>aumentar 1× de novo</b> ou passar.</p>
      <h4>Showdown</h4>
      <p>O dealer qualifica com <b>par de 4</b> ou melhor. Vencer um dealer que qualificou: Ante e aumentos pagam 1:1. Vencer um dealer que não qualificou: aumentos pagam 1:1 e o Ante empata. Empate devolve; senão você perde.</p>
      <h4>Apostas laterais</h4>
      <p><b>Pair or Suited</b> (suas duas cartas): AK naipados 30 · AA 20 · KK 10 · Par 2–Q 4 · Naipados 1. <b>Straight or Up</b> (melhores três de cinco): AKQ naipados com par 100 · AKQ naipados 40 · Straight flush 10 · Trinca 9 · Sequência 1.</p>`,
  },
);

const V = { dealer: 0.235, board: 0.39, print: 0.475, player: 0.565 };

export class Holdem3View extends TableGame {
  readonly id = 'holdem3';
  readonly title = "3 Card Hold'em";
  protected readonly felt = 'holdem3' as const;
  private stageN: 1 | 2 | null = null;
  private pocket: Card[] = [];
  private board: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('h3.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'pairSuited', label: t('h3.pairSuited'), u: 0.29, v: 0.655, size: 0.56, max: 500 },
      { id: 'straightUp', label: t('h3.straightUp'), u: 0.71, v: 0.655, size: 0.56, max: 500 },
      { id: 'ante', label: t('h3.ante'), u: 0.3, v: 0.75, size: 0.6, max: H3.maxBet },
      { id: 'raise', label: t('h3.raise'), u: 0.7, v: 0.75, size: 0.6, auto: true },
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
          { text: t('h3.print1'), y: 84, R: 1200, font: FONT.title(58), spacing: 4 },
          { text: t('h3.print2'), y: 146, R: 1200, font: FONT.italic(38), color: INK_SOFT },
          { text: t('h3.print3'), y: 204, R: 1200, font: FONT.title(30), color: GOLD, spacing: 5 },
        ],
        230,
      ),
      0.5,
      V.print,
      3.25,
    );
    this.paytable = new Paytable(
      hud.root,
      '',
      [
        [t('h3.akqp'), '100:1', t('h3.aks'), '30:1'],
        [t('h3.akq'), '40:1', 'AA', '20:1'],
        [t('hand.straightFlush'), '10:1', 'KK', '10:1'],
        [t('hand.trips'), '9:1', t('h3.pair'), '4:1'],
        [t('hand.straight'), '1:1', t('h3.suited'), '1:1'],
      ],
      { head: ['STRAIGHT UP', '', 'PAIR / SUITED', ''] },
    );
  }

  protected validate() {
    if ((this.spots.amounts().ante ?? 0) < H3.minBet) return t('h3.needAnte');
    return '';
  }

  protected advice() {
    if (this.stageN === 1) {
      const r = raiseFirst(this.pocket, this.board[0]);
      return { id: r ? 'raise' : 'fold', msg: r ? t('h3.hintRaise') : t('h3.hintFold') };
    }
    if (this.stageN === 2) {
      const r = raiseSecond(this.pocket, this.board.slice(0, 2));
      return { id: r ? 'raise' : 'check', msg: r ? t('h3.hintRaise') : t('h3.hintCheck') };
    }
    return null;
  }

  protected async playRound() {
    const { stage, wallet, fx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const bz = stage.screenToTable(0.5, V.board).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pocket: Card[] = [];
    const dealer: Card[] = [];
    const board: Card[] = [];
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    const b3: Card3D[] = [];
    const pPl = row(0, pz, 2, 0.72);
    const dPl = row(0, dz, 2, 0.72);
    const bPl = row(0, bz, 3, 0.72);
    this.pocket = pocket;
    this.board = board;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 2; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      pocket.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false).then((c) => (p3[i] = c)));
      await wait(0.2);
      jobs.push(this.cardsT.deal(dc, dPl[i], false).then((c) => (d3[i] = c)));
      await wait(0.2);
    }
    for (let i = 0; i < 3; i++) {
      const c = this.shoe.draw();
      board.push(c);
      jobs.push(this.cardsT.deal(c, bPl[i], i === 0).then((x) => (b3[i] = x)));
      await wait(0.2);
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await wait(0.45);
    const ante = bets.ante;
    let raise = 0;
    let folded = false;
    this.stageN = 1;
    const p1 = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'raise', label: t('btn.raise'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante) },
    ]);
    this.stageN = null;
    if (p1 === 'fold') {
      folded = true;
      this.g.sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
    } else {
      await this.place('raise', ante);
      raise = ante;
    }
    await this.cardsT.flip(b3[1], 0.55);
    if (!folded) {
      this.stageN = 2;
      const p2 = await this.choose([
        { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
        { id: 'raise', label: t('btn.raise'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante) },
      ]);
      this.stageN = null;
      if (p2 === 'raise') {
        await this.place('raise', ante);
        raise += ante;
      }
    }
    await this.cardsT.flip(b3[2], 0.55);
    await wait(0.2);
    for (const c of d3) await this.cardsT.flip(c, 0.5);
    const res = settleH3(pocket, dealer, board, { ante, pairSuited: bets.pairSuited ?? 0, straightUp: bets.straightUp ?? 0 }, raise, folded);
    this.tag(hand3Name(res.player), '', 0, pz + 0.52);
    this.tag(res.qualifies ? hand3Name(res.dealer) : t('h3.noQualify'), 'dealer', 0, dz + 0.52);
    if ((!folded && res.cmp > 0) || res.ret.straightUp > 0 || res.ret.pairSuited > 0) {
      const used = new Set(res.player.cards);
      highlightCards(this.g, [...p3, ...b3].filter((c) => used.has(c.card!)));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat3.Straight ? 130 : 70);
    }
    const big = !folded && res.cmp > 0 && res.player.cat >= Cat3.Straight ? hand3Name(res.player).toUpperCase() : undefined;
    await this.settle(res.ret, { big, folded });
  }
}
