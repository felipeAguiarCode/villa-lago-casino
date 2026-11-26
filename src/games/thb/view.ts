import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { bestOf, Cat5 } from '../../core/eval5';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { betStreet, playPreflop, settleThb, THB } from './rules';

addStrings(
  {
    'thb.ante': 'ANTE',
    'thb.bonus': 'BONUS',
    'thb.flop': 'FLOP',
    'thb.turn': 'TURN',
    'thb.river': 'RIVER',
    'thb.print1': "TEXAS HOLD'EM BONUS",
    'thb.print2': 'Ante pays on a straight or better',
    'thb.print3': 'AA + DEALER AA PAYS 1000 TO 1',
    'thb.needAnte': 'Place a bet on ANTE',
    'thb.flopBet': 'Flop 2×',
    'thb.bet': 'Bet 1×',
    'thb.hintPlay': 'Strategy: PLAY (bet the flop)',
    'thb.hintFold': 'Strategy: FOLD',
    'thb.hintBet': 'Strategy: BET',
    'thb.hintCheck': 'Strategy: CHECK',
    'thb.aa': 'Pair of Aces',
    'thb.aaaa': 'AA + dealer AA',
    'thb.aks': 'AK suited',
    'thb.aqjs': 'AQ/AJ suited',
    'thb.ak': 'AK',
    'thb.jqk': 'JJ, QQ, KK',
    'thb.aqj': 'AQ/AJ',
    'thb.low': '22 – TT',
    'thb.rules': `
      <p>Texas Hold'em against the dealer. Bet the <b>Ante</b> (and optionally the <b>Bonus</b>). You and the dealer get two cards; five community cards follow.</p>
      <h4>Betting</h4>
      <p>Before the flop: <b>fold</b> (lose the Ante) or bet the <b>Flop</b> (2× the Ante). After the flop you may <b>bet the Turn</b> (1×) or check; after the turn you may <b>bet the River</b> (1×) or check.</p>
      <h4>Showdown</h4>
      <p>Best five of seven cards. If you win, the Flop, Turn and River bets pay 1:1 and the <b>Ante pays 1:1 only with a straight or better</b> (otherwise it pushes). Ties push; otherwise you lose them all.</p>
      <h4>Bonus</h4>
      <p>Pays on your two hole cards: AA with dealer AA 1000 · AA 30 · AK suited 25 · AQ/AJ suited 20 · AK 15 · JJ/QQ/KK 10 · AQ/AJ 5 · 22–TT 3.</p>`,
  },
  {
    'thb.print2': 'O Ante paga com sequência ou melhor',
    'thb.print3': 'AA + AA DO DEALER PAGA 1000 PARA 1',
    'thb.needAnte': 'Aposte no ANTE',
    'thb.flopBet': 'Flop 2×',
    'thb.bet': 'Apostar 1×',
    'thb.hintPlay': 'Estratégia: JOGAR (apostar o flop)',
    'thb.hintFold': 'Estratégia: DESISTIR',
    'thb.hintBet': 'Estratégia: APOSTAR',
    'thb.hintCheck': 'Estratégia: PASSAR',
    'thb.aa': 'Par de Ases',
    'thb.aaaa': 'AA + AA do dealer',
    'thb.aks': 'AK naipados',
    'thb.aqjs': 'AQ/AJ naipados',
    'thb.jqk': 'JJ, QQ, KK',
    'thb.rules': `
      <p>Texas Hold'em contra o dealer. Aposte no <b>Ante</b> (e, se quiser, no <b>Bonus</b>). Você e o dealer recebem duas cartas; depois vêm cinco comunitárias.</p>
      <h4>Apostas</h4>
      <p>Antes do flop: <b>desista</b> (perde o Ante) ou aposte o <b>Flop</b> (2× o Ante). Depois do flop você pode <b>apostar o Turn</b> (1×) ou passar; depois do turn, <b>apostar o River</b> (1×) ou passar.</p>
      <h4>Showdown</h4>
      <p>Melhores cinco de sete cartas. Se você vencer, Flop, Turn e River pagam 1:1 e o <b>Ante só paga 1:1 com sequência ou melhor</b> (senão empata). Empate devolve; senão você perde tudo.</p>
      <h4>Bonus</h4>
      <p>Paga pelas suas duas cartas: AA com AA do dealer 1000 · AA 30 · AK naipados 25 · AQ/AJ naipados 20 · AK 15 · JJ/QQ/KK 10 · AQ/AJ 5 · 22–TT 3.</p>`,
  },
);

const V = { dealer: 0.235, board: 0.395, print: 0.47, player: 0.555 };

export class ThbView extends TableGame {
  readonly id = 'thb';
  readonly title = "Texas Hold'em Bonus";
  protected readonly felt = 'thb' as const;
  private stageN: 'pre' | 'turn' | 'river' | null = null;
  private hole: Card[] = [];
  private board: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('thb.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'bonus', label: t('thb.bonus'), u: 0.5, v: 0.652, size: 0.52, max: 500 },
      { id: 'ante', label: t('thb.ante'), u: 0.14, v: 0.745, size: 0.48, max: THB.maxBet },
      { id: 'flop', label: t('thb.flop'), sub: '2×', u: 0.38, v: 0.745, size: 0.48, auto: true },
      { id: 'turn', label: t('thb.turn'), u: 0.62, v: 0.745, size: 0.48, auto: true },
      { id: 'river', label: t('thb.river'), u: 0.86, v: 0.745, size: 0.48, auto: true },
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
          { text: t('thb.print1'), y: 80, R: 1200, font: FONT.title(52), spacing: 3 },
          { text: t('thb.print2'), y: 138, R: 1200, font: FONT.italic(38), color: INK_SOFT },
          { text: t('thb.print3'), y: 192, R: 1200, font: FONT.title(28), color: GOLD, spacing: 4 },
        ],
        220,
      ),
      0.5,
      V.print,
      3.25,
    );
    this.paytable = new Paytable(
      hud.root,
      'BONUS',
      [
        [t('thb.aaaa'), '1000:1', t('thb.ak'), '15:1'],
        [t('thb.aa'), '30:1', t('thb.jqk'), '10:1'],
        [t('thb.aks'), '25:1', t('thb.aqj'), '5:1'],
        [t('thb.aqjs'), '20:1', t('thb.low'), '3:1'],
      ],
    );
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < THB.minBet) return t('thb.needAnte');
    if (!this.g.wallet.canAfford(this.spots.total + a * 2)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    if (this.stageN === 'pre') {
      const p = playPreflop(this.hole);
      return { id: p ? 'flop' : 'fold', msg: p ? t('thb.hintPlay') : t('thb.hintFold') };
    }
    if (this.stageN === 'turn' || this.stageN === 'river') {
      const b = betStreet(this.hole, this.board);
      return { id: b ? 'bet' : 'check', msg: b ? t('thb.hintBet') : t('thb.hintCheck') };
    }
    return null;
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const bets = this.spots.amounts();
    const ante = bets.ante;
    const z = (v: number) => stage.screenToTable(0.5, v).z;
    const hole: Card[] = [];
    const dealer: Card[] = [];
    const board: Card[] = [];
    const h3: Card3D[] = [];
    const d3: Card3D[] = [];
    const b3: Card3D[] = [];
    const pPl = row(0, z(V.player), 2, 0.7);
    const dPl = row(0, z(V.dealer), 2, 0.7);
    const bPl = row(0, z(V.board), 5, 0.66);
    this.hole = hole;
    this.board = board;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 2; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      hole.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false).then((c) => (h3[i] = c)));
      await wait(0.22);
      jobs.push(this.cardsT.deal(dc, dPl[i], false).then((c) => (d3[i] = c)));
      await wait(0.22);
    }
    await Promise.all(jobs);
    for (const c of h3) {
      this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await wait(0.45);
    const dealBoard = async (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const c = this.shoe.draw();
        board.push(c);
        b3[i] = await this.cardsT.deal(c, bPl[i], true, { dur: 0.45 });
      }
      this.clearTags();
      if (board.length >= 3) this.tag(hand5Name(bestOf([...hole, ...board])), '', 0, z(V.player) + 0.52);
    };

    this.stageN = 'pre';
    const pre = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'flop', label: t('thb.flopBet'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante * 2) },
    ]);
    this.stageN = null;
    let folded = pre === 'fold';
    if (folded) {
      sfx.play('shove', { vol: 0.6 });
      for (const c of h3) this.cardsT.flip(c, 0.4);
    } else await this.place('flop', ante * 2);

    let turn = 0;
    let river = 0;
    await dealBoard(0, 3);
    if (!folded) {
      this.stageN = 'turn';
      const p = await this.choose([
        { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
        { id: 'bet', label: t('thb.bet'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante) },
      ]);
      this.stageN = null;
      if (p === 'bet') {
        turn = ante;
        await this.place('turn', ante);
      }
    }
    await dealBoard(3, 4);
    if (!folded) {
      this.stageN = 'river';
      const p = await this.choose([
        { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
        { id: 'bet', label: t('thb.bet'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante) },
      ]);
      this.stageN = null;
      if (p === 'bet') {
        river = ante;
        await this.place('river', ante);
      }
    }
    await dealBoard(4, 5);
    await wait(0.3);
    for (const c of d3) await this.cardsT.flip(c, 0.5);
    const res = settleThb(hole, dealer, board, { ante, flop: folded ? 0 : ante * 2, turn, river, bonus: bets.bonus ?? 0 }, folded);
    this.tag(hand5Name(res.dealer), 'dealer', 0, z(V.dealer) + 0.52);
    if ((!folded && res.cmp > 0) || res.ret.bonus > 0) {
      const used = new Set(res.player.cards);
      highlightCards(this.g, [...h3, ...b3].filter((c) => used.has(c.card!)));
      fx.burst(new THREE.Vector3(0, 0.3, z(V.player)), res.player.cat >= Cat5.Straight ? 150 : 70);
    }
    folded = folded && !(bets.bonus > 0 && res.ret.bonus > 0);
    const big = !folded && res.cmp > 0 && res.player.cat >= Cat5.Straight ? hand5Name(res.player).toUpperCase() : undefined;
    await this.settle(res.ret, { big, folded });
  }
}
