import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, rankOf } from '../../core/cards';
import { wait } from '../../table/anim';
import { REST_Y } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { cmpWar, settleWar, WAR } from './rules';

addStrings(
  {
    'war.bet': 'BET',
    'war.tie': 'TIE',
    'war.war': 'WAR',
    'war.print1': 'CASINO WAR',
    'war.print2': 'Higher card wins · Aces are high',
    'war.print3': 'TIE PAYS 10 TO 1',
    'war.needBet': 'Place a BET',
    'war.tieTitle': "IT'S A TIE!",
    'war.tieText': 'Go to war (raise the same as your bet) or surrender half of it?',
    'war.goWar': 'War',
    'war.surrender': 'Surrender',
    'war.hint': 'Strategy: always go to WAR',
    'war.warWin': 'WAR WON',
    'war.rules': `
      <p>The simplest duel in the casino: you and the dealer get one card each and the <b>higher card wins</b> (Aces high, suits don't matter). The bet pays 1:1.</p>
      <h4>Tie</h4>
      <p>If the cards tie you choose: <b>Surrender</b> half of your bet, or go to <b>War</b> by raising the same amount. The dealer burns three cards and deals one more to each. If yours is equal or higher, the raise pays 1:1 and the bet pushes; otherwise both lose.</p>
      <h4>Tie bet</h4><p>Optional side bet that the first two cards tie: pays <b>10:1</b>.</p>
      <h4>Strategy</h4><p>Always go to war — surrendering costs more in the long run.</p>`,
  },
  {
    'war.print2': 'A carta mais alta vence · Ás é a mais alta',
    'war.print3': 'EMPATE PAGA 10 PARA 1',
    'war.needBet': 'Faça uma APOSTA',
    'war.tieTitle': 'EMPATOU!',
    'war.tieText': 'Ir à guerra (aumentar o mesmo valor da aposta) ou desistir de metade?',
    'war.goWar': 'Guerra',
    'war.surrender': 'Desistir',
    'war.hint': 'Estratégia: sempre ir à GUERRA',
    'war.warWin': 'GUERRA VENCIDA',
    'war.rules': `
      <p>O duelo mais simples do cassino: você e o dealer recebem uma carta e <b>a mais alta vence</b> (Ás é a maior; naipes não contam). A aposta paga 1:1.</p>
      <h4>Empate</h4>
      <p>Se empatar, escolha: <b>Desistir</b> de metade da aposta ou ir à <b>Guerra</b> aumentando o mesmo valor. O dealer queima três cartas e dá mais uma para cada. Se a sua for igual ou maior, o aumento paga 1:1 e a aposta empata; senão perde as duas.</p>
      <h4>Aposta Tie</h4><p>Aposta lateral de que as duas primeiras cartas empatam: paga <b>10:1</b>.</p>
      <h4>Estratégia</h4><p>Sempre vá à guerra — desistir custa mais no longo prazo.</p>`,
  },
);

const V = { dealer: 0.28, print: 0.4, player: 0.53 };

export class WarView extends TableGame {
  readonly id = 'war';
  readonly title = 'Casino War';
  protected readonly felt = 'war' as const;
  private deciding = false;

  constructor(g: GameCtx) {
    super(g, WAR.decks);
  }

  rules() {
    return t('war.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'tie', label: t('war.tie'), sub: '10:1', u: 0.5, v: 0.655, size: 0.54, max: 500 },
      { id: 'bet', label: t('war.bet'), u: 0.3, v: 0.74, size: 0.66, max: WAR.maxBet },
      { id: 'war', label: t('war.war'), u: 0.7, v: 0.74, size: 0.66, auto: true },
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
          { text: t('war.print1'), y: 112, R: 900, font: FONT.title(74), spacing: 6 },
          { text: t('war.print2'), y: 182, R: 900, font: FONT.italic(44), color: INK_SOFT },
          { text: t('war.print3'), y: 268, R: 900, font: FONT.title(36), color: GOLD, spacing: 6 },
        ],
        320,
        [
          { y: 222, R: 900, half: 0.4 },
          { y: 284, R: 900, half: 0.4 },
        ],
      ),
      0.5,
      V.print,
      3.25,
    );
    this.paytable = new Paytable(hud.root, '', [
      [t('win.you'), '1:1'],
      [`${t('war.tie')} BET`, '10:1'],
      [t('war.warWin'), `${t('war.war')} 1:1`],
    ]);
  }

  protected validate() {
    const a = this.spots.amounts();
    if ((a.bet ?? 0) < WAR.minBet) return t('war.needBet');
    return '';
  }

  protected advice() {
    return this.deciding ? { id: 'war', msg: t('war.hint') } : null;
  }

  protected async playRound() {
    const { stage, wallet, fx, sfx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const p = this.shoe.draw();
    const d = this.shoe.draw();
    const pc = this.cardsT.deal(p, { pos: new THREE.Vector3(0, REST_Y, pz), yaw: 0 }, false, { dur: 0.5 });
    await wait(0.25);
    const dc = this.cardsT.deal(d, { pos: new THREE.Vector3(0, REST_Y, dz), yaw: 0 }, false, { dur: 0.5 });
    const [p3, d3] = await Promise.all([pc, dc]);
    await wait(0.25);
    await this.cardsT.flip(p3, 0.5);
    await wait(0.2);
    await this.cardsT.flip(d3, 0.55);
    const c = cmpWar(p, d);
    let res = settleWar(p, d, { bet: bets.bet, tie: bets.tie ?? 0 });
    if (c === 0) {
      sfx.play('chips');
      this.tag(`${rankLabel(rankOf(p))} = ${rankLabel(rankOf(d))}`, 'win', 0, (pz + dz) / 2 + 0.2);
      const canWar = wallet.canAfford(bets.bet);
      this.deciding = true;
      const pick = await this.choose([
        { id: 'surrender', label: t('war.surrender'), color: 'red', icon: 'fold' },
        { id: 'war', label: t('war.goWar'), color: 'gold', icon: 'raise', enabled: canWar },
      ]);
      this.deciding = false;
      if (pick === 'war') {
        await this.place('war', bets.bet);
        // three burn cards slide out face down, then one more card each, offset to the side
        const burnX = -1.05;
        for (let i = 0; i < 3; i++) {
          this.cardsT.deal(this.shoe.draw(), { pos: new THREE.Vector3(burnX + i * 0.05, REST_Y + i * 0.004, (pz + dz) / 2), yaw: 0.2 }, false, { dur: 0.35 });
          await wait(0.16);
        }
        const wp = this.shoe.draw();
        const wd = this.shoe.draw();
        const wp3 = await this.cardsT.deal(wp, { pos: new THREE.Vector3(0.75, REST_Y, pz), yaw: 0 }, false, { dur: 0.45 });
        const wd3 = await this.cardsT.deal(wd, { pos: new THREE.Vector3(0.75, REST_Y, dz), yaw: 0 }, false, { dur: 0.45 });
        await wait(0.3);
        await this.cardsT.flip(wp3, 0.55);
        await wait(0.35);
        await this.cardsT.flip(wd3, 0.7);
        res = settleWar(p, d, { bet: bets.bet, tie: bets.tie ?? 0 }, 'war', { p: wp, d: wd });
        if (res.outcome === 'warWin') {
          highlightCards(this.g, [wp3]);
          fx.burst(new THREE.Vector3(0.75, 0.3, pz), 110);
        }
      } else {
        res = settleWar(p, d, { bet: bets.bet, tie: bets.tie ?? 0 }, 'surrender');
      }
    } else if (c > 0) {
      highlightCards(this.g, [p3]);
      fx.burst(new THREE.Vector3(0, 0.3, pz), 60);
    }
    await this.settle(res.ret, { big: res.outcome === 'warWin' ? t('war.warWin') : undefined, folded: res.outcome === 'surrender' });
  }
}
