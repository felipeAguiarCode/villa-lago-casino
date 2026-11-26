import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { cardLabel, type Card } from '../../core/cards';
import { Cat5, type Hand5 } from '../../core/eval5';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { slideChips, wait, type Place } from '../../table/anim';
import type { Card3D } from '../../table/cardMesh';
import { ChipPile } from '../../table/chips';
import { FONT, GOLD, tablePrint } from '../../table/prints';
import { ICONS, type IconName } from '../../ui/icons';
import type { Pin } from '../../ui/hud';
import { hand5Name } from '../caribbean/view';
import { finishXP, highlightCards, resultBanner, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import type { Legal } from './betting';
import { ABYSS } from './config';
import { equity } from './dealerAI';
import { bestHand } from './evaluator';
import { knowledgeFrom } from './intel';
import { AbyssRound, type AbEvent, type SkillOffer } from './round';
import type { Settlement } from './settlement';
import { skillDef, SKILLS, type SkillCategory, type SkillId, type SkillInfo } from './skills';

const SKILL_TEXT_EN: Record<SkillId, [string, string]> = {
  sharpEye: ['Sharp Eye', "Tells whether the dealer's two hole cards are a pair."],
  suitReader: ['Suit Reader', "Tells whether the dealer's hole cards share a suit."],
  highCardReader: ['High Card Reader', 'Tells whether the dealer holds at least one J, Q, K or A.'],
  connectionReader: ['Connection Reader', "Tells whether the dealer's hole cards are consecutive (A-K and A-2 count)."],
  pressure: ['Pressure', 'This street the dealer is 20 points more likely to fold to your bets. No guarantee.'],
  lockRaise: ['Lock Raise', "The dealer can't raise this street."],
  handReader: ['Hand Reader', 'Shows the category of the best hand the dealer has right now (after the flop).'],
  blockBet: ['Block Bet', "The dealer can't open a bet this street. It can still answer yours."],
  revealCard: ['Reveal Card', "Turns one of the dealer's hole cards face up, at random."],
  peek: ['Peek', 'Shows the next community card before it is dealt (before the river).'],
  makeEmChase: ["Make 'Em Chase", "The dealer can't fold this street: it must call or raise your bets."],
};
const SKILL_TEXT_PT: Record<SkillId, [string, string]> = {
  sharpEye: ['Olho Aguçado', 'Diz se as duas cartas do dealer formam um par.'],
  suitReader: ['Leitor de Naipes', 'Diz se as cartas do dealer são do mesmo naipe.'],
  highCardReader: ['Leitor de Cartas Altas', 'Diz se o dealer tem pelo menos um J, Q, K ou A.'],
  connectionReader: ['Leitor de Conexões', 'Diz se as cartas do dealer são consecutivas (A-K e A-2 valem).'],
  pressure: ['Pressão', 'Nesta rua o dealer fica 20 pontos mais propenso a desistir das suas apostas. Sem garantia.'],
  lockRaise: ['Travar Aumento', 'O dealer não pode aumentar nesta rua.'],
  handReader: ['Leitor de Mão', 'Mostra a categoria da melhor mão do dealer agora (depois do flop).'],
  blockBet: ['Bloquear Aposta', 'O dealer não pode abrir aposta nesta rua. Ainda pode responder às suas.'],
  revealCard: ['Revelar Carta', 'Vira para cima uma das cartas do dealer, ao acaso.'],
  peek: ['Espiar', 'Mostra a próxima carta comunitária antes de sair (antes do river).'],
  makeEmChase: ['Obrigar a Pagar', 'O dealer não pode desistir nesta rua: tem de pagar ou aumentar suas apostas.'],
};

const skillStrings = (src: Record<SkillId, [string, string]>) => Object.fromEntries(SKILLS.flatMap((s) => [[`ab.sk.${s.id}`, src[s.id][0]], [`ab.skd.${s.id}`, src[s.id][1]]]));

const rulesSkills = (lang: 'en' | 'pt') => {
  const src = lang === 'en' ? SKILL_TEXT_EN : SKILL_TEXT_PT;
  return SKILLS.map((s) => `<div class="codex-row"><span><b>${src[s.id][0]}</b> · ${lang === 'en' ? 'Tier' : 'Nível'} ${'I II III IV'.split(' ')[s.tier - 1]} (${Math.round(ABYSS.tierRates[s.tier] * 100)}%) — ${src[s.id][1]}</span></div>`).join('');
};

addStrings(
  {
    'ab.ante': 'ANTE',
    'ab.print1': 'ABYSS POKER',
    'ab.print2': "Heads-up Hold'em against the dealer",
    'ab.print3': 'WINNER TAKES THE POT · TIES SPLIT',
    'ab.needAnte': 'Place a bet on ANTE',
    'ab.call': 'Call {n}',
    'ab.bet': 'Bet',
    'ab.raise': 'Raise',
    'ab.skills': 'Skills',
    'ab.betTitle': 'How much?',
    'ab.betText': 'Pot {pot} · you can still bet {left}',
    'ab.min': 'Min',
    'ab.half': '½ Pot',
    'ab.pot': 'Pot',
    'ab.say.check': 'Check',
    'ab.say.bet': 'Bet {n}',
    'ab.say.call': 'Call',
    'ab.say.raise': 'Raise {n}',
    'ab.say.fold': 'Fold',
    'ab.in.pair.y': 'Pair',
    'ab.in.pair.n': 'No pair',
    'ab.in.suit.y': 'Suited',
    'ab.in.suit.n': 'Offsuit',
    'ab.in.high.y': 'J+ inside',
    'ab.in.high.n': 'Nothing over 10',
    'ab.in.conn.y': 'Connected',
    'ab.in.conn.n': 'Not connected',
    'ab.in.hand': '{hand} ({street})',
    'ab.in.pressure': '⚡ Pressure',
    'ab.in.lockRaise': '⚡ No raise',
    'ab.in.blockBet': '⚡ No bet',
    'ab.in.makeEmChase': "⚡ Can't fold",
    'ab.double': 'Double',
    'ab.allin': 'All-in',
    'ab.cancel': 'Back',
    'ab.buy': 'Buy',
    'ab.buyTitle': 'Buy {name}?',
    'ab.buyText': '{price} chips, spent for good: they are not part of the pot and are not returned.',
    'ab.skillsTitle': 'Skills',
    'ab.skillsNote': 'Price = {rate} of the matched pot (max {cap}). One skill per street, each once per hand.',
    'ab.tier': 'Tier {n} · {cat}',
    'ab.why.state': 'Not now',
    'ab.why.used': 'Already used',
    'ab.why.street': 'Not on this street',
    'ab.why.useless': "Can't take effect now",
    'ab.why.funds': 'Insufficient balance',
    'ab.why.budget': 'Would leave nothing to bet',
    'ab.why.call': 'Would leave too little to call',
    'ab.cat.Observation': 'Observation',
    'ab.cat.Manipulation': 'Manipulation',
    'ab.cat.Intelligence': 'Intelligence',
    'ab.cat.Dominance': 'Dominance',
    'ab.prof.conservative': 'Conservative dealer',
    'ab.prof.balanced': 'Balanced dealer',
    'ab.prof.aggressive': 'Aggressive dealer',
    'ab.prof.callingStation': 'Calling-station dealer',
    'ab.prof.unpredictable': 'Unpredictable dealer',
    'ab.act.check': 'Dealer checks',
    'ab.act.bet': 'Dealer bets {n}',
    'ab.act.call': 'Dealer calls',
    'ab.act.raise': 'Dealer raises {n}',
    'ab.act.fold': 'Dealer folds',
    'ab.potN': 'Pot {n}',
    'ab.budget': 'Can bet {left} · skills {spent}',
    'ab.info.pair.y': 'Dealer has a pair',
    'ab.info.pair.n': 'Dealer has no pair',
    'ab.info.suit.y': 'Dealer cards are suited',
    'ab.info.suit.n': 'Dealer cards are not suited',
    'ab.info.high.y': 'Dealer holds J, Q, K or A',
    'ab.info.high.n': 'Dealer has nothing above 10',
    'ab.info.conn.y': 'Dealer cards are connected',
    'ab.info.conn.n': 'Dealer cards are not connected',
    'ab.info.hand': 'Dealer has {hand} ({street})',
    'ab.info.card': 'Dealer card: {card}',
    'ab.info.peek': 'Next card: {card}',
    'ab.fx.pressure': 'Pressure on the dealer this street',
    'ab.fx.lockRaise': "The dealer can't raise this street",
    'ab.fx.blockBet': "The dealer can't open a bet this street",
    'ab.fx.makeEmChase': "The dealer can't fold this street",
    'ab.expired': 'Skill effects ended with the street',
    'ab.st.PRE_FLOP': 'pre-flop',
    'ab.st.FLOP': 'flop',
    'ab.st.TURN': 'turn',
    'ab.st.RIVER': 'river',
    'ab.hint': 'Strategy: {act} (equity {eq}%{odds})',
    'ab.hintOdds': ' · pot odds {n}%',
    'ab.h.fold': 'FOLD',
    'ab.h.call': 'CALL',
    'ab.h.check': 'CHECK',
    'ab.h.bet': 'BET',
    'ab.h.raise': 'RAISE',
    'ab.rules': `
      <p>Heads-up Texas Hold'em against the dealer. Both put in the <b>Ante</b>; each gets two hole cards, then five community cards come in four betting rounds: <b>pre-flop</b> (you act first), <b>flop</b>, <b>turn</b> and <b>river</b> (the dealer acts first). Best five of seven cards wins the pot; ties split it. The dealer needs no qualifying hand.</p>
      <h4>Betting</h4>
      <p>Check, Bet (at least the Ante), Call, Raise (one raise per street, then only call or fold), Double (add as much as you have in) and All-in. Your budget for the hand is 10× the Ante (limited by your balance) and covers bets and skills.</p>
      <h4>The dealer</h4>
      <p>Before the deal the dealer takes one of five styles — Conservative, Balanced, Aggressive, Calling station or Unpredictable — and it bets, raises, calls, folds and bluffs from its own cards, the board and your actions. It never sees your cards or the deck.</p>
      <h4>Skills</h4>
      <p>Bought with chips on your turn, one per street, each once per hand. Price = tier rate × the matched pot, capped at 5× the Ante (a Tier IV skill costs at most one Ante). Skill chips are spent for good: never part of the pot, never returned.</p>
      <div class="codex">${rulesSkills('en')}</div>`,
    ...skillStrings(SKILL_TEXT_EN),
  },
  {
    'ab.print2': "Hold'em mano a mano contra o dealer",
    'ab.print3': 'QUEM VENCE LEVA O POTE · EMPATE DIVIDE',
    'ab.needAnte': 'Aposte no ANTE',
    'ab.call': 'Pagar {n}',
    'ab.bet': 'Apostar',
    'ab.raise': 'Aumentar',
    'ab.skills': 'Habilidades',
    'ab.betTitle': 'Quanto?',
    'ab.betText': 'Pote {pot} · você ainda pode apostar {left}',
    'ab.min': 'Mín',
    'ab.half': '½ Pote',
    'ab.pot': 'Pote',
    'ab.say.check': 'Passa',
    'ab.say.bet': 'Aposta {n}',
    'ab.say.call': 'Paga',
    'ab.say.raise': 'Aumenta {n}',
    'ab.say.fold': 'Desiste',
    'ab.in.pair.y': 'Par',
    'ab.in.pair.n': 'Sem par',
    'ab.in.suit.y': 'Mesmo naipe',
    'ab.in.suit.n': 'Naipes diferentes',
    'ab.in.high.y': 'Tem J+',
    'ab.in.high.n': 'Nada acima de 10',
    'ab.in.conn.y': 'Consecutivas',
    'ab.in.conn.n': 'Não consecutivas',
    'ab.in.pressure': '⚡ Pressão',
    'ab.in.lockRaise': '⚡ Sem aumento',
    'ab.in.blockBet': '⚡ Sem aposta',
    'ab.in.makeEmChase': '⚡ Não desiste',
    'ab.double': 'Dobrar',
    'ab.allin': 'All-in',
    'ab.cancel': 'Voltar',
    'ab.buy': 'Comprar',
    'ab.buyTitle': 'Comprar {name}?',
    'ab.buyText': '{price} fichas gastas de vez: não entram no pote e não são devolvidas.',
    'ab.skillsTitle': 'Habilidades',
    'ab.skillsNote': 'Preço = {rate} do pote igualado (máx. {cap}). Uma habilidade por rua, cada uma uma vez por mão.',
    'ab.tier': 'Nível {n} · {cat}',
    'ab.why.state': 'Agora não',
    'ab.why.used': 'Já usada',
    'ab.why.street': 'Não nesta rua',
    'ab.why.useless': 'Não teria efeito agora',
    'ab.why.funds': 'Saldo insuficiente',
    'ab.why.budget': 'Não sobraria nada para apostar',
    'ab.why.call': 'Não sobraria para pagar',
    'ab.cat.Observation': 'Observação',
    'ab.cat.Manipulation': 'Manipulação',
    'ab.cat.Intelligence': 'Inteligência',
    'ab.cat.Dominance': 'Domínio',
    'ab.prof.conservative': 'Dealer conservador',
    'ab.prof.balanced': 'Dealer equilibrado',
    'ab.prof.aggressive': 'Dealer agressivo',
    'ab.prof.callingStation': 'Dealer que paga tudo',
    'ab.prof.unpredictable': 'Dealer imprevisível',
    'ab.act.check': 'Dealer passa',
    'ab.act.bet': 'Dealer aposta {n}',
    'ab.act.call': 'Dealer paga',
    'ab.act.raise': 'Dealer aumenta {n}',
    'ab.act.fold': 'Dealer desiste',
    'ab.potN': 'Pote {n}',
    'ab.budget': 'Pode apostar {left} · habilidades {spent}',
    'ab.info.pair.y': 'Dealer tem um par',
    'ab.info.pair.n': 'Dealer não tem par',
    'ab.info.suit.y': 'Cartas do dealer do mesmo naipe',
    'ab.info.suit.n': 'Cartas do dealer de naipes diferentes',
    'ab.info.high.y': 'Dealer tem J, Q, K ou A',
    'ab.info.high.n': 'Dealer não tem nada acima de 10',
    'ab.info.conn.y': 'Cartas do dealer consecutivas',
    'ab.info.conn.n': 'Cartas do dealer não consecutivas',
    'ab.info.hand': 'Dealer tem {hand} ({street})',
    'ab.info.card': 'Carta do dealer: {card}',
    'ab.info.peek': 'Próxima carta: {card}',
    'ab.fx.pressure': 'Pressão sobre o dealer nesta rua',
    'ab.fx.lockRaise': 'O dealer não pode aumentar nesta rua',
    'ab.fx.blockBet': 'O dealer não pode abrir aposta nesta rua',
    'ab.fx.makeEmChase': 'O dealer não pode desistir nesta rua',
    'ab.expired': 'Os efeitos acabaram com a rua',
    'ab.hint': 'Estratégia: {act} (equity {eq}%{odds})',
    'ab.hintOdds': ' · pot odds {n}%',
    'ab.h.fold': 'DESISTIR',
    'ab.h.call': 'PAGAR',
    'ab.h.check': 'PASSAR',
    'ab.h.bet': 'APOSTAR',
    'ab.h.raise': 'AUMENTAR',
    'ab.rules': `
      <p>Texas Hold'em mano a mano contra o dealer. Os dois põem o <b>Ante</b>; cada um recebe duas cartas fechadas e cinco cartas comunitárias saem em quatro rodadas de aposta: <b>pré-flop</b> (você age primeiro), <b>flop</b>, <b>turn</b> e <b>river</b> (o dealer age primeiro). A melhor mão de cinco entre sete cartas leva o pote; empate divide. O dealer não precisa qualificar.</p>
      <h4>Apostas</h4>
      <p>Passar, Apostar (no mínimo o Ante), Pagar, Aumentar (um aumento por rua; depois só pagar ou desistir), Dobrar (acrescenta o que você já pôs) e All-in. Seu orçamento na mão é 10× o Ante (limitado pelo saldo) e cobre apostas e habilidades.</p>
      <h4>O dealer</h4>
      <p>Antes de distribuir, o dealer assume um de cinco estilos — Conservador, Equilibrado, Agressivo, Paga tudo ou Imprevisível — e aposta, aumenta, paga, desiste e blefa a partir das próprias cartas, da mesa e das suas ações. Ele nunca vê suas cartas nem o baralho.</p>
      <h4>Habilidades</h4>
      <p>Compradas com fichas na sua vez, uma por rua, cada uma uma vez por mão. Preço = taxa do nível × pote igualado, com teto em 5× o Ante (uma habilidade de Nível IV custa no máximo um Ante). As fichas gastas em habilidades nunca entram no pote nem voltam.</p>
      <div class="codex">${rulesSkills('pt')}</div>`,
    ...skillStrings(SKILL_TEXT_PT),
  },
);

const CAT_ICON: Record<SkillCategory, IconName> = { Observation: 'eye', Manipulation: 'bolt', Intelligence: 'crystal', Dominance: 'crown' };
const CAT_KEY: Record<Cat5, string> = {
  [Cat5.High]: 'hand.high',
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

export function infoText(i: SkillInfo): string {
  switch (i.id) {
    case 'sharpEye':
      return t(i.pair ? 'ab.info.pair.y' : 'ab.info.pair.n');
    case 'suitReader':
      return t(i.suited ? 'ab.info.suit.y' : 'ab.info.suit.n');
    case 'highCardReader':
      return t(i.high ? 'ab.info.high.y' : 'ab.info.high.n');
    case 'connectionReader':
      return t(i.connected ? 'ab.info.conn.y' : 'ab.info.conn.n');
    case 'handReader':
      return t('ab.info.hand', { hand: t(CAT_KEY[i.category]).toLowerCase(), street: t(`ab.st.${i.street}`) });
    case 'revealCard':
      return t('ab.info.card', { card: cardLabel(i.card) });
    case 'peek':
      return t('ab.info.peek', { card: cardLabel(i.card) });
  }
}

/** Short form of a discovery for the line under the dealer's cards. */
function shortInfo(i: SkillInfo): string {
  switch (i.id) {
    case 'sharpEye':
      return t(i.pair ? 'ab.in.pair.y' : 'ab.in.pair.n');
    case 'suitReader':
      return t(i.suited ? 'ab.in.suit.y' : 'ab.in.suit.n');
    case 'highCardReader':
      return t(i.high ? 'ab.in.high.y' : 'ab.in.high.n');
    case 'connectionReader':
      return t(i.connected ? 'ab.in.conn.y' : 'ab.in.conn.n');
    case 'handReader':
      return t('ab.in.hand', { hand: t(CAT_KEY[i.category]), street: t(`ab.st.${i.street}`) });
    default:
      return cardLabel(i.card);
  }
}

/** Screen rows (v from the top of the frame). */
const V = { profile: 0.098, dHole: 0.175, intel: 0.262, dSay: 0.31, pot: 0.318, board: 0.418, print: 0.678, pHole: 0.575, pSay: 0.497, spots: 0.765 };
const GAP_HOLE = 0.68;
const GAP_BOARD = 0.66;
const round5 = (x: number) => Math.round(x / 5) * 5;

export class AbyssView extends TableGame {
  readonly id = 'abyss';
  readonly title = 'Abyss Poker';
  protected readonly felt = 'abyss' as const;
  protected debitsOnDeal = false;
  /** Cards dealt first in the next hand (testing from the console). */
  rig: Card[] | null = null;
  private round: AbyssRound | null = null;
  private myTurn = false;
  private p3: Card3D[] = [];
  private d3: Card3D[] = [];
  private b3: Card3D[] = [];
  private pl = { p: [] as Place[], d: [] as Place[], b: [] as Place[] };
  private piles: { pot: ChipPile; p: ChipPile; d: ChipPile } | null = null;
  private pins: { say: Pin; pot: Pin; me: Pin; budget: Pin; intel: Pin; peek: Pin | null } | null = null;
  /** Short facts and active effects shown under the dealer's cards. */
  private intel: { text: string; control: boolean }[] = [];
  /** Pins this view shows and hides itself (TableGame tags are always visible). */
  private own: { pin: Pin; pos: THREE.Vector3; on: boolean }[] = [];
  private tmpV = new THREE.Vector3();
  private pos = { pot: new THREE.Vector3(), p: new THREE.Vector3(), d: new THREE.Vector3(), top: new THREE.Vector3(), bottom: new THREE.Vector3() };

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('ab.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [{ id: 'ante', label: t('ab.ante'), u: 0.5, v: V.spots, size: 0.6, max: ABYSS.maxAnte }];
  }

  protected defaultBets() {
    return { ante: 20 };
  }

  protected decorate() {
    this.g.table.addDecal(
      tablePrint(
        [
          { text: t('ab.print1'), y: 58, R: 1400, font: FONT.title(56), spacing: 6 },
          { text: t('ab.print3'), y: 118, R: 1400, font: FONT.title(22), color: GOLD, spacing: 3 },
        ],
        140,
        [{ y: 92, R: 1400, half: 0.3 }],
      ),
      0.5,
      V.print,
      2.9,
    );
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < ABYSS.minAnte) return t('ab.needAnte');
    if (!this.g.wallet.canAfford(a)) return t('toast.noFunds');
    return '';
  }

  protected cleanup() {
    this.disposePiles();
    this.round = null;
    this.myTurn = false;
  }

  private disposePiles() {
    if (this.piles) for (const p of Object.values(this.piles)) p.dispose();
    this.piles = null;
    this.pins = null;
    for (const o of this.own) o.pin.remove();
    this.own = [];
  }

  private pin(cls: string, x: number, z: number): Pin {
    const pin = this.g.hud.pin(`handtag ${cls}`);
    this.own.push({ pin, pos: new THREE.Vector3(x, 0, z), on: false });
    return pin;
  }

  private showPin(pin: Pin, on: boolean, text?: string) {
    const o = this.own.find((x) => x.pin === pin);
    if (!o) return;
    if (text !== undefined) pin.set(text);
    if (on && !o.on) pin.pop();
    o.on = on;
  }

  protected onSync() {
    for (const o of this.own) {
      const p = this.g.stage.toScreen(this.tmpV.copy(o.pos));
      o.pin.place(p.x, p.y);
      o.pin.show(o.on);
    }
  }

  // ---------------------------------------------------------------- hint
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn) return null;
    const eq = equity(r.playerCards, r.community, cryptoRng, ABYSS.hintSamples, knowledgeFrom(r.revealed, r.community));
    const L = r.legal();
    const owe = r.toCall;
    const odds = owe > 0 ? owe / (r.totalPot + owe) : 0;
    let act: 'fold' | 'call' | 'check' | 'bet' | 'raise';
    if (owe > 0) act = eq < odds + 0.04 ? 'fold' : eq > 0.72 && L.raise ? 'raise' : 'call';
    else act = eq > 0.62 && (L.bet || L.allin !== null) ? 'bet' : 'check';
    const id = act === 'raise' ? 'bet' : act === 'call' ? 'pass' : act === 'check' ? 'pass' : act;
    const msg = t('ab.hint', { act: t(`ab.h.${act}`), eq: Math.round(eq * 100), odds: owe > 0 ? t('ab.hintOdds', { n: Math.round(odds * 100) }) : '' });
    return { id, msg };
  }

  // ---------------------------------------------------------------- the hand
  protected async playRound() {
    const { stage } = this.g;
    const at = (u: number, v: number, y = 0) => stage.screenToTable(u, v, y);
    this.pl = {
      d: row(0, at(0.5, V.dHole).z, 2, GAP_HOLE, 0),
      b: row(0, at(0.5, V.board).z, 5, GAP_BOARD, 0),
      p: row(0, at(0.5, V.pHole).z, 2, GAP_HOLE, 0),
    };
    this.pos = { pot: at(0.5, V.pot), p: at(0.8, 0.5), d: at(0.8, 0.258), top: at(0.5, -0.12, 1.6), bottom: at(0.5, 1.05, 1.6) };
    this.p3 = [];
    this.d3 = [];
    this.b3 = [];
    const chips = this.g.chips;
    const tbl = stage.table;
    this.piles = { pot: new ChipPile(chips, tbl, this.pos.pot.clone()), p: new ChipPile(chips, tbl, this.pos.p.clone()), d: new ChipPile(chips, tbl, this.pos.d.clone()) };
    this.pins = {
      say: this.pin('dealer', at(0.8, V.dSay).x, at(0.8, V.dSay).z),
      pot: this.pin('', at(0.24, V.pot).x, at(0.24, V.pot).z),
      me: this.pin('', 0, at(0.5, V.pSay).z),
      budget: this.pin('', 0, at(0.5, 0.832).z),
      intel: this.pin('', 0, at(0.5, V.intel).z),
      peek: null,
    };
    this.intel = [];
    const r = new AbyssRound({ bank: this.g.wallet, stack: this.rig ?? undefined });
    this.rig = null;
    this.round = r;
    const ante = this.spots.amounts().ante;
    const ev = r.start(ante);
    // the Ante leaves its circle for the pot; the dealer matches it from the top
    const spot = this.spots.get('ante');
    await slideChips(spot.pile.group, this.pos.pot, 0.35, 0.05, 'power2.inOut');
    spot.pile.clear();
    spot.pile.group.position.copy(spot.pos);
    this.piles.pot.set(ante);
    await this.piles.pot.dropIn(ante, this.pos.top);
    this.updateMoney();
    await this.play(ev);
    while (r.state !== 'ROUND_COMPLETE') await this.play(await this.playerTurn(r));
    this.round = null;
  }

  /** One decision: a betting action (its events) or a skill purchase (its events). */
  private async playerTurn(r: AbyssRound): Promise<AbEvent[]> {
    for (;;) {
      const L = r.legal();
      this.myTurn = true;
      const owe = r.toCall;
      const aggressive = !!(L.bet || L.raise || L.double !== null || L.allin !== null);
      const pick = await this.choose([
        { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold', enabled: L.fold },
        owe > 0 ? { id: 'pass', label: t('ab.call', { n: money(L.call ?? 0) }), color: 'blue', icon: 'check' } : { id: 'pass', label: t('btn.check'), color: 'blue', icon: 'knock' },
        { id: 'bet', label: owe > 0 ? t('ab.raise') : t('ab.bet'), color: 'gold', icon: 'raise', enabled: aggressive },
        { id: 'skills', label: t('ab.skills'), color: 'purple', icon: 'crystal', enabled: r.offers().some((o) => !o.block) },
      ]);
      this.myTurn = false;
      if (pick === 'fold') return r.act({ type: 'fold' });
      if (pick === 'pass') return r.act(owe > 0 ? { type: 'call' } : { type: 'check' });
      if (pick === 'bet') {
        const ev = await this.betMenu(r, L);
        if (ev) return ev;
        continue;
      }
      const bought = await this.skillMenu(r);
      if (bought) await this.play(bought);
    }
  }

  private async betMenu(r: AbyssRound, L: Legal): Promise<AbEvent[] | null> {
    const owe = r.toCall;
    const opts: { id: string; label: string; amount: number; type: 'bet' | 'raise' | 'double' | 'allin' }[] = [];
    const add = (id: string, label: string, amount: number | null | undefined, type: 'bet' | 'raise' | 'double' | 'allin') => {
      if (amount === null || amount === undefined || amount <= 0) return;
      // a size that uses everything left is the All-in
      if (L.allin !== null && amount === L.allin) {
        id = 'allin';
        label = t('ab.allin');
        type = 'allin';
      }
      if (opts.some((o) => o.amount === amount)) return;
      opts.push({ id, label, amount, type });
    };
    const range = owe > 0 ? L.raise : L.bet;
    if (range) {
      const clampR = (x: number) => Math.min(range.max, Math.max(range.min, round5(x)));
      add('min', t('ab.min'), range.min, owe > 0 ? 'raise' : 'bet');
      if (owe === 0) add('half', t('ab.half'), clampR(r.matchedPot / 2), 'bet');
      add('pot', t('ab.pot'), clampR(owe > 0 ? owe + r.totalPot + owe : r.matchedPot), owe > 0 ? 'raise' : 'bet');
    }
    add('double', t('ab.double'), L.double, 'double');
    add('allin', t('ab.allin'), L.allin, 'allin');
    const shown = opts.filter((o) => o.type === 'double' || o.type === 'allin' || opts.length <= 4 || o.id !== 'half').slice(0, 4);
    const pick = await this.g.hud.prompt(
      t('ab.betTitle'),
      t('ab.betText', { pot: money(r.totalPot), left: money(r.playerRemaining) }),
      [
        ...shown.map((o) => ({ id: o.id, label: o.label, color: (o.type === 'allin' ? 'red' : o.type === 'double' ? 'gold' : 'green') as 'red' | 'gold' | 'green', text: money(o.amount) })),
        { id: 'back', label: t('ab.cancel'), color: 'dark' as const, icon: 'close' as const },
      ],
    );
    const o = shown.find((x) => x.id === pick);
    if (!o) return null;
    if (o.type === 'double') return r.act({ type: 'double' });
    if (o.type === 'allin') return r.act({ type: 'allin' });
    return r.act({ type: o.type, amount: o.amount });
  }

  /** The skill list; returns the purchase events, or null when nothing was bought. */
  private skillMenu(r: AbyssRound): Promise<AbEvent[] | null> {
    return new Promise((res) => {
      const offers = r.offers();
      const body = document.createElement('div');
      const rate = (n: 1 | 2 | 3 | 4) => `${Math.round(ABYSS.tierRates[n] * 100)}%`;
      body.innerHTML = `<p>${t('ab.skillsNote', { rate: `${rate(1)}–${rate(4)}`, cap: money(ABYSS.priceCapMult * r.ante) })}</p>`;
      const list = document.createElement('div');
      list.className = 'skills';
      body.appendChild(list);
      let done = false;
      let buying = false;
      let close = () => {};
      const finish = (v: AbEvent[] | null) => {
        if (done) return;
        done = true;
        res(v);
      };
      let tier = 0;
      for (const o of offers) {
        const def = skillDef(o.id);
        if (def.tier !== tier) {
          tier = def.tier;
          const h = document.createElement('h4');
          h.textContent = t('ab.tier', { n: 'I II III IV'.split(' ')[tier - 1], cat: t(`ab.cat.${def.category}`) });
          list.appendChild(h);
        }
        list.appendChild(this.skillRow(o, async () => {
          // closing the list to confirm is not a cancel
          buying = true;
          close();
          const yes = await this.g.hud.prompt(t('ab.buyTitle', { name: t(`ab.sk.${o.id}`) }), t('ab.buyText', { price: money(r.priceOf(o.id)) }), [
            { id: 'no', label: t('ab.cancel'), color: 'dark', icon: 'close' },
            { id: 'yes', label: t('ab.buy'), color: 'green', icon: 'check', text: money(r.priceOf(o.id)) },
          ]);
          if (yes !== 'yes' || r.skillBlock(o.id)) return finish(null);
          const ev = r.buySkill(o.id);
          finish(ev);
        }));
      }
      close = this.g.hud.modal(t('ab.skillsTitle'), body, () => {
        if (!buying) finish(null);
      });
    });
  }

  private skillRow(o: SkillOffer, onBuy: () => void): HTMLButtonElement {
    const def = skillDef(o.id);
    const b = document.createElement('button');
    b.className = 'skillrow live';
    b.disabled = !!o.block;
    b.innerHTML = `<span class="sk-ic">${ICONS[CAT_ICON[def.category]]}</span><span class="sk-txt"><b>${t(`ab.sk.${o.id}`)}</b>${t(`ab.skd.${o.id}`)}${o.block ? `<span class="sk-why">${t(`ab.why.${o.block}`)}</span>` : ''}</span><span class="sk-price">${money(o.price)}</span>`;
    b.onclick = () => {
      if (b.disabled) return;
      this.g.sfx.click();
      onBuy();
    };
    return b;
  }

  // ---------------------------------------------------------------- events → animation
  private async play(events: AbEvent[]) {
    const { sfx, hud } = this.g;
    let dealing: Promise<unknown>[] = [];
    for (const e of events) {
      switch (e.t) {
        case 'profile':
          this.tag(t(`ab.prof.${e.profile}`), 'dealer', 0, this.g.stage.screenToTable(0.5, V.profile).z);
          break;
        case 'deal': {
          const isP = e.who === 'player';
          dealing.push(
            this.cardsT.deal(isP ? e.card : null, (isP ? this.pl.p : this.pl.d)[e.index], false, { dur: 0.46 }).then((c) => {
              (isP ? this.p3 : this.d3)[e.index] = c;
            }),
          );
          await wait(0.12);
          break;
        }
        case 'action':
          await Promise.all(dealing);
          dealing = [];
          await this.showAction(e);
          break;
        case 'streetEnd':
          await this.gatherBets();
          break;
        case 'street':
          await this.dealBoard(e.cards);
          break;
        case 'skill':
          await this.showSkill(e.id, e.info);
          break;
        case 'expire':
          hud.toast(t('ab.expired'), 1300);
          this.intel = this.intel.filter((i) => !i.control);
          this.renderIntel();
          break;
        case 'reveal':
          await this.revealDealer(e.cards);
          break;
        case 'showdown':
          this.showHands(e.player, e.dealer);
          await wait(0.6);
          break;
        case 'settle':
          await this.payOut(e.settlement);
          break;
      }
    }
    await Promise.all(dealing);
    if (events.some((e) => e.t === 'deal')) {
      for (const c of this.p3) {
        this.cardsT.flip(c, 0.42);
        await wait(0.08);
      }
      await wait(0.3);
      sfx.play('place', { vol: 0.4 });
    }
    this.updateMoney();
  }

  private async showAction(e: Extract<AbEvent, { t: 'action' }>) {
    const { sfx } = this.g;
    const piles = this.piles!;
    if (e.who === 'dealer') {
      const n = e.type === 'raise' ? e.contrib.dealer - e.contrib.player : e.added;
      this.showPin(this.pins!.say, true, t(`ab.say.${e.type}`, { n: money(n) }));
      await wait(0.25);
      if (e.added > 0) {
        sfx.play('handle', { vol: 0.6 });
        await piles.d.dropIn(e.added, this.pos.top);
      } else if (e.type === 'check') sfx.play('place', { vol: 0.35, rate: 0.8 });
      else if (e.type === 'fold') sfx.play('shove', { vol: 0.6 });
      await wait(0.35);
    } else {
      if (e.added > 0) {
        sfx.play('handle', { vol: 0.6 });
        await piles.p.dropIn(e.added, this.pos.bottom);
      } else if (e.type === 'fold') {
        sfx.play('shove', { vol: 0.6 });
        for (const c of this.p3) this.cardsT.flip(c, 0.35);
        await wait(0.3);
      }
    }
    this.updateMoney();
  }

  /** The street's bets slide into the pot. */
  private async gatherBets() {
    const piles = this.piles!;
    const moving = [piles.p, piles.d].filter((p) => p.amount > 0);
    if (!moving.length) return;
    this.g.sfx.play('handle', { vol: 0.5 });
    const homes = moving.map((p) => p.group.position.clone());
    await Promise.all(moving.map((p) => slideChips(p.group, this.pos.pot, 0.4, 0.06, 'power2.inOut')));
    const sum = moving.reduce((s, p) => s + p.amount, 0);
    moving.forEach((p, i) => {
      p.clear();
      p.group.position.copy(homes[i]);
    });
    piles.pot.set(piles.pot.amount + sum);
    this.g.sfx.play('stack', { vol: 0.6 });
    this.showPin(this.pins!.say, false);
  }

  private async dealBoard(cards: Card[]) {
    const start = this.b3.length;
    const jobs = cards.map((c, i) =>
      wait(i * 0.13).then(() =>
        this.cardsT.deal(c, this.pl.b[start + i], true, { dur: 0.46 }).then((c3) => {
          this.b3[start + i] = c3;
        }),
      ),
    );
    await Promise.all(jobs);
    if (this.pins?.peek) {
      this.pins.peek.remove();
      this.pins.peek = null;
    }
    this.showMyHand();
    await wait(0.2);
  }

  private showMyHand() {
    const r = this.round;
    if (!r || r.community.length < 3) return;
    this.showPin(this.pins!.me, true, hand5Name(bestHand([...r.playerCards, ...r.community])));
  }

  private async showSkill(id: SkillId, info: SkillInfo | null) {
    const { hud, sfx } = this.g;
    sfx.play('fan', { vol: 0.5, rate: 1.3 });
    if (!info) {
      hud.toast(t(`ab.fx.${id}`), 1800);
      this.addIntel(t(`ab.in.${id}`), true);
      return;
    }
    const text = infoText(info);
    hud.toast(text, 1800);
    if (info.id === 'revealCard') {
      const c = this.d3[info.index];
      c.setCard(info.card);
      await this.cardsT.flip(c, 0.5);
    } else if (info.id === 'peek') {
      const slot = this.pl.b[this.b3.length];
      const pin = this.tag(text, 'win', slot.pos.x, slot.pos.z);
      this.pins!.peek = pin;
    } else this.addIntel(shortInfo(info), false);
  }

  /** Discovered facts stay listed under the dealer's hand until the end of the hand. */
  private addIntel(text: string, control: boolean) {
    this.intel.push({ text, control });
    this.renderIntel();
  }

  private renderIntel() {
    const pins = this.pins;
    if (!pins) return;
    this.showPin(pins.intel, this.intel.length > 0, this.intel.map((i) => i.text).join(' · '));
  }

  private async revealDealer(cards: Card[]) {
    await wait(0.2);
    for (let i = 0; i < this.d3.length; i++) {
      const c = this.d3[i];
      if (c.faceUp) continue;
      c.setCard(cards[i]);
      this.cardsT.flip(c, 0.5);
      await wait(0.2);
    }
    await wait(0.45);
  }

  private showHands(ph: Hand5, dh: Hand5) {
    const pins = this.pins!;
    this.showPin(pins.me, true, hand5Name(ph));
    this.showPin(pins.say, false);
    this.showPin(pins.intel, true, hand5Name(dh));
    const mine = ph.score >= dh.score;
    const win = mine ? ph : dh;
    const pool = [...(mine ? this.p3 : this.d3), ...this.b3];
    highlightCards(
      this.g,
      pool.filter((c) => c.card !== null && win.cards.includes(c.card)),
      mine ? '#ffd27a' : '#9fd0ff',
    );
  }

  private async payOut(s: Settlement) {
    const { sfx, fx } = this.g;
    const piles = this.piles!;
    // the player's unmatched bet comes back first; the rest of the street goes to the pot
    if (s.refund > 0) {
      const back = new ChipPile(this.g.chips, this.g.stage.table, piles.p.group.position.clone());
      back.set(s.refund);
      piles.p.set(Math.max(0, piles.p.amount - s.refund));
      await slideChips(back.group, new THREE.Vector3(back.group.position.x, 0, this.pos.bottom.z), 0.45, 0.06, 'power2.in');
      back.dispose();
    }
    await this.gatherBets();
    const toPlayer = s.outcome === 'win' || s.outcome === 'dealerFold';
    const tie = s.outcome === 'tie';
    sfx.play('handle', { vol: 0.7 });
    if (tie) {
      const half = new ChipPile(this.g.chips, this.g.stage.table, piles.pot.group.position.clone());
      half.set(s.pot / 2);
      piles.pot.set(s.pot / 2);
      await Promise.all([
        slideChips(half.group, new THREE.Vector3(this.pos.pot.x, 0, this.pos.bottom.z), 0.55, 0.06, 'power2.in'),
        slideChips(piles.pot.group, new THREE.Vector3(this.pos.pot.x, 0, this.pos.top.z), 0.55, 0.06, 'power2.in'),
      ]);
      half.dispose();
    } else {
      if (toPlayer) fx.burst(new THREE.Vector3(this.pos.pot.x, 0.3, this.pos.pot.z), s.pot >= 8 * s.matched ? 140 : 70);
      await slideChips(piles.pot.group, new THREE.Vector3(this.pos.pot.x, 0, (toPlayer ? this.pos.bottom : this.pos.top).z), 0.55, 0.06, 'power2.in');
    }
    piles.pot.clear();
    piles.pot.group.position.copy(this.pos.pot);
    this.updateMoney();
    const ph = this.round?.dealerCards ? bestHand([...this.round.playerCards, ...this.round.community]) : null;
    const big = s.outcome === 'win' && ph && ph.cat >= Cat5.Straight ? hand5Name(ph).toUpperCase() : undefined;
    const banner = resultBanner(this.g, s.net, s.wagered, { big, folded: s.outcome === 'playerFold' });
    await finishXP(this.g, s.wagered, s.net, banner);
    await wait(0.4);
    this.disposePiles();
  }

  private updateMoney() {
    const r = this.round;
    const pins = this.pins;
    if (!r || !pins) return;
    this.showPin(pins.pot, true, t('ab.potN', { n: money(r.totalPot) }));
    this.showPin(pins.budget, r.state !== 'ROUND_COMPLETE', t('ab.budget', { left: money(r.playerRemaining), spent: money(r.skillCosts) }));
  }
}

