import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { JOKERS, Shoe, type Card } from '../../core/cards';
import { cryptoRng } from '../../core/rng';
import { arcTo, wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { CardPicker, highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { DD, DD_ROWS, ddEval, firstDrawAdvice, secondDrawAdvice, settleDD, type DDKey } from './rules';

addStrings(
  {
    'dd.ante': 'ANTE',
    'dd.bonus': 'BONUS',
    'dd.draw1': 'DRAW 1',
    'dd.draw2': 'DRAW 2',
    'dd.print1': 'DOUBLE DRAW POKER',
    'dd.print2': 'Two pair or better wins · Two jokers in the deck',
    'dd.needAnte': 'Place a bet on ANTE (the BONUS matches it)',
    'dd.continue': 'Draw 1×',
    'dd.pick1': 'Tap up to 3 cards to replace',
    'dd.pick2': 'Tap 1 card to replace (or none)',
    'dd.drawGo': 'Draw',
    'dd.discard': 'DRAW',
    'dd.hintGo': 'Strategy: CONTINUE',
    'dd.hintFold': 'Strategy: FOLD',
    'dd.hintPick': 'Strategy: replace the marked cards',
    'dd.hintKeep': 'Strategy: keep all five cards',
    'dd.push': 'PUSH',
    'dd.fiveAces': 'Five aces',
    'dd.naturalRoyal': 'Natural royal',
    'dd.wildRoyal': 'Wild royal',
    'dd.rules': `
      <p>Draw poker against a paytable — no dealer hand. Bet the <b>Ante</b>; an equal <b>Bonus</b> bet is made with it. The deck has 52 cards plus <b>two jokers</b>.</p>
      <h4>Two draws</h4>
      <p>After five cards: <b>fold</b> (lose Ante and Bonus) or make the <b>first draw bet</b> (1× Ante) and replace up to <b>three</b> cards. Then fold or make the <b>second draw bet</b> (1× Ante) and replace up to <b>one</b> card.</p>
      <h4>Winning</h4>
      <p>Two pair or better: Ante and both draw bets pay 1:1 and the Bonus pays by the table. Anything less loses every bet.</p>
      <h4>Bonus</h4><p>Five aces 500 · Natural royal 100 · Wild royal 50 · Straight flush 50 · Four of a kind 20 · Full house 5 · Flush 3 · Straight 2 · Three of a kind 1 · Two pair push.</p>
      <h4>Jokers</h4><p>A joker completes a royal flush, straight flush, flush or straight; otherwise it counts as an Ace.</p>`,
  },
  {
    'dd.print2': 'Dois pares ou melhor vence · Dois coringas no baralho',
    'dd.needAnte': 'Aposte no ANTE (o BONUS acompanha)',
    'dd.continue': 'Trocar 1×',
    'dd.pick1': 'Toque em até 3 cartas para trocar',
    'dd.pick2': 'Toque em 1 carta para trocar (ou nenhuma)',
    'dd.drawGo': 'Trocar',
    'dd.discard': 'TROCA',
    'dd.hintGo': 'Estratégia: CONTINUAR',
    'dd.hintFold': 'Estratégia: DESISTIR',
    'dd.hintPick': 'Estratégia: troque as cartas marcadas',
    'dd.hintKeep': 'Estratégia: fique com as cinco cartas',
    'dd.push': 'EMPATE',
    'dd.fiveAces': 'Cinco ases',
    'dd.naturalRoyal': 'Royal natural',
    'dd.wildRoyal': 'Royal com coringa',
    'dd.rules': `
      <p>Pôquer de troca contra uma tabela — sem mão do dealer. Aposte no <b>Ante</b>; uma aposta <b>Bonus</b> igual é feita junto. O baralho tem 52 cartas e <b>dois coringas</b>.</p>
      <h4>Duas trocas</h4>
      <p>Com cinco cartas: <b>desista</b> (perde Ante e Bonus) ou faça a <b>aposta da 1ª troca</b> (1× Ante) e troque até <b>três</b> cartas. Depois desista ou faça a <b>aposta da 2ª troca</b> (1× Ante) e troque até <b>uma</b> carta.</p>
      <h4>Vitória</h4>
      <p>Dois pares ou melhor: Ante e as duas apostas de troca pagam 1:1 e o Bonus paga pela tabela. Menos que isso perde tudo.</p>
      <h4>Bonus</h4><p>Cinco ases 500 · Royal natural 100 · Royal com coringa 50 · Straight flush 50 · Quadra 20 · Full house 5 · Flush 3 · Sequência 2 · Trinca 1 · Dois pares empata.</p>
      <h4>Coringas</h4><p>O coringa completa royal flush, straight flush, flush ou sequência; senão vale como Ás.</p>`,
  },
);

const V = { cards: 0.47, print: 0.27 };

export function ddName(k: DDKey): string {
  const map: Partial<Record<DDKey, string>> = {
    fiveAces: t('dd.fiveAces'),
    naturalRoyal: t('dd.naturalRoyal'),
    wildRoyal: t('dd.wildRoyal'),
    straightFlush: t('hand.straightFlush'),
    quads: t('hand.quads'),
    fullHouse: t('hand.fullHouse'),
    flush: t('hand.flush'),
    straight: t('hand.straight'),
    trips: t('hand.trips'),
    twoPair: t('hand.twoPair'),
  };
  return map[k] ?? t('hand.high');
}

export class DoubleDrawView extends TableGame {
  readonly id = 'doubledraw';
  readonly title = 'Double Draw Poker';
  protected readonly felt = 'doubledraw' as const;
  private picker: CardPicker;
  private stageN: 'd1' | 'p1' | 'd2' | 'p2' | null = null;
  private hand: Card[] = [];
  private discarded: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
    this.shoe = new Shoe(1, 1.01, cryptoRng, JOKERS);
    this.picker = new CardPicker(g, 3, t('dd.discard'));
  }

  rules() {
    return t('dd.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ante', label: t('dd.ante'), u: 0.17, v: 0.735, size: 0.5, max: DD.maxBet },
      { id: 'bonus', label: t('dd.bonus'), u: 0.39, v: 0.735, size: 0.5, mirror: 'ante' },
      { id: 'draw1', label: t('dd.draw1'), u: 0.61, v: 0.735, size: 0.5, auto: true },
      { id: 'draw2', label: t('dd.draw2'), u: 0.83, v: 0.735, size: 0.5, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25, bonus: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('dd.print1'), y: 96, R: 1200, font: FONT.title(64), spacing: 4 },
          { text: t('dd.print2'), y: 158, R: 1200, font: FONT.italic(40), color: INK_SOFT },
        ],
        194,
      ),
      0.5,
      V.print,
      3.25,
    );
    const rows = DD_ROWS.map((r) => [ddName(r.key), r.bonus ? `${r.bonus}:1` : t('dd.push')]);
    const half = Math.ceil(rows.length / 2);
    this.paytable = new Paytable(
      hud.root,
      'BONUS',
      rows.slice(0, half).map((r, i) => [...r, ...(rows[half + i] ?? ['', ''])]),
    );
    void GOLD;
  }

  protected cleanup() {
    this.picker.detach();
  }

  protected onSync() {
    this.picker.sync();
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < DD.minBet) return t('dd.needAnte');
    if (!this.g.wallet.canAfford(a * 4)) return t('toast.noFunds');
    return '';
  }

  private unseen(): Card[] {
    const all = [...Array.from({ length: 52 }, (_, i) => i), ...JOKERS];
    return all.filter((c) => !this.hand.includes(c) && !this.discarded.includes(c));
  }

  protected advice() {
    switch (this.stageN) {
      case 'd1': {
        const a = firstDrawAdvice(this.hand);
        return { id: a.cont ? 'go' : 'fold', msg: a.cont ? t('dd.hintGo') : t('dd.hintFold') };
      }
      case 'p1': {
        const a = firstDrawAdvice(this.hand);
        const disc = [0, 1, 2, 3, 4].filter((i) => !a.hold.includes(i)).slice(0, 3);
        this.picker.set(disc);
        return { id: 'drawGo', msg: disc.length ? t('dd.hintPick') : t('dd.hintKeep') };
      }
      case 'd2': {
        const a = secondDrawAdvice(this.hand, this.unseen());
        return { id: a.cont ? 'go' : 'fold', msg: a.cont ? t('dd.hintGo') : t('dd.hintFold') };
      }
      case 'p2': {
        const a = secondDrawAdvice(this.hand, this.unseen());
        this.picker.set(a.discard === null ? [] : [a.discard]);
        return { id: 'drawGo', msg: a.discard === null ? t('dd.hintKeep') : t('dd.hintPick') };
      }
      default:
        return null;
    }
  }

  private showTag(z: number) {
    this.clearTags();
    const h = ddEval(this.hand);
    if (h.key !== 'none') this.tag(ddName(h.key), h.rank >= 2 ? 'win' : '', 0, z + 0.55);
  }

  /** One betting round + draw. Returns false when the player folded. */
  private async drawRound(c3: Card3D[], pl: { pos: THREE.Vector3; yaw: number }[], z: number, n: 1 | 2): Promise<boolean> {
    const { wallet, sfx } = this.g;
    const ante = this.spots.amounts().ante;
    this.stageN = n === 1 ? 'd1' : 'd2';
    const go = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'go', label: t('dd.continue'), color: 'green', icon: 'raise', enabled: wallet.canAfford(ante) },
    ]);
    if (go === 'fold') {
      this.stageN = null;
      return false;
    }
    await this.place(n === 1 ? 'draw1' : 'draw2', ante);
    this.stageN = n === 1 ? 'p1' : 'p2';
    this.picker.attach(c3, n === 1 ? DD.firstDraw : DD.secondDraw);
    this.g.hud.toast(n === 1 ? t('dd.pick1') : t('dd.pick2'), 2000);
    await this.choose([{ id: 'drawGo', label: t('dd.drawGo'), color: 'green', icon: 'deal' }]);
    this.stageN = null;
    const sel = [...this.picker.sel].sort((a, b) => a - b);
    this.picker.detach();
    if (sel.length) {
      const out = sel.map((i) => c3[i]);
      sfx.play('shove', { vol: 0.6 });
      await Promise.all(out.map((c, k) => arcTo(c.obj, new THREE.Vector3(c.obj.position.x, 0.4, z - 1.6), 0.32, 0.2, 'power2.in', k * 0.05)));
      for (const c of out) {
        this.discarded.push(c.card!);
        this.g.cards.destroy(c);
        this.cardsT.all.splice(this.cardsT.all.indexOf(c), 1);
      }
      for (const i of sel) {
        this.hand[i] = this.shoe.draw();
        c3[i] = await this.cardsT.deal(this.hand[i], pl[i], false, { dur: 0.36 });
        this.cardsT.flip(c3[i], 0.4);
        await wait(0.05);
      }
      await wait(0.4);
    } else {
      c3.forEach((c, i) => arcTo(c.obj, pl[i].pos, 0.15, 0.02));
    }
    this.showTag(z);
    return true;
  }

  protected async playRound() {
    const { stage, fx, sfx } = this.g;
    const z = stage.screenToTable(0.5, V.cards).z;
    const pl = row(0, z, 5, 0.64, 0);
    this.hand = [];
    this.discarded = [];
    const c3: Card3D[] = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const c = this.shoe.draw();
      this.hand.push(c);
      jobs.push(this.cardsT.deal(c, pl[i], false, { dur: 0.42 }).then((x) => (c3[i] = x)));
      await wait(0.14);
    }
    await Promise.all(jobs);
    for (const c of c3) {
      this.cardsT.flip(c, 0.42);
      await wait(0.08);
    }
    await wait(0.35);
    this.showTag(z);
    let folded = !(await this.drawRound(c3, pl, z, 1));
    if (!folded) folded = !(await this.drawRound(c3, pl, z, 2));
    if (folded) {
      sfx.play('shove', { vol: 0.6 });
      for (const c of c3) this.cardsT.flip(c, 0.4);
    }
    const a = this.spots.amounts();
    const res = settleDD(this.hand, { ante: a.ante, bonus: a.bonus, draw1: a.draw1 ?? 0, draw2: a.draw2 ?? 0 });
    const ret = folded ? { ante: 0, bonus: 0, draw1: 0, draw2: 0 } : res.ret;
    const won = !folded && res.hand.rank >= 2;
    if (won) {
      this.paytable?.highlight(null);
      highlightCards(this.g, c3);
      fx.burst(new THREE.Vector3(0, 0.3, z), res.hand.rank >= 5 ? 160 : 80);
    }
    const big = won && res.hand.rank >= 4 ? ddName(res.hand.key).toUpperCase() : undefined;
    await this.settle(ret, { big, folded });
  }
}
