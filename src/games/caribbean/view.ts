import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, type Card } from '../../core/cards';
import { Cat5, eval5, type Hand5 } from '../../core/eval5';
import { wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import type { Pin } from '../../ui/hud';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { CALL_PAYS, CSP, settleCsp, shouldCall } from './rules';

addStrings(
  {
    'csp.ante': 'ANTE',
    'csp.call': 'CALL',
    'csp.jackpot': 'JACKPOT',
    'csp.print1': 'CARIBBEAN STUD',
    'csp.print2': 'Dealer qualifies with Ace-King or better',
    'csp.print3': 'CALL PAYS UP TO 100 TO 1',
    'csp.needAnte': 'Place a bet on ANTE',
    'csp.noQualify': 'DEALER DOES NOT QUALIFY',
    'csp.meter': 'PROGRESSIVE JACKPOT',
    'csp.hintCall': 'Strategy: CALL',
    'csp.hintFold': 'Strategy: FOLD',
    'csp.jackpotWin': 'JACKPOT!',
    'csp.rules': `
      <p>Five-card stud against the dealer. Bet the <b>Ante</b>; optionally add the fixed <b>Jackpot</b> side bet.</p>
      <h4>Call or fold</h4>
      <p>You see your five cards and one dealer card. <b>Call</b> by betting 2× the Ante, or <b>Fold</b> and lose the Ante.</p>
      <h4>Dealer qualifies with Ace-King</h4>
      <p>If the dealer does not qualify, the Ante pays 1:1 and the Call pushes. Otherwise the better hand wins: Ante pays 1:1 and Call pays by the table — Pair 1 · Two pair 2 · Trips 3 · Straight 4 · Flush 5 · Full house 7 · Quads 20 · Straight flush 50 · Royal 100.</p>
      <h4>Jackpot (fictional)</h4>
      <p>Royal flush wins the whole meter, straight flush 10% of it, four of a kind 2,500, full house 500, flush 250 — whatever the dealer holds.</p>`,
  },
  {
    'csp.print2': 'Dealer qualifica com Ás-Rei ou melhor',
    'csp.print3': 'CALL PAGA ATÉ 100 PARA 1',
    'csp.needAnte': 'Aposte no ANTE',
    'csp.noQualify': 'DEALER NÃO QUALIFICA',
    'csp.meter': 'JACKPOT PROGRESSIVO',
    'csp.hintCall': 'Estratégia: CALL',
    'csp.hintFold': 'Estratégia: DESISTIR',
    'csp.rules': `
      <p>Pôquer de cinco cartas contra o dealer. Aposte no <b>Ante</b> e, se quiser, no <b>Jackpot</b> (valor fixo).</p>
      <h4>Call ou desistir</h4>
      <p>Você vê suas cinco cartas e uma do dealer. <b>Call</b> aposta 2× o Ante; <b>Desistir</b> perde o Ante.</p>
      <h4>Dealer qualifica com Ás-Rei</h4>
      <p>Se o dealer não qualificar, o Ante paga 1:1 e o Call empata. Senão a melhor mão ganha: Ante 1:1 e o Call pela tabela — Par 1 · Dois pares 2 · Trinca 3 · Sequência 4 · Flush 5 · Full house 7 · Quadra 20 · Straight flush 50 · Royal 100.</p>
      <h4>Jackpot (fictício)</h4>
      <p>Royal flush leva o medidor inteiro, straight flush 10% dele, quadra 2.500, full house 500, flush 250 — não importa a mão do dealer.</p>`,
  },
);

const V = { dealer: 0.262, print: 0.385, player: 0.53 };
const GAP = 0.56;
const METER_KEY = 'vlc.jackpot.v1';

export function hand5Name(h: Hand5): string {
  const keys: Record<Cat5, string> = {
    [Cat5.High]: '',
    [Cat5.Pair]: 'hand.pair',
    [Cat5.TwoPair]: 'hand.twoPair',
    [Cat5.Trips]: 'hand.trips',
    [Cat5.Straight]: 'hand.straight',
    [Cat5.Flush]: 'hand.flush',
    [Cat5.FullHouse]: 'hand.fullHouse',
    [Cat5.Quads]: 'hand.quads',
    [Cat5.StraightFlush]: 'hand.straightFlush',
    [Cat5.Royal]: 'hand.royal',
  };
  if (h.cat === Cat5.High) return `${rankLabel(h.ranks[0])}-${rankLabel(h.ranks[1])} ${t('hand.high').toLowerCase()}`;
  if (h.cat === Cat5.Pair) return `${t('hand.pair')} · ${rankLabel(h.ranks[0])}`;
  return t(keys[h.cat]);
}

export class CaribbeanView extends TableGame {
  readonly id = 'caribbean';
  readonly title = 'Caribbean Stud';
  protected readonly felt = 'caribbean' as const;
  private meter = CSP.jackpotSeed;
  private meterPin: Pin | null = null;
  private advise: { player: Card[]; up: Card } | null = null;

  constructor(g: GameCtx) {
    super(g, 1);
    try {
      const m = Number(localStorage.getItem(METER_KEY));
      if (m > 0) this.meter = m;
    } catch {
      /* ignore */
    }
  }

  rules() {
    return t('csp.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'jackpot', label: t('csp.jackpot'), sub: String(CSP.jackpotBet), u: 0.5, v: 0.655, size: 0.52, fixed: CSP.jackpotBet },
      { id: 'ante', label: t('csp.ante'), u: 0.29, v: 0.735, size: 0.66, max: CSP.maxBet },
      { id: 'call', label: t('csp.call'), u: 0.71, v: 0.735, size: 0.66, auto: true },
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
          { text: t('csp.print1'), y: 120, R: 820, font: FONT.title(68) },
          { text: t('csp.print2'), y: 194, R: 820, font: FONT.italic(44), color: INK_SOFT },
          { text: t('csp.print3'), y: 282, R: 900, font: FONT.title(34), color: GOLD, spacing: 5 },
        ],
        330,
        [
          { y: 236, R: 900, half: 0.42 },
          { y: 298, R: 900, half: 0.42 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
    const cats = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush, Cat5.Straight, Cat5.Trips, Cat5.TwoPair, Cat5.Pair];
    const rows: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const a = cats[i];
      const b = cats[i + 5];
      rows.push([hand5Name({ cat: a, ranks: [14], score: 0, cards: [] }), `${CALL_PAYS[a]}:1`, b !== undefined ? hand5Name({ cat: b, ranks: [11], score: 0, cards: [] }).split(' · ')[0] : '', b !== undefined ? `${CALL_PAYS[b]}:1` : '']);
    }
    this.paytable = new Paytable(hud.root, 'CALL', rows, { cls: 'csp' });
    this.meterPin = hud.pin('jackpot');
    this.meterPin.el.innerHTML = `<div class="led red"><small>${t('csp.meter')}</small><b>${this.moneyStr(this.meter)}</b></div>`;
    this.meterPin.show(true);
  }

  protected cleanup() {
    this.meterPin?.remove();
    this.meterPin = null;
  }

  private setMeter(n: number) {
    this.meter = n;
    try {
      localStorage.setItem(METER_KEY, String(n));
    } catch {
      /* ignore */
    }
    const b = this.meterPin?.el.querySelector('b');
    if (b) b.textContent = this.moneyStr(n);
  }

  protected onSync() {
    // the meter sits on the felt between the print and the player's hand during play, top during betting
    const p = this.g.stage.toScreen(this.g.stage.screenToTable(0.5, 0.268));
    this.meterPin?.place(p.x, p.y);
    this.meterPin?.show(this.phase === 'betting');
  }

  protected validate() {
    const a = this.spots.amounts();
    if (a.ante < CSP.minBet) return t('csp.needAnte');
    if (!this.g.wallet.canAfford(this.spots.total + a.ante * 2)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    if (!this.advise) return null;
    const call = shouldCall(this.advise.player, this.advise.up);
    return { id: call ? 'call' : 'fold', msg: call ? t('csp.hintCall') : t('csp.hintFold') };
  }

  protected async playRound() {
    const { stage } = this.g;
    const bets = this.spots.amounts();
    if (bets.jackpot) this.setMeter(this.meter + CSP.jackpotGrow);
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const pPl = row(0, pz, 5, GAP);
    const dPl = row(0, dz, 5, GAP);
    const player: Card[] = [];
    const dealer: Card[] = [];
    const p5: Card3D[] = [];
    const d5: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      player.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false, { dur: 0.45 }).then((c) => (p5[i] = c)));
      await wait(0.16);
      jobs.push(this.cardsT.deal(dc, dPl[i], i === 4, { dur: 0.45 }).then((c) => (d5[i] = c)));
      await wait(0.16);
    }
    await Promise.all(jobs);
    for (const c of p5) {
      this.cardsT.flip(c, 0.45);
      await wait(0.09);
    }
    await wait(0.5);
    const ph = eval5(player);
    this.tag(hand5Name(ph), '', 0, pz + 0.52);
    this.advise = { player, up: dealer[4] };
    const pick = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'call', label: `${t('csp.call').charAt(0)}${t('csp.call').slice(1).toLowerCase()} 2×`, color: 'green', icon: 'raise', enabled: this.g.wallet.canAfford(bets.ante * 2) },
    ]);
    this.advise = null;
    const called = pick === 'call';
    if (called) await this.place('call', bets.ante * 2);
    else {
      this.g.sfx.play('shove', { vol: 0.6 });
      for (const c of p5) this.cardsT.flip(c, 0.4);
    }
    await wait(0.25);
    for (let i = 0; i < 4; i++) {
      await this.cardsT.flip(d5[i], 0.42);
    }
    const res = settleCsp(player, dealer, { ante: bets.ante, jackpot: bets.jackpot }, called, this.meter);
    this.tag(res.qualifies ? hand5Name(res.dealer) : t('csp.noQualify'), 'dealer', 0, dz + 0.52);
    if ((called && res.cmp > 0) || res.ret.jackpot > 0) {
      highlightCards(this.g, p5);
      this.g.fx.burst(new THREE.Vector3(0, 0.3, pz), ph.cat >= Cat5.Straight ? 150 : 70);
    }
    const catRows = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush];
    if (called && res.qualifies && res.cmp > 0) {
      const i = catRows.indexOf(ph.cat);
      this.paytable?.highlight(i >= 0 ? i : null);
    }
    let big: string | undefined;
    if (res.ret.jackpot > 0) {
      big = t('csp.jackpotWin');
      if (ph.cat >= Cat5.StraightFlush) this.setMeter(Math.max(CSP.jackpotSeed, this.meter - res.ret.jackpot));
    } else if (called && res.cmp > 0 && res.qualifies && ph.cat >= Cat5.Straight) big = hand5Name(ph).toUpperCase();
    await this.settle({ ante: res.ret.ante, call: res.ret.call, jackpot: res.ret.jackpot }, { big, folded: !called });
    this.paytable?.highlight(null);
  }
}
