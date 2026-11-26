import * as THREE from 'three';
import { t } from '../../../core/i18n';
import { browserStore } from '../../../core/storage';
import { money } from '../../../core/wallet';
import { slideCard, wait, type Place } from '../../../table/anim';
import type { Card3D } from '../../../table/cardMesh';
import type { FeltKey } from '../../../table/table';
import { CardPicker, finishXP, resultBanner, row, type SpotDef } from '../../kit';
import { TableGame } from '../../tableGame';
import type { GameCtx } from '../../types';
import { resumeRound, type BaseRound, type BetLimits, type RoundEnv, type Snapshot } from '../shared/round';
import { ModeStore } from '../shared/store';

/**
 * Shared table glue for the Brazilian games: rounds run on their own engines (which take the bets
 * from the shared wallet and save every step); this class only places existing table pieces —
 * bet circles, cards, the card picker, action buttons and banners.
 */
export abstract class BrazilTable<R extends BaseRound<string, object>> extends TableGame {
  protected debitsOnDeal = false;
  protected readonly store: ModeStore;
  protected round: R | null = null;
  protected picker: CardPicker;
  /** Cards dealt first in the next round (testing from the console). */
  rig: number[] | null = null;
  private resumedOnce = false;

  constructor(
    g: GameCtx,
    readonly mode: string,
    private limits: BetLimits,
    pickLabel: string,
  ) {
    super(g, 1);
    this.store = new ModeStore(mode, browserStore());
    this.picker = new CardPicker(g, 1, pickLabel);
  }

  protected abstract readonly felt: FeltKey;
  /** A new round object (not started). */
  protected abstract createRound(env: RoundEnv, snap?: Snapshot<string, object>): R;
  /** Takes the opening bet in the engine and plays the round to its end. */
  protected abstract runRound(round: R, fresh: boolean): Promise<void>;

  protected env(): RoundEnv {
    return { bank: this.g.wallet, store: this.store };
  }

  protected spotDefs(): SpotDef[] {
    return [{ id: 'ANTE', label: t('br.ante'), u: 0.5, v: 0.77, size: 0.58, max: this.limits.max }];
  }

  protected defaultBets(): Record<string, number> {
    return { ANTE: 25 };
  }

  protected validate() {
    const a = this.spots.amounts().ANTE ?? this.spots.amounts().BET ?? 0;
    if (a < this.limits.min) return t('br.needAnte');
    if (a % this.limits.step) return t('br.step', { n: this.limits.step });
    if (!this.g.wallet.canAfford(a)) return t('toast.noFunds');
    return '';
  }

  protected onSync() {
    this.picker.sync();
  }

  protected cleanup() {
    this.picker.detach();
    this.round = null;
  }

  async enter() {
    await super.enter();
    if (this.resumedOnce) return;
    this.resumedOnce = true;
    // a round cut short last time comes back exactly as it was (or is refunded)
    const { round, refunded } = resumeRound(this.env(), (s) => this.createRound(this.env(), s));
    if (refunded) this.g.hud.toast(t('br.refunded', { n: money(refunded) }), 3000);
    if (round) {
      this.g.hud.toast(t('br.resumed'), 2400);
      const stakes = Object.fromEntries(round.bets.map((b) => [b.name, b.amount]));
      await this.resumeRound(stakes, () => this.play(round, false));
    }
  }

  protected async playRound() {
    const r = this.createRound(this.env());
    await this.play(r, true);
  }

  private async play(r: R, fresh: boolean) {
    this.round = r;
    try {
      await this.runRound(r, fresh);
    } finally {
      this.picker.detach();
    }
  }

  // ---------------------------------------------------------------- helpers
  protected slots(u: number, v: number, n: number, gap: number): Place[] {
    const z = this.g.stage.screenToTable(u, v).z;
    const x = this.g.stage.screenToTable(u, v).x;
    return row(x, z, n, gap, 0.0035);
  }

  /** Lets the player tap up to `max` cards, then press one of the buttons. */
  protected async pickCards(cards: Card3D[], max: number, buttons: { id: string; label: string; color: 'green' | 'blue' | 'gold' | 'red'; icon: 'check' | 'deal' | 'knock' | 'redo'; needs?: boolean }[], label?: string): Promise<{ id: string; picked: number[] }> {
    this.picker.attach(cards, max);
    if (label) this.g.hud.toast(label, 2000);
    for (;;) {
      const id = await this.choose(buttons.map(({ needs: _n, ...b }) => b));
      const picked = [...this.picker.sel].sort((a, b) => a - b);
      const spec = buttons.find((b) => b.id === id)!;
      if (spec.needs && !picked.length) {
        this.g.hud.toast(t('br.pickFirst'));
        continue;
      }
      this.picker.detach();
      return { id, picked };
    }
  }

  /** Replaced cards fly off; their replacements come from the deck box. */
  protected async replace(c3: Card3D[], index: number, card: number | null, to: Place) {
    const old = c3[index];
    const away = old.obj.position.clone().setZ(old.obj.position.z + (card === null ? -1.6 : 1.6)).setY(0.4);
    this.g.sfx.play('shove', { vol: 0.5 });
    await slideCard(old, { pos: away, yaw: 0 }, 0.3, 0.2);
    this.g.cards.destroy(old);
    this.cardsT.all.splice(this.cardsT.all.indexOf(old), 1);
    c3[index] = await this.cardsT.deal(card, to, card !== null, { dur: 0.42 });
  }

  /** Chips: wins are paid beside the bet, losses taken, pushes left to sweep back. */
  protected async settleChips(r: R, big?: string) {
    const jobs: Promise<void>[] = [];
    for (const b of r.bets) {
      if (!this.spots.spots.has(b.name)) continue;
      if (b.state === 'WIN') jobs.push(this.spots.payout(b.name, (b.returned ?? 0) - b.amount));
      else if (b.state === 'LOSS' || b.state === 'FOLD') jobs.push(this.spots.lose(b.name));
    }
    await Promise.all(jobs);
    const banner = resultBanner(this.g, r.net, r.totalBet, { big: r.net > 0 ? big : undefined, folded: r.outcome === 'FOLD' });
    await finishXP(this.g, r.totalBet, r.net, banner);
    await wait(0.2);
  }

  protected glow(cards: Card3D[], color = '#ffd27a') {
    for (const c of cards) this.g.fx.glow(new THREE.Vector3(c.obj.position.x, 0, c.obj.position.z), 0.9, 1.15, 1.6, color);
  }
}
