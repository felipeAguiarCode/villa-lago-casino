import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { squeezeCard, wait } from '../../table/anim';
import { REST_Y } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { classify, RD, settleRd, shouldRaise, spreadPays } from './rules';

addStrings(
  {
    'rd.bet': 'BET',
    'rd.raise': 'RAISE',
    'rd.print1': 'RED DOG',
    'rd.print2': 'Will the third card fall in between?',
    'rd.print3': 'THREE OF A KIND PAYS 11 TO 1',
    'rd.needBet': 'Place a BET',
    'rd.spread': 'Spread {n} · pays {p}:1',
    'rd.consecutive': 'Consecutive · push',
    'rd.pair': 'Pair · third card for 11:1',
    'rd.call': 'Call',
    'rd.raiseBtn': 'Raise',
    'rd.hintRaise': 'Strategy: RAISE (spread 7 or more)',
    'rd.hintCall': 'Strategy: CALL (spread under 7)',
    'rd.between': 'IN BETWEEN!',
    'rd.trips': 'THREE OF A KIND!',
    'rd.spreadCol': 'SPREAD',
    'rd.rules': `
      <p>Two cards are turned face up. Bet that the <b>third card falls strictly between</b> them in rank (Aces high, suits don't matter).</p>
      <h4>Spread</h4>
      <p>The number of ranks between the two cards sets the payout: <b>1 → 5:1 · 2 → 4:1 · 3 → 2:1 · 4 or more → 1:1</b>. After seeing the spread you may <b>raise</b> up to your original bet.</p>
      <h4>Special hands</h4>
      <p>Consecutive cards (like 7-8): push. A pair: a third card is dealt and <b>three of a kind pays 11:1</b>; otherwise push.</p>
      <h4>Strategy</h4><p>Raise only with a spread of 7 or more.</p>`,
  },
  {
    'rd.raise': 'AUMENTO',
    'rd.print2': 'A terceira carta vai cair no meio?',
    'rd.print3': 'TRINCA PAGA 11 PARA 1',
    'rd.needBet': 'Faça uma APOSTA',
    'rd.spread': 'Spread {n} · paga {p}:1',
    'rd.consecutive': 'Seguidas · empate',
    'rd.pair': 'Par · terceira carta por 11:1',
    'rd.call': 'Manter',
    'rd.raiseBtn': 'Aumentar',
    'rd.hintRaise': 'Estratégia: AUMENTAR (spread 7 ou mais)',
    'rd.hintCall': 'Estratégia: MANTER (spread menor que 7)',
    'rd.between': 'NO MEIO!',
    'rd.trips': 'TRINCA!',
    'rd.rules': `
      <p>Duas cartas são abertas. Aposte que a <b>terceira carta cai entre elas</b> (Ás é a maior; naipes não contam).</p>
      <h4>Spread</h4>
      <p>A quantidade de valores entre as duas cartas define o pagamento: <b>1 → 5:1 · 2 → 4:1 · 3 → 2:1 · 4 ou mais → 1:1</b>. Depois de ver o spread você pode <b>aumentar</b> até o valor da aposta.</p>
      <h4>Mãos especiais</h4>
      <p>Cartas seguidas (como 7-8): empate. Par: sai uma terceira carta e <b>trinca paga 11:1</b>; senão empate.</p>
      <h4>Estratégia</h4><p>Aumente só com spread de 7 ou mais.</p>`,
  },
);

const V = { cards: 0.31, print: 0.475 };

export class RedDogView extends TableGame {
  readonly id = 'reddog';
  readonly title = 'Red Dog';
  protected readonly felt = 'reddog' as const;
  private spreadNow: number | null = null;

  constructor(g: GameCtx) {
    super(g, RD.decks);
  }

  rules() {
    return t('rd.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'bet', label: t('rd.bet'), u: 0.32, v: 0.725, size: 0.68, max: RD.maxBet },
      { id: 'raise', label: t('rd.raise'), u: 0.68, v: 0.725, size: 0.68, auto: true },
    ];
  }

  protected defaultBets() {
    return { bet: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('rd.print1'), y: 108, R: 1000, font: FONT.title(80), spacing: 10 },
          { text: t('rd.print2'), y: 176, R: 1000, font: FONT.italic(44), color: INK_SOFT },
          { text: t('rd.print3'), y: 262, R: 1000, font: FONT.title(34), color: GOLD, spacing: 6 },
        ],
        310,
        [
          { y: 216, R: 1000, half: 0.36 },
          { y: 278, R: 1000, half: 0.36 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
    this.paytable = new Paytable(
      hud.root,
      '',
      [
        ['1', `${spreadPays(1)}:1`, '2', `${spreadPays(2)}:1`],
        ['3', `${spreadPays(3)}:1`, '4–11', `${spreadPays(4)}:1`],
        [t('hand.trips'), `${RD.tripsPays}:1`, '', ''],
      ],
      { head: [t('rd.spreadCol'), '', t('rd.spreadCol'), ''] },
    );
  }

  protected validate() {
    if ((this.spots.amounts().bet ?? 0) < RD.minBet) return t('rd.needBet');
    return '';
  }

  protected advice() {
    if (this.spreadNow === null) return null;
    const r = shouldRaise(this.spreadNow);
    return { id: r ? 'raise' : 'call', msg: r ? t('rd.hintRaise') : t('rd.hintCall') };
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const bets = this.spots.amounts();
    const z = stage.screenToTable(0.5, V.cards).z;
    const a = this.shoe.draw();
    const b = this.shoe.draw();
    const left = await this.cardsT.deal(a, { pos: new THREE.Vector3(-0.85, REST_Y, z), yaw: 0 }, true, { dur: 0.5 });
    await wait(0.1);
    const right = await this.cardsT.deal(b, { pos: new THREE.Vector3(0.85, REST_Y, z), yaw: 0 }, true, { dur: 0.5 });
    await wait(0.3);
    const c = classify(a, b);
    const mid = new THREE.Vector3(0, REST_Y + 0.01, z);
    let third: number | null = null;
    if (c.kind === 'consecutive') {
      this.tag(t('rd.consecutive'), '', 0, z + 0.62);
      sfx.push();
      await wait(0.6);
    } else if (c.kind === 'pair') {
      this.tag(t('rd.pair'), 'win', 0, z + 0.62);
      await wait(0.5);
      third = this.shoe.draw();
      const t3 = await this.cardsT.deal(third, { pos: mid, yaw: 0 }, false, { dur: 0.5 });
      await squeezeCard(t3, () => sfx.play('place', { vol: 0.6 }));
    } else {
      this.tag(t('rd.spread', { n: c.spread, p: spreadPays(c.spread) }), 'win', 0, z + 0.62);
      this.paytable?.highlight(c.spread >= 4 ? 3 : c.spread - 1);
      this.spreadNow = c.spread;
      const pick = await this.choose([
        { id: 'call', label: t('rd.call'), color: 'blue', icon: 'knock' },
        { id: 'raise', label: t('rd.raiseBtn'), color: 'green', icon: 'raise', enabled: wallet.canAfford(bets.bet) },
      ]);
      this.spreadNow = null;
      if (pick === 'raise') await this.place('raise', bets.bet);
      third = this.shoe.draw();
      const t3 = await this.cardsT.deal(third, { pos: mid, yaw: 0 }, false, { dur: 0.5 });
      await squeezeCard(t3, () => sfx.play('place', { vol: 0.6 }));
    }
    const res = settleRd(a, b, third, { bet: bets.bet, raise: this.spots.get('raise').amount });
    if (res.win) {
      highlightCards(this.g, this.cardsT.all.slice(-1));
      fx.burst(new THREE.Vector3(0, 0.3, z), c.kind === 'pair' ? 160 : 90);
    }
    void left;
    void right;
    const big = res.win ? (c.kind === 'pair' ? t('rd.trips') : t('rd.between')) : undefined;
    await this.settle(res.ret, { big });
    this.paytable?.highlight(null);
  }
}
