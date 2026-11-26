import type { Card } from '../../core/cards';
import type { BetOutcome, MainResult } from './evaluate';
import { ALL_BETS, MODE_ID, type BetId } from './ruleset';
import type { KeyValueStore } from '../../core/storage';

export { browserStore, MemoryStore, type KeyValueStore } from '../../core/storage';

/**
 * Round history, statistics and the in-progress round, kept in the browser storage the casino
 * already uses for the wallet. Amounts are in cents.
 */
const KEYS = { history: 'vlc.dt.history.v1', stats: 'vlc.dt.stats.v1', pending: 'vlc.dt.pending.v1' };
const HISTORY_SIZE = 200;

export interface CardRecord {
  uid: number;
  card: Card;
}

export interface RoundRecord {
  roundId: string;
  mode: typeof MODE_ID;
  dealerId: string | null;
  tableId: string;
  shoeId: string;
  dragon: CardRecord | null;
  tiger: CardRecord | null;
  result: MainResult | null;
  bets: { id: BetId; stake: number }[];
  outcomes: BetOutcome[];
  totalBet: number;
  totalReturn: number;
  net: number;
  balanceBefore: number;
  balanceAfter: number;
  date: string;
  finalState: 'ROUND_COMPLETE' | 'ROUND_VOIDED';
}

/** A round whose chips are committed but not yet settled (crash recovery). */
export interface PendingRound {
  roundId: string;
  shoeId: string;
  bets: { id: BetId; stake: number }[];
  totalBet: number;
  balanceBefore: number;
  burn: CardRecord | null;
  dragon: CardRecord | null;
  tiger: CardRecord | null;
  date: string;
}

export interface DtStats {
  rounds: number;
  dragonWins: number;
  tigerWins: number;
  ties: number;
  suitedTies: number;
  voided: number;
  betsWon: number;
  betsLost: number;
  totalBet: number;
  totalReturn: number;
  net: number;
  biggestPayout: number;
  biggestBet: number;
  winsByBet: Record<BetId, number>;
}

export const emptyStats = (): DtStats => ({
  rounds: 0,
  dragonWins: 0,
  tigerWins: 0,
  ties: 0,
  suitedTies: 0,
  voided: 0,
  betsWon: 0,
  betsLost: 0,
  totalBet: 0,
  totalReturn: 0,
  net: 0,
  biggestPayout: 0,
  biggestBet: 0,
  winsByBet: Object.fromEntries(ALL_BETS.map((b) => [b, 0])) as Record<BetId, number>,
});

export class DtHistory {
  constructor(private store: KeyValueStore) {}

  private read<T>(k: string, fallback: T): T {
    try {
      const raw = this.store.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(k: string, v: unknown) {
    try {
      this.store.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full or blocked: the game goes on */
    }
  }

  rounds(): RoundRecord[] {
    return this.read<RoundRecord[]>(KEYS.history, []);
  }

  stats(): DtStats {
    return { ...emptyStats(), ...this.read<Partial<DtStats>>(KEYS.stats, {}) };
  }

  /** Raw pending entry (may be corrupted: the caller validates it). */
  pending(): unknown {
    return this.read<unknown>(KEYS.pending, null);
  }

  savePending(p: PendingRound) {
    this.write(KEYS.pending, p);
  }

  clearPending() {
    try {
      this.store.removeItem(KEYS.pending);
    } catch {
      /* ignore */
    }
  }

  /** Stores a finished round and folds it into the statistics. */
  record(rec: RoundRecord) {
    const list = this.rounds();
    list.unshift(rec);
    this.write(KEYS.history, list.slice(0, HISTORY_SIZE));
    const s = this.stats();
    if (rec.finalState === 'ROUND_VOIDED') s.voided++;
    else {
      s.rounds++;
      if (rec.result === 'DRAGON_WIN') s.dragonWins++;
      else if (rec.result === 'TIGER_WIN') s.tigerWins++;
      else if (rec.result === 'TIE') s.ties++;
      else if (rec.result === 'SUITED_TIE') s.suitedTies++;
      for (const o of rec.outcomes) {
        if (o.state === 'WIN') {
          s.betsWon++;
          s.winsByBet[o.id] = (s.winsByBet[o.id] ?? 0) + 1;
          s.biggestPayout = Math.max(s.biggestPayout, o.returned);
        } else if (o.state === 'LOSS' || o.state === 'HALF_LOSS') s.betsLost++;
        s.biggestBet = Math.max(s.biggestBet, o.stake);
      }
      s.totalBet += rec.totalBet;
      s.totalReturn += rec.totalReturn;
      s.net += rec.net;
    }
    this.write(KEYS.stats, s);
  }
}
