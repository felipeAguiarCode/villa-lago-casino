import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import type { Card } from '../../core/cards';
import { squeezeCard, wait, type Place } from '../../table/anim';
import { REST_Y, type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import type { Pin } from '../../ui/hud';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { BAC, playCoup, settleBac, total, type Side, type Winner } from './rules';

addStrings(
  {
    'bac.player': 'PLAYER',
    'bac.banker': 'BANKER',
    'bac.tie': 'TIE',
    'bac.print1': 'BACCARAT',
    'bac.print2': 'Banker pays 0.95 to 1 · Tie pays 8 to 1',
    'bac.needBet': 'Bet on PLAYER, BANKER or TIE',
    'bac.playerWins': 'PLAYER WINS',
    'bac.bankerWins': 'BANKER WINS',
    'bac.tieWins': 'TIE',
    'bac.natural': 'Natural {n}',
    'bac.hint': 'Banker has the lowest house edge (1.06%)',
    'bac.rules': `
      <p>Bet on the hand you think will finish closer to <b>9</b>: <b>Player</b>, <b>Banker</b> or a <b>Tie</b>. The cards are dealt by fixed rules — there are no decisions after betting.</p>
      <h4>Card values</h4>
      <p>Ace 1 · 2–9 face value · 10 and face cards 0. Only the last digit of the total counts (7 + 8 = 5).</p>
      <h4>Drawing rules</h4>
      <p>Two cards each. An 8 or 9 is a <b>natural</b> and both stand. Player draws a third card on 0–5. Banker then draws by the standard third-card table.</p>
      <h4>Payouts</h4>
      <p>Player 1:1 · Banker 0.95:1 (5% commission) · Tie 8:1. Player and Banker bets push on a tie.</p>`,
  },
  {
    'bac.print2': 'Banker paga 0,95 para 1 · Empate paga 8 para 1',
    'bac.needBet': 'Aposte em PLAYER, BANKER ou TIE',
    'bac.playerWins': 'PLAYER VENCE',
    'bac.bankerWins': 'BANKER VENCE',
    'bac.tieWins': 'EMPATE',
    'bac.natural': 'Natural {n}',
    'bac.hint': 'O Banker tem a menor vantagem da casa (1,06%)',
    'bac.rules': `
      <p>Aposte na mão que vai terminar mais perto de <b>9</b>: <b>Player</b>, <b>Banker</b> ou <b>Empate (Tie)</b>. As cartas seguem regras fixas — não há decisões depois da aposta.</p>
      <h4>Valores</h4>
      <p>Ás 1 · 2–9 pelo número · 10 e figuras 0. Só conta o último dígito do total (7 + 8 = 5).</p>
      <h4>Terceira carta</h4>
      <p>Duas cartas para cada lado. 8 ou 9 é <b>natural</b> e ninguém compra. O Player compra com 0–5. O Banker compra pela tabela padrão da terceira carta.</p>
      <h4>Pagamentos</h4>
      <p>Player 1:1 · Banker 0,95:1 (5% de comissão) · Empate 8:1. Player e Banker empatam se der Tie.</p>`,
  },
);

const V = { hands: 0.43, print: 0.25 };
const ROAD_KEY = 'vlc.bacroad.v1';

export class BaccaratView extends TableGame {
  readonly id = 'baccarat';
  readonly title = 'Baccarat';
  protected readonly felt = 'baccarat' as const;
  private road: Winner[] = [];
  private roadEl: HTMLElement | null = null;
  private bubbles: { player: Pin | null; banker: Pin | null } = { player: null, banker: null };
  private center = { player: new THREE.Vector3(), banker: new THREE.Vector3() };

  constructor(g: GameCtx) {
    super(g, BAC.decks);
    try {
      this.road = JSON.parse(localStorage.getItem(ROAD_KEY) ?? '[]');
    } catch {
      this.road = [];
    }
  }

  rules() {
    return t('bac.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'tie', label: t('bac.tie'), sub: '8:1', u: 0.5, v: 0.64, size: 0.56, max: 1000 },
      { id: 'player', label: t('bac.player'), sub: '1:1', u: 0.23, v: 0.735, size: 0.72, max: BAC.maxBet },
      { id: 'banker', label: t('bac.banker'), sub: '0.95:1', u: 0.77, v: 0.735, size: 0.72, max: BAC.maxBet },
    ];
  }

  protected defaultBets() {
    return { banker: 25 };
  }

  protected decorate() {
    const { table, hud, stage } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('bac.print1'), y: 92, R: 1100, font: FONT.title(70), spacing: 8 },
          { text: t('bac.print2'), y: 160, R: 1100, font: FONT.italic(42), color: INK_SOFT },
        ],
        200,
      ),
      0.5,
      V.print,
      3.25,
    );
    // PLAYER / BANKER card boxes
    const box = (label: string, color: string) => {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 400;
      const g = cv.getContext('2d')!;
      g.strokeStyle = GOLD;
      g.globalAlpha = 0.8;
      g.lineWidth = 5;
      g.beginPath();
      g.roundRect(12, 60, 488, 328, 34);
      g.stroke();
      g.fillStyle = color;
      g.font = '700 54px "Cinzel", serif';
      g.textAlign = 'center';
      g.fillText(label, 256, 48);
      return cv;
    };
    const hz = stage.screenToTable(0.5, V.hands).z;
    this.center.player.set(-0.82, 0, hz);
    this.center.banker.set(0.82, 0, hz);
    table.addDecalAt(box(t('bac.player'), '#8fb6ff'), -0.82, hz - 0.08, 1.5);
    table.addDecalAt(box(t('bac.banker'), '#ff9a8f'), 0.82, hz - 0.08, 1.5);
    this.roadEl = document.createElement('div');
    this.roadEl.className = 'roadmap';
    hud.root.appendChild(this.roadEl);
    this.renderRoad();
    this.bubbles.player = hud.pin('bubble');
    this.bubbles.banker = hud.pin('bubble');
  }

  protected cleanup() {
    this.roadEl?.remove();
    this.roadEl = null;
    this.bubbles.player?.remove();
    this.bubbles.banker?.remove();
    this.bubbles = { player: null, banker: null };
  }

  private renderRoad() {
    if (!this.roadEl) return;
    const last = this.road.slice(-42);
    this.roadEl.innerHTML = last.map((w) => `<i class="${w === 'player' ? 'P' : w === 'banker' ? 'B' : 'T'}">${w === 'player' ? 'P' : w === 'banker' ? 'B' : 'T'}</i>`).join('');
  }

  protected onSync() {
    for (const side of ['player', 'banker'] as const) {
      const b = this.bubbles[side];
      if (!b) continue;
      const c = this.center[side];
      const p = this.g.stage.toScreen(new THREE.Vector3(c.x, 0, c.z - 0.78));
      b.place(p.x, p.y);
    }
  }

  protected validate() {
    if (this.spots.total < BAC.minBet) return t('bac.needBet');
    return '';
  }

  protected advice() {
    return null;
  }

  private places(side: Side, n: number): Place {
    const c = this.center[side];
    if (n < 2) return { pos: new THREE.Vector3(c.x + (n - 0.5) * 0.66, REST_Y + n * 0.003, c.z), yaw: 0 };
    // third card turned sideways under the two, as dealt in a real casino
    return { pos: new THREE.Vector3(c.x, REST_Y + 0.008, c.z + 0.6), yaw: Math.PI / 2 };
  }

  private setBubble(side: Side, cards: Card[], cls = '') {
    const b = this.bubbles[side];
    if (!b) return;
    b.set(String(total(cards)), `bubble down ${cls}`.trim());
    b.pop();
    b.show(true);
  }

  protected async playRound() {
    const bets = this.spots.amounts();
    const coup = playCoup(this.shoe);
    const shown: Record<Side, Card[]> = { player: [], banker: [] };
    const c3: Record<Side, Card3D[]> = { player: [], banker: [] };
    this.bubbles.player?.show(false);
    this.bubbles.banker?.show(false);

    // first four cards face down: P, B, P, B
    const first = coup.steps.slice(0, 4);
    const counts: Record<Side, number> = { player: 0, banker: 0 };
    const jobs: Promise<unknown>[] = [];
    for (const st of first) {
      const k = counts[st.side]++;
      jobs.push(this.cardsT.deal(st.card, this.places(st.side, k), false).then((c) => (c3[st.side][k] = c)));
      await wait(0.25);
    }
    await Promise.all(jobs);
    await wait(0.2);

    const reveal = async (side: Side, k: number, squeeze: boolean) => {
      const c = c3[side][k];
      if (squeeze) {
        this.g.sfx.play('fan', { vol: 0.4 });
        await squeezeCard(c, () => this.g.sfx.play('place', { vol: 0.6 }));
      } else await this.cardsT.flip(c, 0.5);
      shown[side].push(c.card!);
      this.setBubble(side, shown[side]);
    };
    // player's cards, then banker's (second card squeezed)
    await reveal('player', 0, false);
    await reveal('player', 1, true);
    await reveal('banker', 0, false);
    await reveal('banker', 1, true);
    if (coup.natural) {
      const n = Math.max(total(shown.player), total(shown.banker));
      this.g.hud.toast(t('bac.natural', { n }), 1300);
      await wait(0.4);
    }
    // third cards
    for (const st of coup.steps.slice(4)) {
      await wait(0.35);
      const k = counts[st.side]++;
      c3[st.side][k] = await this.cardsT.deal(st.card, this.places(st.side, k), false);
      await reveal(st.side, k, true);
    }
    await wait(0.3);
    const w = coup.winner;
    if (w === 'tie') {
      this.setBubble('player', shown.player, 'bj');
      this.setBubble('banker', shown.banker, 'bj');
    } else {
      this.setBubble(w, shown[w], 'bj win');
      const l: Side = w === 'player' ? 'banker' : 'player';
      this.setBubble(l, shown[l], 'lose');
      highlightCards(this.g, c3[w]);
      this.g.fx.burst(new THREE.Vector3(this.center[w].x, 0.3, this.center[w].z), 90, w === 'player' ? '#9cc4ff' : '#ffb19c');
    }
    this.road.push(w);
    this.road = this.road.slice(-120);
    try {
      localStorage.setItem(ROAD_KEY, JSON.stringify(this.road));
    } catch {
      /* ignore */
    }
    this.renderRoad();
    const label = w === 'player' ? t('bac.playerWins') : w === 'banker' ? t('bac.bankerWins') : t('bac.tieWins');
    const ret = settleBac(w, { player: bets.player ?? 0, banker: bets.banker ?? 0, tie: bets.tie ?? 0 });
    const won = (w === 'tie' && bets.tie > 0) || (w !== 'tie' && (bets[w] ?? 0) > 0);
    if (!won) this.g.hud.toast(`${label} · ${total(shown.player)}–${total(shown.banker)}`, 1600);
    await this.settle(ret, { big: won ? label : undefined });
    this.bubbles.player?.show(false);
    this.bubbles.banker?.show(false);
  }
}
