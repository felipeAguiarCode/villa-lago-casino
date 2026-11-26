import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { Cat5, eval5, scoringMask } from '../../core/eval5';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { LIR, LIR_PAYS, rideFirst, rideSecond, settleLir } from './rules';

addStrings(
  {
    'lir.print1': 'LET IT RIDE',
    'lir.print2': 'Pull back two bets or let them ride',
    'lir.needBet': 'Place a bet (three equal bets are made)',
    'lir.pull': 'Pull back',
    'lir.ride': 'Let it ride',
    'lir.hintRide': 'Strategy: LET IT RIDE',
    'lir.hintPull': 'Strategy: PULL BACK',
    'lir.tens': 'Tens or better',
    'lir.rules': `
      <p>Poker with no dealer hand to beat: your five cards are paid by the table. You place <b>three equal bets</b> and get three cards; two more cards are shared face down.</p>
      <h4>Two chances to take money back</h4>
      <p>After seeing your three cards you may <b>pull back</b> bet 1 or <b>let it ride</b>. The first shared card is turned, and you decide on bet 2. The third bet (<b>$</b>) always rides.</p>
      <h4>Paytable (each riding bet)</h4>
      <p>Royal flush 1000 · Straight flush 200 · Four of a kind 50 · Full house 11 · Flush 8 · Straight 5 · Three of a kind 3 · Two pair 2 · Pair of Tens or better 1. Smaller hands lose.</p>`,
  },
  {
    'lir.print2': 'Recolha duas apostas ou deixe correr',
    'lir.needBet': 'Faça uma aposta (são feitas três apostas iguais)',
    'lir.pull': 'Recolher',
    'lir.ride': 'Deixar correr',
    'lir.hintRide': 'Estratégia: DEIXAR CORRER',
    'lir.hintPull': 'Estratégia: RECOLHER',
    'lir.tens': 'Par de 10 ou maior',
    'lir.rules': `
      <p>Pôquer sem mão do dealer para vencer: suas cinco cartas são pagas pela tabela. Você faz <b>três apostas iguais</b> e recebe três cartas; mais duas cartas comunitárias ficam viradas.</p>
      <h4>Duas chances de recolher</h4>
      <p>Depois de ver suas três cartas, <b>recolha</b> a aposta 1 ou <b>deixe correr</b>. A primeira carta comunitária é aberta e você decide a aposta 2. A terceira (<b>$</b>) sempre corre.</p>
      <h4>Tabela (cada aposta que correu)</h4>
      <p>Royal flush 1000 · Straight flush 200 · Quadra 50 · Full house 11 · Flush 8 · Sequência 5 · Trinca 3 · Dois pares 2 · Par de 10 ou maior 1. Mãos menores perdem.</p>`,
  },
);

const V = { community: 0.27, print: 0.395, player: 0.525 };
const CATS = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush, Cat5.Straight, Cat5.Trips, Cat5.TwoPair, Cat5.Pair];

export class LetItRideView extends TableGame {
  readonly id = 'letitride';
  readonly title = 'Let It Ride';
  protected readonly felt = 'letitride' as const;
  private decide: { cards: Card[]; step: 1 | 2 } | null = null;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('lir.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'b1', label: '1', u: 0.22, v: 0.7, size: 0.62, max: LIR.maxBet },
      { id: 'b2', label: '2', u: 0.5, v: 0.7, size: 0.62, mirror: 'b1' },
      { id: 'b3', label: '$', u: 0.78, v: 0.7, size: 0.62, mirror: 'b1' },
    ];
  }

  protected defaultBets() {
    return { b1: 25, b2: 25, b3: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('lir.print1'), y: 106, R: 1000, font: FONT.title(78), spacing: 8 },
          { text: t('lir.print2'), y: 172, R: 1000, font: FONT.italic(44), color: INK_SOFT },
        ],
        210,
      ),
      0.5,
      V.print,
      3.25,
    );
    const rows: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const a = CATS[i];
      const b = CATS[i + 5];
      const name = (c: Cat5) => (c === Cat5.Pair ? t('lir.tens') : hand5Name({ cat: c, ranks: [14], score: 0, cards: [] }));
      rows.push([name(a), `${LIR_PAYS[a]}:1`, b !== undefined ? name(b) : '', b !== undefined ? `${LIR_PAYS[b]}:1` : '']);
    }
    this.paytable = new Paytable(hud.root, '', rows);
  }

  protected validate() {
    if ((this.spots.amounts().b1 ?? 0) < LIR.minBet) return t('lir.needBet');
    return '';
  }

  protected advice() {
    if (!this.decide) return null;
    const ride = this.decide.step === 1 ? rideFirst(this.decide.cards) : rideSecond(this.decide.cards);
    return { id: ride ? 'ride' : 'pull', msg: ride ? t('lir.hintRide') : t('lir.hintPull') };
  }

  private ask(step: 1 | 2, cards: Card[]) {
    this.decide = { cards, step };
    return this.choose([
      { id: 'pull', label: `${t('lir.pull')} ${step}`, color: 'red', icon: 'redo' },
      { id: 'ride', label: t('lir.ride'), color: 'green', icon: 'play' },
    ]).finally(() => (this.decide = null));
  }

  protected async playRound() {
    const { stage, fx } = this.g;
    const cz = stage.screenToTable(0.5, V.community).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const mine: Card[] = [];
    const shared: Card[] = [];
    const m3: Card3D[] = [];
    const s3: Card3D[] = [];
    const pPl = row(0, pz, 3, 0.7);
    const cPl = row(0, cz, 2, 0.74);
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 3; i++) {
      const c = this.shoe.draw();
      mine.push(c);
      jobs.push(this.cardsT.deal(c, pPl[i], false).then((x) => (m3[i] = x)));
      await wait(0.2);
    }
    for (let i = 0; i < 2; i++) {
      const c = this.shoe.draw();
      shared.push(c);
      jobs.push(this.cardsT.deal(c, cPl[i], false).then((x) => (s3[i] = x)));
      await wait(0.2);
    }
    await Promise.all(jobs);
    for (const c of m3) {
      this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await wait(0.5);
    if ((await this.ask(1, mine)) === 'pull') await this.spots.retract('b1');
    await this.cardsT.flip(s3[0], 0.55);
    await wait(0.2);
    if ((await this.ask(2, [...mine, shared[0]])) === 'pull') await this.spots.retract('b2');
    await this.cardsT.flip(s3[1], 0.6);
    const all = [...mine, ...shared];
    const riding: Record<string, number> = {};
    for (const id of ['b1', 'b2', 'b3']) {
      const a = this.spots.get(id).amount;
      if (a > 0) riding[id] = a;
    }
    const res = settleLir(all, riding);
    const h = eval5(all);
    this.tag(hand5Name(h), res.mult > 0 ? 'win' : 'lose', 0, pz + 0.52);
    if (res.mult > 0) {
      const mask = scoringMask(all, h);
      highlightCards(this.g, [...m3, ...s3].filter((_, i) => mask[i]));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.mult >= 5 ? 150 : 70);
      const idx = h.cat === Cat5.Pair ? 8 : CATS.indexOf(h.cat);
      this.paytable?.highlight(idx % 5);
    }
    await this.settle(res.ret, { big: res.mult >= 5 ? hand5Name(h).toUpperCase() : undefined });
    this.paytable?.highlight(null);
  }
}
