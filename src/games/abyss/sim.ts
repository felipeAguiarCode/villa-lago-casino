import type { Rng } from '../../core/rng';
import type { Action, Street } from './betting';
import type { AbyssConfig, ProfileId } from './config';
import { decide, equity, type DealerView } from './dealerAI';
import { knowledgeFrom } from './intel';
import { AbyssRound } from './round';
import { SKILLS, type SkillId } from './skills';

/**
 * Statistical validation of Abyss Poker: a player bot (equity-based, uses what its skills reveal)
 * plays many hands against the dealer under different skill-buying policies.
 */
export type SkillPolicy =
  | { kind: 'none' }
  | { kind: 'single'; id: SkillId }
  /** Buys the cheapest available skill on every street. */
  | { kind: 'all' }
  /** Abusive combination tests. */
  | { kind: 'chaseValue' }
  | { kind: 'pressureBluff' }
  | { kind: 'peekShove' };

export interface SimStats {
  hands: number;
  /** Player result per hand, in Antes (skills included). */
  netPerHand: number;
  /** Return per chip wagered on the table. */
  rtp: number;
  wins: number;
  losses: number;
  ties: number;
  playerFolds: number;
  dealerFolds: number;
  showdowns: number;
  skillSpend: number;
  skillUses: Record<string, number>;
  spendByStreet: Record<Street, number>;
  wagered: number;
  /** Mean share of the budget committed to bets and skills. */
  budgetUse: number;
  /** Wallet movements always equal the sum of the settled net results. */
  consistent: boolean;
}

interface SimOptions {
  hands: number;
  policy: SkillPolicy;
  rng: Rng;
  aiRng: Rng;
  botRng: Rng;
  ante?: number;
  profile?: ProfileId;
  cfg?: Partial<AbyssConfig>;
  botSamples?: number;
}

const STREET_LIST: Street[] = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'];

export function simulate(o: SimOptions): SimStats {
  const ante = o.ante ?? 20;
  const st: SimStats = {
    hands: o.hands,
    netPerHand: 0,
    rtp: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    playerFolds: 0,
    dealerFolds: 0,
    showdowns: 0,
    skillSpend: 0,
    skillUses: Object.fromEntries(SKILLS.map((s) => [s.id, 0])),
    spendByStreet: { PRE_FLOP: 0, FLOP: 0, TURN: 0, RIVER: 0 },
    wagered: 0,
    budgetUse: 0,
    consistent: true,
  };
  let netSum = 0;
  let returned = 0;
  for (let h = 0; h < o.hands; h++) {
    const bank = { balance: 1e9, canAfford: (n: number) => bank.balance >= n, debit: (n: number) => void (bank.balance -= n), credit: (n: number) => void (bank.balance += n) };
    const before = bank.balance;
    const r = new AbyssRound({ bank, rng: o.rng, aiRng: o.aiRng, profile: o.profile, cfg: o.cfg });
    r.start(ante);
    let guard = 0;
    while (r.state !== 'ROUND_COMPLETE' && guard++ < 50) {
      const look = () => equity(r.playerCards, r.community, o.botRng, o.botSamples ?? 160, knowledgeFrom(r.revealed, r.community));
      let eq = look();
      const known = r.revealed.length;
      maybeBuy(r, o.policy, eq);
      if (r.revealed.length !== known) eq = look();
      r.act(botAction(r, eq, o.botRng, o.policy));
    }
    const s = r.settlement!;
    netSum += s.net;
    returned += s.grossPayout + s.refund;
    st.wagered += s.wagered;
    st.skillSpend += s.skillCosts;
    st.budgetUse += (s.wagered + s.skillCosts) / r.budget;
    if (Math.abs(bank.balance - before - s.net) > 1e-6) st.consistent = false;
    for (const p of r.purchased) {
      st.skillUses[p.id]++;
      st.spendByStreet[p.street] += p.price;
    }
    if (s.outcome === 'win') st.wins++;
    else if (s.outcome === 'lose') st.losses++;
    else if (s.outcome === 'tie') st.ties++;
    else if (s.outcome === 'playerFold') st.playerFolds++;
    else st.dealerFolds++;
    if (r.history.includes('SHOWDOWN')) st.showdowns++;
  }
  st.netPerHand = netSum / o.hands / ante;
  st.rtp = returned / st.wagered;
  st.budgetUse /= o.hands;
  return st;
}

function maybeBuy(r: AbyssRound, policy: SkillPolicy, eq: number) {
  const offers = r.offers().filter((x) => !x.block);
  const has = (id: SkillId) => offers.some((x) => x.id === id);
  const buy = (id: SkillId) => has(id) && r.buySkill(id);
  switch (policy.kind) {
    case 'single':
      buy(policy.id);
      break;
    case 'all':
      if (offers.length) r.buySkill(offers.sort((a, b) => a.price - b.price)[0].id);
      break;
    case 'chaseValue':
      if (eq > 0.75) buy('makeEmChase');
      break;
    case 'pressureBluff':
      if (eq < 0.35) buy('pressure');
      break;
    case 'peekShove':
      buy('peek');
      break;
  }
}

/** The bot plays like a balanced dealer would, with its own cards and its discoveries. */
function botAction(r: AbyssRound, eq: number, rng: Rng, policy: SkillPolicy): Action {
  const L = r.legal();
  const active = r.active;
  if (policy.kind === 'chaseValue' && active.includes('makeEmChase')) {
    if (L.allin !== null) return { type: 'allin' };
  }
  if (policy.kind === 'pressureBluff' && active.includes('pressure')) {
    if (L.bet) return { type: 'bet', amount: Math.min(L.bet.max, Math.max(L.bet.min, r.matchedPot)) };
    if (L.raise) return { type: 'raise', amount: L.raise.min };
  }
  if (policy.kind === 'peekShove' && eq > 0.72 && L.allin !== null) return { type: 'allin' };
  const view: DealerView = {
    hole: r.playerCards,
    community: r.community,
    street: r.street,
    toCall: r.toCall,
    matchedPot: r.matchedPot,
    totalPot: r.totalPot,
    ante: r.ante,
    legal: L,
    limits: { noRaise: false, noBet: false, noFold: false, foldBoost: 0 },
    history: r.actions.map((a) => ({ ...a, who: a.who === 'player' ? 'dealer' : 'player' })),
    profile: 'balanced',
  };
  return decide(view, rng, eq);
}

export const STREETS_FOR_REPORT = STREET_LIST;
