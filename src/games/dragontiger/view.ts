import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { money } from '../../core/wallet';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { shuffleShow } from '../../table/shuffle';
import { finishXP, highlightCards, resultBanner, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { BetError, BetSlip } from './bets';
import type { MainResult } from './evaluate';
import { browserStore } from './history';
import { ALL_BETS, limitOf, type BetId } from './ruleset';
import { toChips } from './settlement';
import { DragonTigerTable } from './table';

addStrings(
  {
    'dt.DRAGON': 'DRAGON',
    'dt.TIGER': 'TIGER',
    'dt.TIE': 'TIE',
    'dt.SUITED_TIE': 'SUITED TIE',
    'dt.BIG': 'BIG',
    'dt.SMALL': 'SMALL',
    'dt.ODD': 'ODD',
    'dt.EVEN': 'EVEN',
    'dt.RED': 'RED',
    'dt.BLACK': 'BLACK',
    'dt.print': 'HIGHER CARD WINS · ACE LOW · KING HIGH',
    'dt.print2': 'TIE 11 TO 1 · SUITED TIE 50 TO 1',
    'dt.r.DRAGON_WIN': 'Dragon wins',
    'dt.r.TIGER_WIN': 'Tiger wins',
    'dt.r.TIE': 'Tie',
    'dt.r.SUITED_TIE': 'Suited tie',
    'dt.recovered': 'An interrupted round was settled: {n}',
    'dt.voided': 'An interrupted round was cancelled and refunded: {n}',
    'dt.rules': `
      <p>One card to the <b>Dragon</b>, one to the <b>Tiger</b> (eight decks, a burn card first). The higher card wins: Ace is low (1), King high (13); suits never decide.</p>
      <h4>Main bets</h4>
      <p><b>Dragon</b> / <b>Tiger</b> pay 1:1; on any tie half the bet comes back. <b>Tie</b> (same value) pays 11:1. <b>Suited tie</b> (same value and suit) pays 50:1 — it also wins the Tie bet.</p>
      <h4>Side bets (on either card)</h4>
      <p><b>Big</b> 8–K and <b>Small</b> A–6 pay 1:1; <b>Odd</b> (A, 3, 5, 9, J, K) and <b>Even</b> (2, 4, 6, 8, 10, Q) pay 1:1 — a 7 loses all four. <b>Red</b> and <b>Black</b> pay 0.9:1, the 7 included. Side bets are settled on their own card, whoever wins.</p>`,
  },
  {
    'dt.DRAGON': 'DRAGÃO',
    'dt.TIGER': 'TIGRE',
    'dt.TIE': 'EMPATE',
    'dt.SUITED_TIE': 'EMP. NAIPE',
    'dt.BIG': 'ALTA',
    'dt.SMALL': 'BAIXA',
    'dt.ODD': 'ÍMPAR',
    'dt.EVEN': 'PAR',
    'dt.RED': 'VERMELHA',
    'dt.BLACK': 'PRETA',
    'dt.print': 'CARTA MAIS ALTA VENCE · ÁS BAIXO · REI ALTO',
    'dt.print2': 'EMPATE 11 PARA 1 · EMPATE DE NAIPE 50 PARA 1',
    'dt.r.DRAGON_WIN': 'Dragão vence',
    'dt.r.TIGER_WIN': 'Tigre vence',
    'dt.r.TIE': 'Empate',
    'dt.r.SUITED_TIE': 'Empate de naipe',
    'dt.recovered': 'Uma rodada interrompida foi liquidada: {n}',
    'dt.voided': 'Uma rodada interrompida foi cancelada e devolvida: {n}',
    'dt.rules': `
      <p>Uma carta para o <b>Dragão</b>, uma para o <b>Tigre</b> (oito baralhos, uma carta queimada antes). A carta mais alta vence: Ás vale 1, Rei vale 13; o naipe nunca decide.</p>
      <h4>Apostas principais</h4>
      <p><b>Dragão</b> / <b>Tigre</b> pagam 1:1; em qualquer empate volta metade da aposta. <b>Empate</b> (mesmo valor) paga 11:1. <b>Empate de naipe</b> (mesmo valor e naipe) paga 50:1 — e também vence a aposta Empate.</p>
      <h4>Apostas laterais (em qualquer carta)</h4>
      <p><b>Alta</b> 8–K e <b>Baixa</b> A–6 pagam 1:1; <b>Ímpar</b> (A, 3, 5, 9, J, K) e <b>Par</b> (2, 4, 6, 8, 10, Q) pagam 1:1 — o 7 perde as quatro. <b>Vermelha</b> e <b>Preta</b> pagam 0,9:1, inclusive com 7. As laterais são decididas pela própria carta, seja quem for o vencedor.</p>`,
  },
);

/** Screen layout (u, v of the frame). */
const CARD_V = 0.275;
const SIDE_ROWS = [0.43, 0.505, 0.58];
const MAIN_V = 0.685;
const SIDE_COLS = { DRAGON: [0.17, 0.39], TIGER: [0.61, 0.83] } as const;

export class DragonTigerView extends TableGame {
  readonly id = 'dragontiger';
  readonly title = 'Dragon Tiger';
  protected readonly felt = 'dragontiger' as const;
  protected debitsOnDeal = false;
  readonly dt: DragonTigerTable;
  private reshuffled = false;
  private told = false;

  constructor(g: GameCtx) {
    super(g, 8);
    this.dt = new DragonTigerTable({ bank: g.wallet, store: browserStore() });
  }

  rules() {
    return t('dt.rules');
  }

  protected spotDefs(): SpotDef[] {
    const defs: SpotDef[] = [];
    const lim = (id: BetId) => limitOf(id, this.dt.r).max;
    for (const side of ['DRAGON', 'TIGER'] as const) {
      const [a, b] = SIDE_COLS[side];
      const kinds = [
        ['BIG', 'SMALL'],
        ['ODD', 'EVEN'],
        ['RED', 'BLACK'],
      ];
      kinds.forEach((pair, r) =>
        pair.forEach((k, i) => {
          const id = `${side}_${k}` as BetId;
          if (this.dt.r.enabled[id] && this.dt.r.sideBetsEnabled) defs.push({ id, label: t(`dt.${k}`), sub: t(`dt.${side}`), u: i ? b : a, v: SIDE_ROWS[r], size: 0.42, max: lim(id) });
        }),
      );
    }
    const main: [BetId, number, number][] = [
      ['DRAGON', 0.15, 0.54],
      ['TIE', 0.385, 0.48],
      ['SUITED_TIE', 0.615, 0.48],
      ['TIGER', 0.85, 0.54],
    ];
    for (const [id, u, size] of main) if (this.dt.r.enabled[id]) defs.push({ id, label: t(`dt.${id}`), u, v: MAIN_V, size, max: lim(id) });
    // the main bets come first so a fresh table starts on Dragon
    return [...defs.slice(-4), ...defs.slice(0, -4)];
  }

  protected defaultBets() {
    return { DRAGON: 25 };
  }

  protected decorate() {
    const { table } = this.g;
    for (const side of ['DRAGON', 'TIGER'] as const)
      table.addDecal(tablePrint([{ text: t(`dt.${side}`), y: 60, R: 900, font: FONT.title(70), spacing: 8 }], 100), side === 'DRAGON' ? 0.3 : 0.7, CARD_V - 0.105, 1.5);
    table.addDecal(
      tablePrint(
        [
          { text: t('dt.print'), y: 44, R: 1600, font: FONT.title(26), color: GOLD, spacing: 3 },
          { text: t('dt.print2'), y: 92, R: 1600, font: FONT.italic(32), color: INK_SOFT },
        ],
        120,
      ),
      0.5,
      0.372,
      3.2,
    );
  }

  async enter() {
    await super.enter();
    // a round cut short last time (closed tab, crash) is settled or refunded on start-up
    const rec = this.dt.recovered;
    if (rec && !this.told) {
      this.told = true;
      const n = money(toChips(rec.totalReturn));
      this.g.hud.toast(t(rec.finalState === 'ROUND_COMPLETE' ? 'dt.recovered' : 'dt.voided', { n }), 3200);
    }
  }

  protected validate() {
    const slip = new BetSlip(this.dt.r);
    try {
      for (const [id, n] of Object.entries(this.spots.amounts())) if (n > 0) slip.add(id as BetId, n, this.g.wallet.balance);
    } catch (e) {
      return e instanceof BetError ? e.message : String(e);
    }
    return slip.problem(this.g.wallet.balance)?.message ?? '';
  }

  protected async playRound() {
    const { stage, sfx, fx, table } = this.g;
    const dt = this.dt;
    if (dt.state === 'ROUND_COMPLETE' || dt.state === 'ROUND_VOIDED') this.reshuffled = dt.nextRound() || this.reshuffled;
    if (this.reshuffled) {
      // a new shoe, between rounds
      this.reshuffled = false;
      await shuffleShow(this.g, { quick: true });
    }
    for (const id of ALL_BETS) {
      const n = this.spots.spots.get(id)?.amount ?? 0;
      if (n > 0) dt.placeBet(id, n);
    }
    dt.lockBets();
    const z = stage.screenToTable(0.5, CARD_V).z;
    const [dPlace, tPlace] = row(0, z, 2, stage.screenToTable(0.7, CARD_V).x - stage.screenToTable(0.3, CARD_V).x, 0);
    if (dt.r.burnCardEnabled) {
      const burned = dt.burn();
      const tray = table.trayTop();
      await this.cardsT.deal(burned, { pos: new THREE.Vector3(tray.x - 0.25, 0.02, tray.z + 0.55), yaw: table.trayYaw }, false, { dur: 0.4 });
    }
    dt.deal();
    const d3 = await this.cardsT.deal(null, dPlace, false, { dur: 0.45 });
    await wait(0.08);
    const t3 = await this.cardsT.deal(null, tPlace, false, { dur: 0.45 });
    await wait(0.3);
    await this.reveal(d3, dt.revealDragon());
    await wait(0.25);
    await this.reveal(t3, dt.revealTiger());
    const outcomes = dt.evaluate();
    const result = dt.result as MainResult;
    this.tag(t(`dt.r.${result}`), result === 'TIGER_WIN' || result === 'DRAGON_WIN' ? '' : 'win', 0, stage.screenToTable(0.5, CARD_V + 0.085).z);
    const glow: Card3D[] = result === 'DRAGON_WIN' ? [d3] : result === 'TIGER_WIN' ? [t3] : [d3, t3];
    highlightCards(this.g, glow, result === 'SUITED_TIE' ? '#ffd27a' : '#9fd0ff');
    if (result === 'SUITED_TIE') fx.burst(new THREE.Vector3(0, 0.3, z), 160);
    await wait(0.5);
    const s = dt.settle();
    // chips: wins are paid beside the bet, half-losses lose half, losses are taken
    const jobs: Promise<void>[] = [];
    for (const o of outcomes) {
      const stake = toChips(o.stake);
      const back = toChips(o.returned);
      if (o.state === 'WIN') jobs.push(this.spots.payout(o.id, back - stake));
      else if (o.state === 'LOSS') jobs.push(this.spots.lose(o.id));
      else if (o.state === 'HALF_LOSS') {
        this.spots.get(o.id).pile.set(back);
        sfx.play('handle', { vol: 0.5 });
      }
    }
    await Promise.all(jobs);
    const net = toChips(s.net);
    const wager = toChips(s.totalBet);
    const big = result === 'SUITED_TIE' && outcomes.some((o) => o.id === 'SUITED_TIE' && o.state === 'WIN') ? t('dt.r.SUITED_TIE').toUpperCase() : undefined;
    await finishXP(this.g, wager, net, resultBanner(this.g, net, wager, { big }));
    dt.nextRound() && (this.reshuffled = true);
  }

  private async reveal(c3: Card3D, card: number) {
    c3.setCard(card);
    await this.cardsT.flip(c3, 0.5);
  }
}
