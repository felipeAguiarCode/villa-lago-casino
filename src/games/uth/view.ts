import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { bestOf, Cat5 } from '../../core/eval5';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { BLIND_PAYS, flopRaise, preflopRaise, riverBet, settleUth, TRIPS_PAYS, UTH } from './rules';

addStrings(
  {
    'uth.ante': 'ANTE',
    'uth.blind': 'BLIND',
    'uth.trips': 'TRIPS',
    'uth.play': 'PLAY',
    'uth.print1': "ULTIMATE TEXAS HOLD'EM",
    'uth.print2': 'Dealer needs a pair to open',
    'uth.needAnte': 'Bet the ANTE (the BLIND matches it)',
    'uth.noQualify': 'DEALER DOES NOT OPEN',
    'uth.hintBet': 'Strategy: BET',
    'uth.hintCheck': 'Strategy: CHECK',
    'uth.hintFold': 'Strategy: FOLD',
    'uth.rules': `
      <p>Texas Hold'em against the dealer. Bet the <b>Ante</b> — the <b>Blind</b> matches it automatically — and optionally <b>Trips</b>.</p>
      <h4>One raise per hand</h4>
      <p>Before the flop: check or bet <b>4×</b> or <b>3×</b> the Ante on Play. After the flop: check or bet <b>2×</b>. After the river: bet <b>1×</b> or fold. Once you bet, you just watch the rest.</p>
      <h4>Showdown</h4>
      <p>Best five cards out of your two plus the five on the board. The dealer needs a <b>pair</b> to open: if not, the Ante pushes. A winning hand pays Play 1:1, Ante 1:1 and the Blind by the table (Royal 500 · Straight flush 50 · Quads 10 · Full house 3 · Flush 3:2 · Straight 1; smaller hands push the Blind).</p>
      <h4>Trips</h4>
      <p>Pays on your hand alone: Royal 50 · Straight flush 40 · Quads 30 · Full house 8 · Flush 7 · Straight 4 · Trips 3.</p>`,
  },
  {
    'uth.print2': 'Dealer precisa de um par para abrir',
    'uth.needAnte': 'Aposte no ANTE (o BLIND acompanha)',
    'uth.noQualify': 'DEALER NÃO ABRE',
    'uth.hintBet': 'Estratégia: APOSTAR',
    'uth.hintCheck': 'Estratégia: PASSAR',
    'uth.hintFold': 'Estratégia: DESISTIR',
    'uth.rules': `
      <p>Texas Hold'em contra o dealer. Aposte no <b>Ante</b> — o <b>Blind</b> acompanha automaticamente — e, se quiser, no <b>Trips</b>.</p>
      <h4>Uma aposta por mão</h4>
      <p>Antes do flop: passe ou aposte <b>4×</b> ou <b>3×</b> o Ante no Play. Depois do flop: passe ou aposte <b>2×</b>. Depois do river: aposte <b>1×</b> ou desista. Depois de apostar, é só assistir.</p>
      <h4>Showdown</h4>
      <p>Melhores cinco cartas entre as suas duas e as cinco da mesa. O dealer precisa de um <b>par</b> para abrir: se não abrir, o Ante empata. Mão vencedora paga Play 1:1, Ante 1:1 e o Blind pela tabela (Royal 500 · Straight flush 50 · Quadra 10 · Full house 3 · Flush 3:2 · Sequência 1; mãos menores empatam o Blind).</p>
      <h4>Trips</h4>
      <p>Paga só pela sua mão: Royal 50 · Straight flush 40 · Quadra 30 · Full house 8 · Flush 7 · Sequência 4 · Trinca 3.</p>`,
  },
);

const V = { dealer: 0.235, board: 0.395, print: 0.47, player: 0.555 };

export class UthView extends TableGame {
  readonly id = 'uth';
  readonly title = "Ultimate Texas Hold'em";
  protected readonly felt = 'uth' as const;
  private stage3: 'pre' | 'flop' | 'river' | null = null;
  private hole: Card[] = [];
  private board: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('uth.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'trips', label: t('uth.trips'), u: 0.5, v: 0.652, size: 0.56, max: UTH.maxBet },
      { id: 'ante', label: t('uth.ante'), u: 0.22, v: 0.742, size: 0.6, max: UTH.maxBet },
      { id: 'blind', label: t('uth.blind'), u: 0.5, v: 0.742, size: 0.6, mirror: 'ante' },
      { id: 'play', label: t('uth.play'), u: 0.78, v: 0.742, size: 0.6, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25, blind: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('uth.print1'), y: 84, R: 1200, font: FONT.title(52) },
          { text: t('uth.print2'), y: 150, R: 1200, font: FONT.italic(42), color: INK_SOFT },
        ],
        190,
      ),
      0.5,
      V.print,
      3.25,
    );
    const cats = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush, Cat5.Straight, Cat5.Trips];
    const fmt = (n?: number) => (n === undefined ? '—' : n === 1.5 ? '3:2' : `${n}:1`);
    this.paytable = new Paytable(
      hud.root,
      '',
      cats.map((c) => [hand5Name({ cat: c, ranks: [14], score: 0, cards: [] }), fmt(BLIND_PAYS[c]), fmt(TRIPS_PAYS[c])]),
      { head: ['', 'BLIND', 'TRIPS'] },
    );
  }

  protected validate() {
    const a = this.spots.amounts();
    if (a.ante < UTH.minBet) return t('uth.needAnte');
    return '';
  }

  protected advice() {
    if (!this.stage3) return null;
    if (this.stage3 === 'pre') {
      const b = preflopRaise(this.hole);
      return { id: b ? 'bet4' : 'check', msg: b ? t('uth.hintBet') + ' 4×' : t('uth.hintCheck') };
    }
    if (this.stage3 === 'flop') {
      const b = flopRaise(this.hole, this.board);
      return { id: b ? 'bet2' : 'check', msg: b ? t('uth.hintBet') + ' 2×' : t('uth.hintCheck') };
    }
    const b = riverBet(this.hole, this.board);
    return { id: b ? 'bet1' : 'fold', msg: b ? t('uth.hintBet') + ' 1×' : t('uth.hintFold') };
  }

  protected async playRound() {
    const { stage, wallet } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const bz = stage.screenToTable(0.5, V.board).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const hole: Card[] = [];
    const dealer: Card[] = [];
    const board: Card[] = [];
    const h3: Card3D[] = [];
    const d3: Card3D[] = [];
    const b3: Card3D[] = [];
    const pPl = row(0, pz, 2, 0.7);
    const dPl = row(0, dz, 2, 0.7);
    const bPl = row(0, bz, 5, 0.66);
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
    await wait(0.5);
    const tagNow = () => {
      this.clearTags();
      const cards = [...hole, ...board];
      if (cards.length >= 5) this.tag(hand5Name(bestOf(cards)), '', 0, pz + 0.52);
    };

    let play = 0;
    let folded = false;
    const ante = bets.ante;
    const can = (k: number) => wallet.canAfford(ante * k);

    // pre-flop
    this.stage3 = 'pre';
    let pick = await this.choose([
      { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
      { id: 'bet3', label: t('btn.bet3'), color: 'gold', text: '3×', enabled: can(3) },
      { id: 'bet4', label: t('btn.bet4'), color: 'green', text: '4×', enabled: can(4) },
    ]);
    if (pick !== 'check') {
      play = ante * (pick === 'bet4' ? 4 : 3);
      await this.place('play', play);
    }
    // flop
    const dealBoard = async (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const c = this.shoe.draw();
        board.push(c);
        b3[i] = await this.cardsT.deal(c, bPl[i], true, { dur: 0.45 });
      }
    };
    this.stage3 = null;
    await dealBoard(0, 3);
    tagNow();
    if (!play) {
      this.stage3 = 'flop';
      pick = await this.choose([
        { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
        { id: 'bet2', label: t('btn.bet2'), color: 'green', text: '2×', enabled: can(2) },
      ]);
      if (pick === 'bet2') {
        play = ante * 2;
        await this.place('play', play);
      }
    }
    this.stage3 = null;
    await dealBoard(3, 5);
    tagNow();
    if (!play) {
      this.stage3 = 'river';
      pick = await this.choose([
        { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
        { id: 'bet1', label: t('btn.bet1'), color: 'green', text: '1×', enabled: can(1) },
      ]);
      if (pick === 'bet1') {
        play = ante;
        await this.place('play', play);
      } else {
        folded = true;
        this.g.sfx.play('shove', { vol: 0.6 });
        for (const c of h3) this.cardsT.flip(c, 0.4);
      }
    }
    this.stage3 = null;
    // dealer reveals
    await wait(0.3);
    for (const c of d3) await this.cardsT.flip(c, 0.5);
    const res = settleUth(hole, dealer, board, { ante, blind: bets.blind, trips: bets.trips }, play, folded);
    this.tag(res.qualifies ? hand5Name(res.dealer) : t('uth.noQualify'), 'dealer', 0, dz + 0.52);
    if ((!folded && res.cmp > 0) || res.ret.trips > 0) {
      const used = new Set(res.player.cards);
      highlightCards(this.g, [...h3, ...b3].filter((c) => used.has(c.card!)));
      this.g.fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat5.Straight ? 150 : 70);
    }
    const big = !folded && res.cmp > 0 && res.player.cat >= Cat5.Straight ? hand5Name(res.player).toUpperCase() : undefined;
    await this.settle({ ante: res.ret.ante, blind: res.ret.blind, play: res.ret.play, trips: res.ret.trips }, { big, folded });
  }
}
