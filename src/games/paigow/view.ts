import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, type Card } from '../../core/cards';
import { eval5 } from '../../core/eval5';
import { slideCard, wait, type Place } from '../../table/anim';
import { CARD_H, CARD_W, REST_Y, type Card3D } from '../../table/cardMesh';
import { FONT, INK_SOFT, tablePrint } from '../../table/prints';
import { hand5Name } from '../caribbean/view';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { evalLow, houseWay, PG, settlePg, validSplit, type Low, type Split } from './rules';

addStrings(
  {
    'pg.bet': 'BET',
    'pg.print1': 'PAI GOW POKER',
    'pg.print2': 'Copies go to the dealer · 5% commission on wins',
    'pg.needBet': 'Place a BET',
    'pg.pickLow': 'Tap 2 cards for your LOW hand',
    'pg.foul': 'The 5-card hand must beat the 2-card hand',
    'pg.houseWay': 'House way',
    'pg.set': 'Set hands',
    'pg.hint': 'Tap House way to set your cards like the dealer would',
    'pg.high': 'HIGH',
    'pg.low': 'LOW',
    'pg.pairOf': 'Pair · {r}',
    'pg.rules': `
      <p>You and the dealer get seven cards each. Split yours into a <b>five-card high hand</b> and a <b>two-card low hand</b>; the high hand must be stronger than the low hand.</p>
      <h4>Showdown</h4>
      <p>Your high hand plays the dealer's high hand and your low hand plays the dealer's low hand. Win both: you win 1:1 less a 5% commission. Win one: push. Lose both: you lose. Exact ties (<b>copies</b>) go to the dealer.</p>
      <h4>Hands</h4>
      <p>The five-card hand uses normal poker ranks (A-2-3-4-5 is the second-best straight). The two-card hand is either a pair or two high cards. This table uses a 52-card deck without a joker.</p>
      <h4>House way</h4><p>The dealer always sets the cards by the house way. Tap <b>House way</b> to have your cards set the same way.</p>`,
  },
  {
    'pg.print2': 'Empate exato é do dealer · 5% de comissão nas vitórias',
    'pg.needBet': 'Faça uma APOSTA',
    'pg.pickLow': 'Toque em 2 cartas para a mão BAIXA',
    'pg.foul': 'A mão de 5 cartas precisa ser maior que a de 2',
    'pg.houseWay': 'Jeito da casa',
    'pg.set': 'Montar mãos',
    'pg.hint': 'Toque em Jeito da casa para montar as cartas como o dealer faria',
    'pg.high': 'ALTA',
    'pg.low': 'BAIXA',
    'pg.pairOf': 'Par · {r}',
    'pg.rules': `
      <p>Você e o dealer recebem sete cartas. Divida as suas em uma <b>mão alta de cinco cartas</b> e uma <b>mão baixa de duas</b>; a mão alta precisa ser mais forte que a baixa.</p>
      <h4>Showdown</h4>
      <p>Sua mão alta enfrenta a alta do dealer e a baixa enfrenta a baixa. Venceu as duas: ganha 1:1 menos 5% de comissão. Venceu uma: empate. Perdeu as duas: perde. Empates exatos (<b>copies</b>) são do dealer.</p>
      <h4>Mãos</h4>
      <p>A mão de cinco usa a ordem normal do pôquer (A-2-3-4-5 é a segunda melhor sequência). A de duas é um par ou duas cartas altas. Esta mesa usa baralho de 52 cartas, sem coringa.</p>
      <h4>Jeito da casa</h4><p>O dealer sempre monta as cartas pelo "house way". Toque em <b>Jeito da casa</b> para montar as suas do mesmo jeito.</p>`,
  },
);

const V = { dHigh: 0.215, dLow: 0.215, print: 0.395, pLow: 0.575, pHigh: 0.575, deal: 0.57 };
const HIGH_X = -0.42;
const LOW_X = 1.18;

export function lowName(l: Low): string {
  return l.pair ? t('pg.pairOf', { r: rankLabel(l.ranks[0]) }) : `${rankLabel(l.ranks[0])}-${rankLabel(l.ranks[1])}`;
}

export class PaiGowView extends TableGame {
  readonly id = 'paigow';
  readonly title = 'Pai Gow Poker';
  protected readonly felt = 'paigow' as const;
  private sel: number[] = [];
  private mine: Card[] = [];
  private mine3: Card3D[] = [];
  private hits: HTMLButtonElement[] = [];
  private picking = false;
  private onSel: () => void = () => {};
  private base: Place[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('pg.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [{ id: 'bet', label: t('pg.bet'), u: 0.5, v: 0.75, size: 0.7, max: PG.maxBet }];
  }

  protected defaultBets() {
    return { bet: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('pg.print1'), y: 96, R: 1100, font: FONT.title(74), spacing: 8 },
          { text: t('pg.print2'), y: 160, R: 1100, font: FONT.italic(40), color: INK_SOFT },
        ],
        196,
      ),
      0.5,
      V.print,
      3.25,
    );
    for (let i = 0; i < 7; i++) {
      const b = document.createElement('button');
      b.className = 'card-hit live';
      b.setAttribute('aria-label', `Card ${i + 1}`);
      b.onclick = () => this.toggle(i);
      hud.labels.appendChild(b);
      this.hits.push(b);
    }
  }

  protected cleanup() {
    this.hits.forEach((b) => b.remove());
    this.hits = [];
  }

  protected validate() {
    if ((this.spots.amounts().bet ?? 0) < PG.minBet) return t('pg.needBet');
    return '';
  }

  protected advice() {
    return this.picking ? { id: 'house', msg: t('pg.hint') } : null;
  }

  private currentSplit(): Split | null {
    if (this.sel.length !== 2) return null;
    const low = this.sel.map((i) => this.mine[i]);
    return { low, high: this.mine.filter((_, i) => !this.sel.includes(i)) };
  }

  private validSel() {
    const s = this.currentSplit();
    return !!s && validSplit(s.high, s.low);
  }

  private toggle(i: number) {
    if (!this.picking) return;
    const k = this.sel.indexOf(i);
    if (k >= 0) this.sel.splice(k, 1);
    else {
      if (this.sel.length >= 2) this.sel.shift();
      this.sel.push(i);
    }
    this.g.sfx.play('slide', { vol: 0.5 });
    this.layoutSelection();
    this.onSel();
    if (this.sel.length === 2 && !this.validSel()) this.g.hud.toast(t('pg.foul'), 1600);
  }

  /** Selected cards slide up toward the low-hand row. */
  private layoutSelection() {
    this.mine3.forEach((c, i) => {
      const p = this.base[i];
      const up = this.sel.includes(i);
      slideCard(c, { pos: p.pos.clone().setZ(p.pos.z - (up ? 0.32 : 0)).setY(up ? REST_Y + 0.03 : p.pos.y), yaw: p.yaw }, 0.16, 0.03);
    });
  }

  private pick(): Promise<Split> {
    this.picking = true;
    this.sel = [];
    this.g.hud.toast(t('pg.pickLow'), 2000);
    return new Promise((res) => {
      const refresh = () => {
        const b = this.g.hud.root.querySelector<HTMLButtonElement>('.actions .vbtn[data-id="set"]');
        if (b) b.disabled = !this.validSel();
      };
      this.onSel = refresh;
      this.actions([
        {
          id: 'house',
          label: t('pg.houseWay'),
          color: 'blue',
          icon: 'home',
          onClick: () => {
            const hw = houseWay(this.mine);
            this.sel = hw.low.map((c) => this.mine.indexOf(c));
            this.g.sfx.click();
            this.g.hud.highlight(null);
            this.layoutSelection();
            refresh();
          },
        },
        {
          id: 'set',
          label: t('pg.set'),
          color: 'green',
          icon: 'check',
          enabled: false,
          onClick: () => {
            const s = this.currentSplit();
            if (!s || !validSplit(s.high, s.low)) return;
            this.g.sfx.click();
            this.picking = false;
            this.onSel = () => {};
            this.actions(null);
            res(s);
          },
        },
      ]);
    });
  }

  protected onSync() {
    const { stage } = this.g;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < 7; i++) {
      const b = this.hits[i];
      const c = this.mine3[i];
      if (!b) continue;
      if (!this.picking || !c) {
        b.style.display = 'none';
        continue;
      }
      // overlapping cards: each hit box covers the visible strip (the last one the whole card)
      const p = c.obj.position;
      const nextX = i < 6 && this.mine3[i + 1] ? this.mine3[i + 1].obj.position.x - CARD_W / 2 : p.x + CARD_W / 2;
      const a = stage.toScreen(tmp.set(p.x - CARD_W / 2, 0, p.z - CARD_H / 2));
      const z = stage.toScreen(tmp.set(Math.min(p.x + CARD_W / 2, nextX), 0, p.z + CARD_H / 2));
      b.style.display = 'block';
      b.style.width = `${Math.max(12, z.x - a.x)}px`;
      b.style.height = `${z.y - a.y}px`;
      b.style.transform = `translate(${a.x}px, ${a.y}px)`;
    }
  }

  protected async playRound() {
    const { stage, fx } = this.g;
    const z = (v: number) => stage.screenToTable(0.5, v).z;
    const mine: Card[] = [];
    const dealer: Card[] = [];
    const d3: Card3D[] = [];
    this.mine3 = [];
    this.base = row(0, z(V.deal), 7, 0.39, 0.004);
    const dStack = row(0, z(V.dHigh), 7, 0.3, 0.004);
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 7; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      mine.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, this.base[i], false, { dur: 0.42 }).then((c) => (this.mine3[i] = c)));
      await wait(0.12);
      jobs.push(this.cardsT.deal(dc, dStack[i], false, { dur: 0.42 }).then((c) => (d3[i] = c)));
      await wait(0.12);
    }
    await Promise.all(jobs);
    // sort the player's cards high to low before turning them, like a player arranging the hand
    const order = mine.map((c, i) => i).sort((a, b) => (mine[b] % 13) - (mine[a] % 13));
    this.mine = order.map((i) => mine[i]);
    this.mine3 = order.map((i) => this.mine3[i]);
    await Promise.all(this.mine3.map((c, i) => slideCard(c, this.base[i], 0.3)));
    for (const c of this.mine3) {
      this.cardsT.flip(c, 0.45);
      await wait(0.07);
    }
    await wait(0.4);
    const ps = await this.pick();

    // set both hands: high row and low row
    const placeSplit = async (cs: Card3D[], s: Split, all: Card[], zHigh: number, zLow: number, gapHigh: number) => {
      const hi = s.high.map((c) => cs[all.indexOf(c)]);
      const lo = s.low.map((c) => cs[all.indexOf(c)]);
      const hp = row(HIGH_X, z(zHigh), 5, gapHigh);
      const lp = row(LOW_X, z(zLow), 2, 0.3);
      this.g.sfx.play('shove', { vol: 0.5 });
      await Promise.all([...hi.map((c, i) => slideCard(c, hp[i], 0.35, 0.1)), ...lo.map((c, i) => slideCard(c, lp[i], 0.35, 0.1))]);
      return { hi, lo };
    };
    const mineSet = await placeSplit(this.mine3, ps, this.mine, V.pHigh, V.pLow, 0.36);
    this.tag(hand5Name(eval5(ps.high)), '', HIGH_X, z(V.pHigh) + 0.56);
    this.tag(lowName(evalLow(ps.low)), '', LOW_X, z(V.pLow) + 0.56);
    await wait(0.3);

    // dealer sets by the house way and reveals
    const ds = houseWay(dealer);
    const dealerSet = await placeSplit(d3, ds, dealer, V.dHigh, V.dLow, 0.36);
    for (const c of [...dealerSet.hi, ...dealerSet.lo]) {
      this.cardsT.flip(c, 0.42);
      await wait(0.08);
    }
    await wait(0.5);
    const res = settlePg(ps, ds, this.spots.get('bet').amount);
    this.tag(hand5Name(res.dh), 'dealer', HIGH_X, z(V.dHigh) + 0.56);
    this.tag(lowName(res.dl), 'dealer', LOW_X, z(V.dLow) + 0.56);
    if (res.highWin > 0) highlightCards(this.g, mineSet.hi);
    if (res.lowWin > 0) highlightCards(this.g, mineSet.lo);
    if (res.outcome === 'win') fx.burst(new THREE.Vector3(0, 0.3, z(V.pHigh)), 110);
    await this.settle({ bet: res.ret });
  }
}
