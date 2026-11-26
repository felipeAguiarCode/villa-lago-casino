import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { cardLabel, type Card } from '../../core/cards';
import { Cat5, scoringMask, type Hand5 } from '../../core/eval5';
import { cryptoRng } from '../../core/rng';
import { slideCard, wait, type Place } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { FONT, GOLD, tablePrint } from '../../table/prints';
import { hand5Name } from '../caribbean/view';
import { CardPicker, highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { SHOWDOWN } from './config';
import { partialEval } from './hands';
import { ShowdownRound, type SdEvent } from './round';
import { estimateStrength, mcValues } from './strategy';

addStrings(
  {
    'sd.ante': 'ANTE',
    'sd.double': 'DOUBLE',
    'sd.print1': 'SHOWDOWN POKER',
    'sd.print2': 'Confirm one card per turn · Five cards each',
    'sd.print3': 'WIN PAYS 1 TO 1 · TIES PUSH',
    'sd.needAnte': 'Place a bet on ANTE',
    'sd.commit': 'Confirm',
    'sd.pickTag': 'PICK',
    'sd.pickToast': 'Tap a card, then Confirm: it joins your final hand for good',
    'sd.pickFirst': 'Tap one of your four cards first',
    'sd.dealer': 'DEALER',
    'sd.hintPick': 'Strategy: confirm the {card}',
    'sd.hintDouble': 'Strategy: DOUBLE (hand strength {n}%)',
    'sd.hintCheck': 'Strategy: CHECK (hand strength {n}%)',
    'sd.limit': 'Table limit: {n}',
    'sd.rules': `
      <p>You and the dealer each hold <b>four cards</b> and build a <b>five-card poker hand</b> one card at a time. Every turn you <b>confirm</b> one of your four cards — it moves to your final hand for good — and the next card of the deck takes its place. The dealer does the same with cards you can't see. After the fifth card the three unused cards don't count.</p>
      <h4>Betting</h4>
      <p>Bet the <b>Ante</b> to start. After your 2nd and your 4th confirmed card choose <b>Check</b> (no extra bet), <b>Double</b> (add as much as you have bet so far: 100 → 200 → 400) or <b>Fold</b> (lose what you bet, no showdown).</p>
      <h4>Showdown</h4>
      <p>The dealer's five cards are revealed and the better poker hand wins — the dealer needs no qualifying hand. A win pays <b>1:1 on the total bet</b>; a tie returns it. Suits never break ties.</p>
      <h4>Fair dealer</h4>
      <p>One 52-card deck, shuffled every round, no jokers. The dealer confirms and draws by the same rules, only knows its own cards, and your bets never change its play.</p>`,
  },
  {
    'sd.double': 'DOBRAR',
    'sd.print2': 'Confirme uma carta por turno · Cinco cartas cada',
    'sd.print3': 'VITÓRIA PAGA 1 PARA 1 · EMPATE DEVOLVE',
    'sd.needAnte': 'Aposte no ANTE',
    'sd.commit': 'Confirmar',
    'sd.pickTag': 'ESCOLHA',
    'sd.pickToast': 'Toque numa carta e em Confirmar: ela entra na sua mão final de vez',
    'sd.pickFirst': 'Toque primeiro numa das suas quatro cartas',
    'sd.hintPick': 'Estratégia: confirme o {card}',
    'sd.hintDouble': 'Estratégia: DOBRAR (força da mão {n}%)',
    'sd.hintCheck': 'Estratégia: PASSAR (força da mão {n}%)',
    'sd.limit': 'Limite da mesa: {n}',
    'sd.rules': `
      <p>Você e o dealer seguram <b>quatro cartas</b> cada e montam uma <b>mão de pôquer de cinco cartas</b>, uma carta por vez. A cada turno você <b>confirma</b> uma das suas quatro cartas — ela vai de vez para a sua mão final — e a próxima carta do baralho ocupa o lugar dela. O dealer faz o mesmo com cartas que você não vê. Depois da quinta carta, as três que sobraram não contam.</p>
      <h4>Apostas</h4>
      <p>Aposte o <b>Ante</b> para começar. Depois da 2ª e da 4ª carta confirmada escolha <b>Passar</b> (sem aposta extra), <b>Dobrar</b> (acrescenta o mesmo valor já apostado: 100 → 200 → 400) ou <b>Desistir</b> (perde o que apostou, sem showdown).</p>
      <h4>Showdown</h4>
      <p>As cinco cartas do dealer são reveladas e a melhor mão de pôquer vence — o dealer não precisa qualificar. A vitória paga <b>1:1 sobre a aposta total</b>; o empate devolve a aposta. Naipes nunca desempatam.</p>
      <h4>Dealer justo</h4>
      <p>Um baralho de 52 cartas, embaralhado a cada rodada, sem coringas. O dealer confirma e compra pelas mesmas regras, só conhece as próprias cartas e suas apostas nunca mudam a jogada dele.</p>`,
  },
);

/** Screen rows (v, from the top of the frame). */
const V = { dAvail: 0.14, dFinal: 0.27, print: 0.39, pFinal: 0.51, pAvail: 0.648, spots: 0.752 };
const GAP_FINAL = 0.64;
const GAP_AVAIL = 0.72;
/** The dealer's hidden cards sit in a tight fan at the top. */
const GAP_DEALER_FAN = 0.36;

export class ShowdownView extends TableGame {
  readonly id = 'showdown';
  readonly title = 'Showdown Poker';
  protected readonly felt = 'showdown' as const;
  protected debitsOnDeal = false;
  /** Cards dealt first in the next round (testing from the console). */
  rig: Card[] | null = null;
  private round: ShowdownRound | null = null;
  private picker: CardPicker;
  private stageN: 'pick' | 'bet' | null = null;
  private pAvail: Card3D[] = [];
  private pFinal: Card3D[] = [];
  private dAvail: Card3D[] = [];
  private dFinal: Card3D[] = [];
  private pl = { pAvail: [] as Place[], pFinal: [] as Place[], dAvail: [] as Place[], dFinal: [] as Place[] };
  private z = { pFinal: 0, dFinal: 0 };
  private firstPick = true;

  constructor(g: GameCtx) {
    super(g, 1);
    this.picker = new CardPicker(g, 1, t('sd.pickTag'), () => this.enableCommit());
  }

  rules() {
    return t('sd.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ante', label: t('sd.ante'), u: 0.25, v: V.spots, size: 0.54, max: SHOWDOWN.maxAnte },
      { id: 'double1', label: t('sd.double'), sub: 'I', u: 0.5, v: V.spots, size: 0.54, auto: true },
      { id: 'double2', label: t('sd.double'), sub: 'II', u: 0.75, v: V.spots, size: 0.54, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected decorate() {
    this.g.table.addDecal(
      tablePrint(
        [
          { text: t('sd.print1'), y: 70, R: 1100, font: FONT.title(58), spacing: 5 },
          { text: t('sd.print3'), y: 134, R: 1100, font: FONT.title(24), color: GOLD, spacing: 3 },
        ],
        170,
        [
          { y: 100, R: 1100, half: 0.34 },
          { y: 152, R: 1100, half: 0.34 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
  }

  protected cleanup() {
    this.picker.detach();
    this.round = null;
    this.stageN = null;
  }

  protected onSync() {
    this.picker.sync();
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < SHOWDOWN.minAnte) return t('sd.needAnte');
    if (!this.g.wallet.canAfford(a)) return t('toast.noFunds');
    return '';
  }

  protected advice() {
    const r = this.round;
    if (!r) return null;
    if (this.stageN === 'pick') {
      const best = mcValues(r.playerView(), cryptoRng, SHOWDOWN.hintSamples).indexOfMax;
      this.picker.set([best]);
      return { id: 'commit', msg: t('sd.hintPick', { card: cardLabel(r.playerAvailable[best]) }) };
    }
    if (this.stageN === 'bet' && r.inWindow) {
      const s = estimateStrength(r.playerView());
      const dbl = s >= SHOWDOWN.doubleAt[r.inWindow - 1] && !r.doubleBlock();
      const n = Math.round(s * 100);
      return dbl ? { id: 'double', msg: t('sd.hintDouble', { n }) } : { id: 'check', msg: t('sd.hintCheck', { n }) };
    }
    return null;
  }

  // ---------------------------------------------------------------- round
  protected async playRound() {
    const { stage, wallet } = this.g;
    const zOf = (v: number) => stage.screenToTable(0.5, v).z;
    this.z = { pFinal: zOf(V.pFinal), dFinal: zOf(V.dFinal) };
    this.pl = {
      pAvail: row(0, zOf(V.pAvail), 4, GAP_AVAIL, 0),
      pFinal: row(0, this.z.pFinal, 5, GAP_FINAL, 0),
      dAvail: row(0, zOf(V.dAvail), 4, GAP_DEALER_FAN, 0.004),
      dFinal: row(0, this.z.dFinal, 5, GAP_FINAL, 0),
    };
    this.pAvail = [];
    this.pFinal = [];
    this.dAvail = [];
    this.dFinal = [];
    const round = new ShowdownRound({ bank: wallet, rng: cryptoRng, stack: this.rig ?? undefined });
    this.rig = null;
    this.round = round;
    await this.play(round.start(this.spots.amounts().ante));
    while (round.state !== 'ROUND_COMPLETE') {
      if (round.inWindow) {
        await this.play(await this.betWindow(round));
        continue;
      }
      const card = await this.pickCard(round);
      await this.play(round.select(card));
    }
    this.round = null;
  }

  /** Waits for the player to tap one available card and confirm it. */
  private async pickCard(round: ShowdownRound): Promise<Card> {
    this.stageN = 'pick';
    this.picker.attach(this.pAvail, 1);
    if (this.firstPick) {
      this.firstPick = false;
      this.g.hud.toast(t('sd.pickToast'), 2400);
    }
    for (;;) {
      const go = this.choose([{ id: 'commit', label: t('sd.commit'), color: 'green', icon: 'check' }]);
      this.enableCommit();
      await go;
      const i = [...this.picker.sel][0];
      const card = i === undefined ? -1 : round.playerAvailable[i];
      if (i !== undefined && round.canSelect(card)) {
        this.picker.detach();
        this.stageN = null;
        return card;
      }
      this.g.hud.toast(t('sd.pickFirst'));
    }
  }

  private enableCommit() {
    const b = this.g.hud.root.querySelector<HTMLButtonElement>('.vbtn[data-id="commit"]');
    if (b) b.disabled = this.picker.sel.size !== 1;
  }

  private async betWindow(round: ShowdownRound): Promise<SdEvent[]> {
    this.stageN = 'bet';
    const block = round.doubleBlock();
    const pick = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
      { id: 'double', label: t('btn.double'), color: 'gold', icon: 'double', enabled: !block },
    ]);
    this.stageN = null;
    if (pick === 'double' && !round.doubleBlock()) return round.double();
    if (pick === 'fold') return round.fold();
    return round.check();
  }

  /** Animates the engine's events in order. */
  private async play(events: SdEvent[]) {
    const { sfx } = this.g;
    let dealing: Promise<unknown>[] = [];
    for (const e of events) {
      switch (e.t) {
        case 'deal': {
          const to = e.who === 'player' ? this.pl.pAvail[e.slot] : this.pl.dAvail[e.slot];
          const job = this.cardsT.deal(e.who === 'player' ? e.card : null, to, false, { dur: 0.46 }).then((c) => {
            (e.who === 'player' ? this.pAvail : this.dAvail)[e.slot] = c;
          });
          dealing.push(job);
          await wait(0.12);
          break;
        }
        case 'commit': {
          await Promise.all(dealing);
          dealing = [];
          const isP = e.who === 'player';
          const from = isP ? this.pAvail : this.dAvail;
          const c = from.splice(e.slot, 1)[0];
          (isP ? this.pFinal : this.dFinal).push(c);
          if (!isP) await wait(0.28);
          sfx.play('slide', { vol: 0.6 });
          await slideCard(c, (isP ? this.pl.pFinal : this.pl.dFinal)[e.index], 0.42, 0.16);
          sfx.play('place', { vol: 0.5 });
          if (isP) this.showPartial();
          break;
        }
        case 'refill': {
          const isP = e.who === 'player';
          const c = await this.cardsT.deal(isP ? e.card : null, (isP ? this.pl.pAvail : this.pl.dAvail)[e.slot], isP, { dur: 0.44 });
          (isP ? this.pAvail : this.dAvail).splice(e.slot, 0, c);
          break;
        }
        case 'bet':
          if (e.decision === 'double') await this.spots.place(e.n === 1 ? 'double1' : 'double2', e.added);
          else if (e.decision === 'fold') {
            sfx.play('shove', { vol: 0.6 });
            for (const c of [...this.pFinal, ...this.pAvail]) this.cardsT.flip(c, 0.4);
            await wait(0.45);
          } else sfx.click();
          break;
        case 'reveal':
          await wait(0.3);
          for (let i = 0; i < this.dFinal.length; i++) {
            this.dFinal[i].setCard(e.cards[i]);
            this.cardsT.flip(this.dFinal[i], 0.5);
            await wait(0.16);
          }
          await wait(0.5);
          break;
        case 'showdown':
          this.showFinal(e.player, e.dealer, e.result);
          break;
        case 'settle':
          await this.settleRound(e.result);
          break;
      }
    }
    await Promise.all(dealing);
    // the opening deal: show the player's four cards
    if (events.some((e) => e.t === 'deal')) {
      for (const c of this.pAvail) {
        this.cardsT.flip(c, 0.42);
        await wait(0.07);
      }
      await wait(0.35);
    }
  }

  /** Name of the hand being built (only pairs and better: straights and flushes need five cards). */
  private showPartial() {
    const cards = this.pFinal.map((c) => c.card!);
    const p = partialEval(cards);
    this.clearTags();
    if (p.cat >= Cat5.Pair) this.tag(hand5Name({ cat: p.cat, ranks: p.ranks, score: 0, cards }), '', 0, this.z.pFinal - 0.56);
  }

  private showFinal(ph: Hand5, dh: Hand5, result: 'win' | 'lose' | 'push') {
    this.clearTags();
    this.tag(hand5Name(ph), result === 'win' ? 'win' : '', 0, this.z.pFinal - 0.56);
    this.tag(hand5Name(dh), 'dealer', 0, this.z.dFinal + 0.54);
    const winner = result === 'lose' ? this.dFinal : this.pFinal;
    const hand = result === 'lose' ? dh : ph;
    const cards = winner.map((c) => c.card!);
    const mask = scoringMask(cards, hand);
    const glow = winner.filter((_, i) => mask[i]);
    if (result !== 'push') highlightCards(this.g, glow.length ? glow : winner, result === 'win' ? '#ffd27a' : '#9fd0ff');
    if (result === 'win') this.g.fx.burst(new THREE.Vector3(0, 0.3, this.z.pFinal), ph.cat >= Cat5.Straight ? 150 : 70);
  }

  private async settleRound(result: 'win' | 'lose' | 'push' | 'fold') {
    const a = this.spots.amounts();
    const ret: Record<string, number> = {};
    for (const id of ['ante', 'double1', 'double2']) {
      const stake = a[id] ?? 0;
      ret[id] = result === 'win' ? stake * (1 + SHOWDOWN.winPays) : result === 'push' ? stake : 0;
    }
    const ph = this.round?.playerHand;
    const big = result === 'win' && ph && ph.cat >= Cat5.Straight ? hand5Name(ph).toUpperCase() : undefined;
    await this.settle(ret, { big, folded: result === 'fold', credited: true });
  }
}
