import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, type Card } from '../../core/cards';
import { Cat4, type Hand4 } from '../../core/eval4';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { ACES_UP, ANTE_BONUS4, FCP, playMultiple, settleFcp } from './rules';

addStrings(
  {
    'fcp.ante': 'ANTE',
    'fcp.acesUp': 'ACES UP',
    'fcp.play': 'PLAY',
    'fcp.print1': 'FOUR CARD POKER',
    'fcp.print2': 'Best four cards win · Player wins ties',
    'fcp.print3': 'PLAY 1× TO 3× THE ANTE',
    'fcp.needAnte': 'Place a bet on ANTE',
    'fcp.hintPlay': 'Strategy: PLAY {n}×',
    'fcp.hintFold': 'Strategy: FOLD (less than a pair of 3s)',
    'fcp.pairAces': 'Pair of Aces',
    'fcp.rules': `
      <p>Make the best <b>four-card</b> hand. You get five cards; the dealer gets six (one face up). The dealer always plays and <b>you win ties</b>.</p>
      <h4>Hand ranks</h4>
      <p>Four of a kind · Straight flush · Three of a kind · Flush · Straight · Two pair · Pair · High card.</p>
      <h4>Play</h4>
      <p>After seeing your cards, <b>fold</b> (lose the Ante) or <b>play 1×, 2× or 3×</b> the Ante. Beat or tie the dealer and Ante and Play pay 1:1.</p>
      <h4>Ante bonus</h4><p>Four of a kind 25:1 · Straight flush 20:1 · Three of a kind 2:1, paid whenever you play.</p>
      <h4>Aces Up</h4><p>Four of a kind 50 · Straight flush 40 · Three of a kind 9 · Flush 5 · Straight 4 · Two pair 3 · Pair of Aces 1.</p>
      <h4>Strategy</h4><p>Play 3× with a pair of Tens or better, 1× with a pair of 3s to 9s, otherwise fold.</p>`,
  },
  {
    'fcp.print2': 'Vencem as melhores quatro cartas · Empate é do jogador',
    'fcp.print3': 'JOGUE DE 1× A 3× O ANTE',
    'fcp.needAnte': 'Aposte no ANTE',
    'fcp.hintPlay': 'Estratégia: JOGAR {n}×',
    'fcp.hintFold': 'Estratégia: DESISTIR (menos que par de 3)',
    'fcp.pairAces': 'Par de Ases',
    'fcp.rules': `
      <p>Forme a melhor mão de <b>quatro cartas</b>. Você recebe cinco cartas; o dealer recebe seis (uma aberta). O dealer sempre joga e <b>o empate é seu</b>.</p>
      <h4>Mãos</h4>
      <p>Quadra · Straight flush · Trinca · Flush · Sequência · Dois pares · Par · Carta alta.</p>
      <h4>Jogar</h4>
      <p>Depois de ver suas cartas, <b>desista</b> (perde o Ante) ou <b>jogue 1×, 2× ou 3×</b> o Ante. Se vencer ou empatar, Ante e Play pagam 1:1.</p>
      <h4>Bônus do Ante</h4><p>Quadra 25:1 · Straight flush 20:1 · Trinca 2:1, pago sempre que você joga.</p>
      <h4>Aces Up</h4><p>Quadra 50 · Straight flush 40 · Trinca 9 · Flush 5 · Sequência 4 · Dois pares 3 · Par de Ases 1.</p>
      <h4>Estratégia</h4><p>Jogue 3× com par de 10 ou melhor, 1× com par de 3 a 9; senão desista.</p>`,
  },
);

const V = { dealer: 0.245, print: 0.39, player: 0.53 };
const ORDER = [Cat4.Quads, Cat4.StraightFlush, Cat4.Trips, Cat4.Flush, Cat4.Straight, Cat4.TwoPair, Cat4.Pair];

export function hand4Name(h: Hand4): string {
  switch (h.cat) {
    case Cat4.Quads:
      return t('hand.quads');
    case Cat4.StraightFlush:
      return t('hand.straightFlush');
    case Cat4.Trips:
      return t('hand.trips');
    case Cat4.Flush:
      return t('hand.flush');
    case Cat4.Straight:
      return t('hand.straight');
    case Cat4.TwoPair:
      return t('hand.twoPair');
    case Cat4.Pair:
      return `${t('hand.pair')} · ${rankLabel(h.ranks[0])}`;
    default:
      return `${rankLabel(h.ranks[0])} ${t('hand.high').toLowerCase()}`;
  }
}

export class FourCardView extends TableGame {
  readonly id = 'fourcard';
  readonly title = 'Four Card Poker';
  protected readonly felt = 'fourcard' as const;
  private mine: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('fcp.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'acesUp', label: t('fcp.acesUp'), u: 0.5, v: 0.652, size: 0.56, max: 500 },
      { id: 'ante', label: t('fcp.ante'), u: 0.3, v: 0.742, size: 0.62, max: FCP.maxBet },
      { id: 'play', label: t('fcp.play'), u: 0.7, v: 0.742, size: 0.62, auto: true },
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
          { text: t('fcp.print1'), y: 112, R: 900, font: FONT.title(68), spacing: 4 },
          { text: t('fcp.print2'), y: 180, R: 900, font: FONT.italic(42), color: INK_SOFT },
          { text: t('fcp.print3'), y: 266, R: 900, font: FONT.title(34), color: GOLD, spacing: 5 },
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
    const name = (c: Cat4) => (c === Cat4.Pair ? t('fcp.pairAces') : hand4Name({ cat: c, ranks: [14], score: 0, cards: [] }));
    this.paytable = new Paytable(
      hud.root,
      '',
      ORDER.map((c) => [name(c), ANTE_BONUS4[c] ? `${ANTE_BONUS4[c]}:1` : '—', `${ACES_UP[c]}:1`]),
      { head: ['', 'ANTE BONUS', 'ACES UP'] },
    );
  }

  protected validate() {
    if ((this.spots.amounts().ante ?? 0) < FCP.minBet) return t('fcp.needAnte');
    return '';
  }

  protected advice() {
    if (!this.mine.length) return null;
    const m = playMultiple(this.mine);
    return m ? { id: `play${m}`, msg: t('fcp.hintPlay', { n: m }) } : { id: 'fold', msg: t('fcp.hintFold') };
  }

  protected async playRound() {
    const { stage, wallet, fx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pPl = row(0, pz, 5, 0.56);
    const dPl = row(0, dz, 6, 0.48);
    const player: Card[] = [];
    const dealer: Card[] = [];
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 6; i++) {
      if (i < 5) {
        const pc = this.shoe.draw();
        player.push(pc);
        jobs.push(this.cardsT.deal(pc, pPl[i], false, { dur: 0.44 }).then((c) => (p3[i] = c)));
        await wait(0.15);
      }
      const dc = this.shoe.draw();
      dealer.push(dc);
      jobs.push(this.cardsT.deal(dc, dPl[i], i === 5, { dur: 0.44 }).then((c) => (d3[i] = c)));
      await wait(0.15);
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.45);
      await wait(0.08);
    }
    await wait(0.45);
    const res0 = settleFcp(player, dealer, { ante: 0, acesUp: 0 }, 0);
    this.tag(hand4Name(res0.player), '', 0, pz + 0.52);
    this.mine = player;
    const ante = bets.ante;
    const can = (k: number) => wallet.canAfford(ante * k);
    const pick = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'play1', label: '1×', color: 'blue', text: '1×', enabled: can(1) },
      { id: 'play2', label: '2×', color: 'gold', text: '2×', enabled: can(2) },
      { id: 'play3', label: '3×', color: 'green', text: '3×', enabled: can(3) },
    ]);
    this.mine = [];
    const mult = pick === 'fold' ? 0 : Number(pick.slice(4));
    if (mult) await this.place('play', ante * mult);
    else {
      this.g.sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
    }
    await wait(0.25);
    for (let i = 0; i < 5; i++) {
      await this.cardsT.flip(d3[i], 0.4);
    }
    const res = settleFcp(player, dealer, { ante, acesUp: bets.acesUp ?? 0 }, ante * mult);
    this.tag(hand4Name(res.dealer), 'dealer', 0, dz + 0.52);
    const best = new Set(res.player.cards);
    if ((mult && res.win) || res.ret.acesUp > 0) {
      highlightCards(this.g, p3.filter((c) => best.has(c.card!)));
      fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat4.Trips ? 140 : 70);
    }
    if (res.bonus > 0 || res.ret.acesUp > 0) this.paytable?.highlight(ORDER.indexOf(res.player.cat));
    const big = mult && res.win && res.player.cat >= Cat4.Trips ? hand4Name(res.player).toUpperCase() : undefined;
    await this.settle(res.ret, { big, folded: !mult });
    this.paytable?.highlight(null);
  }
}
