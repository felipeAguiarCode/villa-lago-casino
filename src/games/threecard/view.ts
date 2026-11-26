import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { Cat3, eval3, type Hand3 } from '../../core/eval3';
import { Cat5 } from '../../core/eval5';
import { rankLabel, type Card } from '../../core/cards';
import { arcTo, wait } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { ICONS, type IconName } from '../../ui/icons';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { best3 } from '../holdem3/rules';
import { CardPicker, highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { allowedMultiples, bestDiscard, bestPlay, dealerDrawIndex, MODE_RULES, primeMult, settleMain, TCP_MODES, type TcpMode } from './modes';
import { ANTE_BONUS, LUCKY6, PAIR_PLUS, settleTcp, TCP } from './rules';

addStrings(
  {
    'tcp.ante': 'ANTE',
    'tcp.pairPlus': 'PAIR PLUS',
    'tcp.play': 'PLAY',
    'tcp.lucky6': 'LUCKY 6',
    'tcp.lucky6Win': 'LUCKY 6!',
    'tcp.prime': 'PRIME',
    'tcp.primeWin': 'PRIME!',
    'tcp.print1': 'THREE CARD POKER',
    'tcp.print2': 'Dealer plays with Queen high or better',
    'tcp.print3': 'PAIR PLUS · ANTE BONUS',
    'tcp.needBet': 'Bet on ANTE, PAIR PLUS, LUCKY 6 or PRIME',
    'tcp.noQualify': 'DEALER DOES NOT QUALIFY',
    'tcp.hintPlay': 'Best play: PLAY {n}× (EV {ev})',
    'tcp.hintFold': 'Best play: FOLD (playing loses more)',
    'tcp.hintKeep': 'Best play: KEEP all three cards',
    'tcp.hintDraw': 'Best play: replace the marked card',
    'tcp.high': '{r} high',
    'tcp.keep': 'Keep',
    'tcp.drawBtn': 'Draw',
    'tcp.pickDraw': 'Tap one card to replace (or keep)',
    'tcp.dealerDraws': 'Dealer replaces a card',
    'tcp.mode.classic': 'Classic',
    'tcp.mode.ultimate': 'Ultimate',
    'tcp.mode.faceup': 'Face Up',
    'tcp.mode.prime': 'Prime',
    'tcp.mode.draw': 'Draw',
    'tcp.mode.holdem': "Hold'em",
    'tcp.p2.classic': 'Dealer plays with Queen high or better',
    'tcp.p2.ultimate': 'Raise 2× with Ace high · 3× with a pair',
    'tcp.p2.faceup': 'One dealer card face up · ties go to the dealer',
    'tcp.p2.prime': 'Colours pay: three or six of one colour',
    'tcp.p2.draw': 'You and the dealer may replace one card',
    'tcp.p2.holdem': 'Two cards each + two shared cards',
    'tcp.modeToast': 'Mode: {name}',
    'tcp.sixColour': 'Six of one colour',
    'tcp.threeColour': 'Three of one colour',
    'tcp.rules': `
      <p>Beat the dealer's three-card hand. You may bet <b>Ante</b>, <b>Pair Plus</b>, <b>Lucky 6</b> or any of them.</p>
      <h4>Hand ranks</h4>
      <p>Straight flush · Three of a kind · Straight · Flush · Pair · High card (in Three Card Poker a straight beats a flush).</p>
      <h4>Ante &amp; Play</h4>
      <p>After seeing your cards, <b>Play</b> (bet the same as the Ante) or <b>Fold</b> (lose the Ante). The dealer needs <b>Queen high</b> to qualify: if not, Ante pays 1:1 and Play pushes. Otherwise the better hand wins both bets 1:1.</p>
      <h4>Ante bonus</h4><p>Straight flush 5:1 · Three of a kind 4:1 · Straight 1:1, paid even if the dealer wins.</p>
      <h4>Pair Plus</h4><p>Pays on your hand alone: Straight flush 40:1 · Three of a kind 30:1 · Straight 6:1 · Flush 3:1 · Pair 1:1.</p>
      <h4>Lucky 6</h4><p>Six-card bonus: your three cards plus the dealer's three make the best five-card hand. Royal flush 1000:1 · Straight flush 200:1 · Four of a kind 100:1 · Full house 20:1 · Flush 15:1 · Straight 10:1 · Three of a kind 7:1. Paid even if you fold.</p>
      <h4>Table modes</h4>
      <p><b>Ultimate</b> — raise 2× with Ace high or better and 3× with a pair or better; the Ante pushes when the dealer doesn't qualify.</p>
      <p><b>Face Up</b> — one dealer card is dealt face up; ties go to the dealer and there is no ante bonus.</p>
      <p><b>Prime</b> — adds the Prime bet: your three cards all one colour pay 3:1, all six cards (yours and the dealer's) one colour pay 4:1.</p>
      <p><b>Draw</b> — you may replace one card before deciding; the dealer replaces his lowest card when he has less than a pair. No ante bonus; the Ante pushes when the dealer doesn't qualify.</p>
      <p><b>Hold'em</b> — two cards each plus two shared cards (one shown before you decide); best three of four. The dealer always plays; no ante bonus; Lucky 6 is off.</p>
      <h4>Hint</h4><p>The light bulb simulates the unseen cards and shows the play with the best expected value.</p>`,
  },
  {
    'tcp.needBet': 'Aposte em ANTE, PAIR PLUS, LUCKY 6 ou PRIME',
    'tcp.print2': 'Dealer joga com Dama alta ou melhor',
    'tcp.noQualify': 'DEALER NÃO QUALIFICA',
    'tcp.hintPlay': 'Melhor jogada: JOGAR {n}× (VE {ev})',
    'tcp.hintFold': 'Melhor jogada: DESISTIR (jogar perde mais)',
    'tcp.hintKeep': 'Melhor jogada: FICAR com as três cartas',
    'tcp.hintDraw': 'Melhor jogada: trocar a carta marcada',
    'tcp.high': '{r} alta',
    'tcp.keep': 'Ficar',
    'tcp.drawBtn': 'Trocar',
    'tcp.pickDraw': 'Toque numa carta para trocar (ou fique)',
    'tcp.dealerDraws': 'O dealer troca uma carta',
    'tcp.mode.classic': 'Clássico',
    'tcp.mode.faceup': 'Face Up',
    'tcp.mode.draw': 'Troca',
    'tcp.p2.classic': 'Dealer joga com Dama alta ou melhor',
    'tcp.p2.ultimate': 'Aumente 2× com Ás alto · 3× com par',
    'tcp.p2.faceup': 'Uma carta do dealer aberta · empate é do dealer',
    'tcp.p2.prime': 'As cores pagam: três ou seis da mesma cor',
    'tcp.p2.draw': 'Você e o dealer podem trocar uma carta',
    'tcp.p2.holdem': 'Duas cartas cada + duas comunitárias',
    'tcp.modeToast': 'Modo: {name}',
    'tcp.sixColour': 'Seis da mesma cor',
    'tcp.threeColour': 'Três da mesma cor',
    'tcp.rules': `
      <p>Vença a mão de três cartas do dealer. Aposte em <b>Ante</b>, <b>Pair Plus</b>, <b>Lucky 6</b> ou em qualquer combinação.</p>
      <h4>Mãos</h4>
      <p>Straight flush · Trinca · Sequência · Flush · Par · Carta alta (aqui a sequência vale mais que o flush).</p>
      <h4>Ante e Play</h4>
      <p>Depois de ver suas cartas, <b>Jogue</b> (aposta igual ao Ante) ou <b>Desista</b> (perde o Ante). O dealer precisa de <b>Dama alta</b> para qualificar: se não qualificar, o Ante paga 1:1 e o Play empata. Senão, a melhor mão ganha as duas apostas 1:1.</p>
      <h4>Bônus do Ante</h4><p>Straight flush 5:1 · Trinca 4:1 · Sequência 1:1, pago mesmo se o dealer ganhar.</p>
      <h4>Pair Plus</h4><p>Paga só pela sua mão: Straight flush 40:1 · Trinca 30:1 · Sequência 6:1 · Flush 3:1 · Par 1:1.</p>
      <h4>Lucky 6</h4><p>Bônus de seis cartas: suas três cartas mais as três do dealer formam a melhor mão de cinco. Royal flush 1000:1 · Straight flush 200:1 · Quadra 100:1 · Full house 20:1 · Flush 15:1 · Sequência 10:1 · Trinca 7:1. Paga mesmo se você desistir.</p>
      <h4>Modos da mesa</h4>
      <p><b>Ultimate</b> — aumente 2× com Ás alto ou melhor e 3× com par ou melhor; o Ante empata quando o dealer não qualifica.</p>
      <p><b>Face Up</b> — uma carta do dealer vem aberta; empates são do dealer e não há bônus do ante.</p>
      <p><b>Prime</b> — adiciona a aposta Prime: suas três cartas da mesma cor pagam 3:1, as seis (suas e do dealer) da mesma cor pagam 4:1.</p>
      <p><b>Troca</b> — você pode trocar uma carta antes de decidir; o dealer troca a carta mais baixa quando tem menos que um par. Sem bônus do ante; o Ante empata quando o dealer não qualifica.</p>
      <p><b>Hold'em</b> — duas cartas cada e duas comunitárias (uma aberta antes da decisão); vale a melhor mão de três entre quatro. O dealer sempre joga; sem bônus do ante; Lucky 6 desligado.</p>
      <h4>Dica</h4><p>A lâmpada simula as cartas que faltam e mostra a jogada de melhor valor esperado.</p>`,
  },
);

const V = { dealer: 0.265, print: 0.385, board: 0.395, player: 0.52 };
const GAP = 0.68;
const MODE_KEY = 'vlc.tcpMode';
const MODE_ICON: Record<TcpMode, IconName> = {
  classic: 'chip',
  ultimate: 'raise',
  faceup: 'eye',
  prime: 'palette',
  draw: 'cycle',
  holdem: 'twin',
};

export function hand3Name(h: Hand3): string {
  switch (h.cat) {
    case Cat3.StraightFlush:
      return t('hand.straightFlush');
    case Cat3.Trips:
      return t('hand.trips');
    case Cat3.Straight:
      return t('hand.straight');
    case Cat3.Flush:
      return t('hand.flush');
    case Cat3.Pair:
      return `${t('hand.pair')} · ${rankLabel(h.ranks[0])}`;
    default:
      return t('tcp.high', { r: rankLabel(h.ranks[0]) });
  }
}

const ALL_CARDS = Array.from({ length: 52 }, (_, i) => i);

export class ThreeCardView extends TableGame {
  readonly id = 'threecard';
  readonly title = 'Three Card Poker';
  protected readonly felt = 'threecard' as const;
  private mode: TcpMode = 'classic';
  private rowCats: [string, Cat3 | null, Cat5 | null][] = [];
  private modebar: HTMLElement | null = null;
  private picker: CardPicker;
  /** What the hint needs to know about the current decision. */
  private decide: { stage: 'draw' | 'play'; player: Card[]; up?: Card; board?: Card[] } | null = null;

  constructor(g: GameCtx) {
    super(g, 1);
    try {
      const m = localStorage.getItem(MODE_KEY) as TcpMode | null;
      if (m && TCP_MODES.includes(m)) this.mode = m;
    } catch {
      /* ignore */
    }
    this.picker = new CardPicker(g, 1, t('tcp.drawBtn').toUpperCase(), () => {
      const b = this.g.hud.root.querySelector<HTMLButtonElement>('.actions .vbtn[data-id="draw"]');
      if (b) b.disabled = this.picker.sel.size === 0;
    });
  }

  get variantTitle() {
    return this.mode === 'classic' ? this.title : `${this.title} · ${t(`tcp.mode.${this.mode}`)}`;
  }

  preset(variant: string) {
    if (variant === 'tcpfaceup') this.setModeQuiet('faceup');
  }

  rules() {
    return t('tcp.rules');
  }

  private setModeQuiet(m: TcpMode) {
    this.mode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  }

  private async setMode(m: TcpMode) {
    if (m === this.mode || this.phase !== 'betting' || this.busy) return;
    this.g.sfx.click();
    this.setModeQuiet(m);
    this.g.hud.toast(t('tcp.modeToast', { name: t(`tcp.mode.${m}`) }), 1200);
    await this.relayout();
  }

  protected spotDefs(): SpotDef[] {
    const prime = this.mode === 'prime';
    const holdem = this.mode === 'holdem';
    const side: SpotDef[] = prime
      ? [
          { id: 'pairPlus', label: t('tcp.pairPlus'), u: 0.2, v: 0.648, size: 0.52, max: TCP.maxBet },
          { id: 'prime', label: t('tcp.prime'), sub: '3:1 · 4:1', u: 0.5, v: 0.648, size: 0.52, max: 500 },
          { id: 'lucky6', label: t('tcp.lucky6'), u: 0.8, v: 0.648, size: 0.52, max: 500 },
        ]
      : holdem
        ? [{ id: 'pairPlus', label: t('tcp.pairPlus'), u: 0.5, v: 0.648, size: 0.56, max: TCP.maxBet }]
        : [
            { id: 'pairPlus', label: t('tcp.pairPlus'), u: 0.31, v: 0.648, size: 0.6, max: TCP.maxBet },
            { id: 'lucky6', label: t('tcp.lucky6'), u: 0.69, v: 0.648, size: 0.6, max: 500 },
          ];
    return [
      ...side,
      { id: 'ante', label: t('tcp.ante'), u: 0.31, v: 0.742, size: 0.6, max: TCP.maxBet },
      { id: 'play', label: t('tcp.play'), sub: this.mode === 'ultimate' ? '1× – 3×' : '', u: 0.69, v: 0.742, size: 0.6, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25, pairPlus: 0 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    const bonus = MODE_RULES[this.mode].anteBonus;
    table.addDecal(
      tablePrint(
        [
          { text: t('tcp.print1'), y: 120, R: 820, font: FONT.title(66) },
          { text: t(`tcp.p2.${this.mode}`), y: 196, R: 820, font: FONT.italic(44), color: INK_SOFT },
          { text: bonus ? t('tcp.print3') : t(`tcp.mode.${this.mode}`).toUpperCase(), y: 284, R: 900, font: FONT.title(36), color: GOLD, spacing: 6 },
        ],
        330,
        [
          { y: 238, R: 900, half: 0.42 },
          { y: 300, R: 900, half: 0.42 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
    // one table for the paytables: Pair Plus / Ante Bonus use 3-card hands, Lucky 6 uses 5-card hands, Prime uses colours
    const f = (n?: number) => (n ? `${n}:1` : '—');
    const rows: [string, Cat3 | null, Cat5 | null][] = [
      [t('hand.royal'), null, Cat5.Royal],
      [t('hand.straightFlush'), Cat3.StraightFlush, Cat5.StraightFlush],
      [t('hand.quads'), null, Cat5.Quads],
      [t('hand.fullHouse'), null, Cat5.FullHouse],
      [t('hand.trips'), Cat3.Trips, Cat5.Trips],
      [t('hand.straight'), Cat3.Straight, Cat5.Straight],
      [t('hand.flush'), Cat3.Flush, Cat5.Flush],
      [t('hand.pair'), Cat3.Pair, null],
    ];
    this.rowCats = rows;
    const holdem = this.mode === 'holdem';
    const body = rows.map(([name, c3, c5]) => [
      name,
      f(c3 !== null ? PAIR_PLUS[c3] : undefined),
      f(bonus && c3 !== null ? ANTE_BONUS[c3] : undefined),
      holdem ? '—' : f(c5 !== null ? LUCKY6[c5] : undefined),
    ]);
    if (this.mode === 'prime') {
      body.push([`PRIME · ${t('tcp.sixColour')}`, '', '', '4:1']);
      body.push([`PRIME · ${t('tcp.threeColour')}`, '', '', '3:1']);
    }
    this.paytable = new Paytable(hud.root, '', body, { head: ['', 'PAIR+', 'ANTE', this.mode === 'prime' ? 'LUCKY 6 / PRIME' : 'LUCKY 6'], cls: 'tcp below-modes' });
    this.buildModebar();
  }

  private buildModebar() {
    this.modebar?.remove();
    const bar = document.createElement('div');
    bar.className = 'modebar live';
    for (const m of TCP_MODES) {
      const b = document.createElement('button');
      b.className = `modechip${m === this.mode ? ' on' : ''}`;
      b.innerHTML = `${ICONS[MODE_ICON[m]]}<span>${t(`tcp.mode.${m}`)}</span>`;
      b.setAttribute('aria-label', t(`tcp.mode.${m}`));
      b.onclick = () => this.setMode(m);
      bar.appendChild(b);
    }
    this.g.hud.root.appendChild(bar);
    this.modebar = bar;
  }

  protected cleanup() {
    this.modebar?.remove();
    this.modebar = null;
    this.picker.detach();
  }

  protected onSync() {
    this.modebar?.classList.toggle('hidden', this.phase !== 'betting');
    this.picker.sync();
  }

  protected validate() {
    const a = this.spots.amounts();
    const any = ['ante', 'pairPlus', 'lucky6', 'prime'].some((k) => (a[k] ?? 0) >= TCP.minBet);
    if (!any) return t('tcp.needBet');
    if (!this.g.wallet.canAfford(this.spots.total)) return t('toast.noFunds');
    return '';
  }

  private unseen(known: Card[]) {
    return ALL_CARDS.filter((c) => !known.includes(c));
  }

  protected advice() {
    const d = this.decide;
    if (!d) return null;
    if (d.stage === 'draw') {
      const i = bestDiscard(d.player, this.unseen(d.player));
      this.picker.set(i >= 0 ? [i] : []);
      return i >= 0 ? { id: 'draw', msg: t('tcp.hintDraw') } : { id: 'keep', msg: t('tcp.hintKeep') };
    }
    const known = [...d.player, ...(d.up !== undefined ? [d.up] : []), ...(d.board ?? [])];
    const b = bestPlay({ mode: this.mode, player: d.player, up: d.up, board: d.board, pool: this.unseen(known) }, 2500);
    if (!b.m) return { id: 'fold', msg: t('tcp.hintFold') };
    return { id: `play${b.m}`, msg: t('tcp.hintPlay', { n: b.m, ev: `${b.ev >= 0 ? '+' : ''}${b.ev.toFixed(2)}` }) };
  }

  protected async playRound() {
    const { stage, wallet, sfx, hud, fx } = this.g;
    const mode = this.mode;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const holdem = mode === 'holdem';
    const n = holdem ? 2 : 3;
    const pPl = row(0, pz, n, GAP);
    const dPl = row(0, dz, n, GAP);
    let player: Card[] = [];
    let dealer: Card[] = [];
    const board: Card[] = [];
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    const b3: Card3D[] = [];

    // deal: player, dealer, alternately (Face Up: the dealer's first card lands face up)
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < n; i++) {
      const pc = this.shoe.draw();
      const dc = this.shoe.draw();
      player.push(pc);
      dealer.push(dc);
      jobs.push(this.cardsT.deal(pc, pPl[i], false).then((c) => (p3[i] = c)));
      await wait(0.22);
      jobs.push(this.cardsT.deal(dc, dPl[i], mode === 'faceup' && i === 0).then((c) => (d3[i] = c)));
      await wait(0.22);
    }
    if (holdem) {
      const bz = stage.screenToTable(0.5, V.board).z;
      const bPl = row(0, bz, 2, 0.74);
      for (let i = 0; i < 2; i++) {
        const c = this.shoe.draw();
        board.push(c);
        jobs.push(this.cardsT.deal(c, bPl[i], i === 0).then((x) => (b3[i] = x)));
        await wait(0.22);
      }
    }
    await Promise.all(jobs);
    for (const c of p3) {
      this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await wait(0.5);
    const tagPlayer = (h: Hand3) => {
      this.clearTags();
      this.tag(hand3Name(h), '', 0, pz + 0.52);
    };
    tagPlayer(holdem ? best3([...player, board[0]]) : eval3(player));

    // Draw: replace up to one card
    if (mode === 'draw') {
      this.decide = { stage: 'draw', player };
      this.picker.attach(p3, 1);
      hud.toast(t('tcp.pickDraw'), 1800);
      const pick = await this.choose([
        { id: 'keep', label: t('tcp.keep'), color: 'blue', icon: 'check' },
        { id: 'draw', label: t('tcp.drawBtn'), color: 'green', icon: 'cycle', enabled: false },
      ]);
      const sel = [...this.picker.sel];
      this.picker.detach();
      this.decide = null;
      if (pick === 'draw' && sel.length) {
        const i = sel[0];
        const old = p3[i];
        sfx.play('shove', { vol: 0.6 });
        await arcTo(old.obj, new THREE.Vector3(old.obj.position.x, 0.4, dz - 1.4), 0.35, 0.2, 'power2.in');
        this.g.cards.destroy(old);
        this.cardsT.all.splice(this.cardsT.all.indexOf(old), 1);
        player = player.map((c, j) => (j === i ? this.shoe.draw() : c));
        p3[i] = await this.cardsT.deal(player[i], pPl[i], false, { dur: 0.42 });
        await this.cardsT.flip(p3[i], 0.45);
        tagPlayer(eval3(player));
      } else p3.forEach((c, i) => arcTo(c.obj, pPl[i].pos, 0.15, 0.02));
    }

    let mult = 0;
    if (bets.ante > 0) {
      const h = holdem ? best3([...player, board[0]]) : eval3(player);
      const allowed = allowedMultiples(mode, h);
      this.decide = { stage: 'play', player, up: mode === 'faceup' ? dealer[0] : undefined, board: holdem ? [board[0]] : undefined };
      const opts =
        mode === 'ultimate'
          ? [
              { id: 'fold', label: t('btn.fold'), color: 'red' as const, icon: 'fold' as const },
              { id: 'play1', label: '1×', color: 'blue' as const, text: '1×', enabled: wallet.canAfford(bets.ante) },
              { id: 'play2', label: '2×', color: 'gold' as const, text: '2×', enabled: allowed.includes(2) && wallet.canAfford(bets.ante * 2) },
              { id: 'play3', label: '3×', color: 'green' as const, text: '3×', enabled: allowed.includes(3) && wallet.canAfford(bets.ante * 3) },
            ]
          : [
              { id: 'fold', label: t('btn.fold'), color: 'red' as const, icon: 'fold' as const },
              { id: 'play1', label: t('btn.play'), color: 'green' as const, icon: 'play' as const, enabled: wallet.canAfford(bets.ante) },
            ];
      const pick = await this.choose(opts);
      this.decide = null;
      mult = pick === 'fold' ? 0 : Number(pick.slice(4));
      if (mult) await this.place('play', bets.ante * mult);
      else {
        sfx.play('shove', { vol: 0.6 });
        for (const c of p3) this.cardsT.flip(c, 0.4);
      }
    }

    // reveal the rest
    await wait(0.3);
    if (holdem) await this.cardsT.flip(b3[1], 0.55);
    for (const c of d3) {
      if (!c.faceUp) await this.cardsT.flip(c, 0.5);
      await wait(0.05);
    }
    if (mode === 'draw') {
      const i = dealerDrawIndex(dealer);
      if (i >= 0) {
        hud.toast(t('tcp.dealerDraws'), 1200);
        const old = d3[i];
        sfx.play('shove', { vol: 0.6 });
        await arcTo(old.obj, new THREE.Vector3(old.obj.position.x, 0.4, dz - 1.4), 0.35, 0.2, 'power2.in');
        this.g.cards.destroy(old);
        this.cardsT.all.splice(this.cardsT.all.indexOf(old), 1);
        dealer = dealer.map((c, j) => (j === i ? this.shoe.draw() : c));
        d3[i] = await this.cardsT.deal(dealer[i], dPl[i], true, { dur: 0.45 });
      }
    }
    const ph = holdem ? best3([...player, ...board]) : eval3(player);
    const dh = holdem ? best3([...dealer, ...board]) : eval3(dealer);
    const main = settleMain(mode, ph, dh, bets.ante ?? 0, mult ? bets.ante * mult : 0);
    if (holdem) tagPlayer(ph);
    this.tag(main.qualifies ? hand3Name(dh) : t('tcp.noQualify'), 'dealer', 0, dz + 0.52);

    // side bets (on the final hand)
    const ppMult = PAIR_PLUS[ph.cat] ?? 0;
    const pairPlusRet = (bets.pairPlus ?? 0) > 0 && ppMult > 0 ? bets.pairPlus * (1 + ppMult) : 0;
    const six = !holdem ? settleTcp(player, dealer, { ante: 0, pairPlus: 0, lucky6: bets.lucky6 ?? 0 }, false) : null;
    const lucky6Ret = six?.ret.lucky6 ?? 0;
    const pm = mode === 'prime' ? primeMult(player, dealer) : 0;
    const primeRet = (bets.prime ?? 0) > 0 && pm > 0 ? bets.prime * (1 + pm) : 0;

    const playerCards3 = holdem ? [...p3, ...b3].filter((c) => (ph as Hand3 & { cards: Card[] }).cards.includes(c.card!)) : p3;
    if ((mult && main.cmp > 0 && main.qualifies) || pairPlusRet > 0) {
      highlightCards(this.g, playerCards3);
      fx.burst(new THREE.Vector3(0, 0.3, pz), ph.cat >= Cat3.Straight ? 140 : 70);
    }
    if (pairPlusRet > 0) this.paytable?.highlight(this.rowCats.findIndex((r) => r[1] === ph.cat));
    if (six && lucky6Ret > 0) {
      this.paytable?.highlight(this.rowCats.findIndex((r) => r[2] === six.six.cat));
      highlightCards(this.g, [...p3, ...d3].filter((c) => six.six.cards.includes(c.card!)), '#9fe8ff');
      this.tag(`${t('tcp.lucky6')} · ${hand5Name(six.six)}`, 'win', 0, (pz + dz) / 2 + 0.05);
    }
    if (primeRet > 0) {
      highlightCards(this.g, pm === 4 ? [...p3, ...d3] : p3, pm === 4 ? '#ffb3e6' : '#ffd27a');
      this.tag(`${t('tcp.prime')} · ${pm === 4 ? t('tcp.sixColour') : t('tcp.threeColour')}`, 'win', 0, (pz + dz) / 2 - 0.18);
    }
    const big =
      ph.cat >= Cat3.Straight && (pairPlusRet > 0 || main.bonus > 0)
        ? hand3Name(ph).toUpperCase()
        : lucky6Ret > 0 && (six?.lucky6Mult ?? 0) >= 10
          ? t('tcp.lucky6Win')
          : pm === 4 && primeRet > 0
            ? t('tcp.primeWin')
            : undefined;
    await this.settle(
      { ante: main.ante, play: main.play, pairPlus: pairPlusRet, lucky6: lucky6Ret, prime: primeRet },
      { big, folded: !mult && !bets.pairPlus && !bets.lucky6 && !bets.prime },
    );
    this.paytable?.highlight(null);
  }
}
