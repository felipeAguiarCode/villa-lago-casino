import type { KeyValueStore } from '../../../core/storage';

/**
 * Per-mode persistence on the casino's browser storage: the round in progress (crash recovery),
 * the last finished rounds and simple statistics.
 */
export interface ModeStats {
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  folds: number;
  voids: number;
  totalBet: number;
  totalReturn: number;
}

const HISTORY = 100;
const emptyStats = (): ModeStats => ({ rounds: 0, wins: 0, losses: 0, pushes: 0, folds: 0, voids: 0, totalBet: 0, totalReturn: 0 });

export class ModeStore {
  constructor(
    readonly mode: string,
    private kv: KeyValueStore,
  ) {}

  private key(k: string) {
    return `vlc.${this.mode.toLowerCase()}.${k}.v1`;
  }

  private read<T>(k: string, fallback: T): T {
    try {
      const raw = this.kv.getItem(this.key(k));
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(k: string, v: unknown) {
    try {
      this.kv.setItem(this.key(k), JSON.stringify(v));
    } catch {
      /* storage full or blocked: play goes on */
    }
  }

  /** The unsettled round, raw (the caller validates it). */
  pending(): unknown {
    return this.read<unknown>('pending', null);
  }

  savePending(snapshot: unknown) {
    this.write('pending', snapshot);
  }

  clearPending() {
    try {
      this.kv.removeItem(this.key('pending'));
    } catch {
      /* ignore */
    }
  }

  history<T>(): T[] {
    return this.read<T[]>('history', []);
  }

  stats(): ModeStats {
    return { ...emptyStats(), ...this.read<Partial<ModeStats>>('stats', {}) };
  }

  /** Stores a finished round and folds it into the statistics. */
  record(rec: { outcome: string; totalBet: number; totalReturn: number; [k: string]: unknown }) {
    const list = this.history<unknown>();
    list.unshift(rec);
    this.write('history', list.slice(0, HISTORY));
    const s = this.stats();
    if (rec.outcome === 'VOID') s.voids++;
    else {
      s.rounds++;
      if (rec.outcome === 'WIN') s.wins++;
      else if (rec.outcome === 'LOSS') s.losses++;
      else if (rec.outcome === 'PUSH') s.pushes++;
      else if (rec.outcome === 'FOLD') s.folds++;
      s.totalBet += rec.totalBet;
      s.totalReturn += rec.totalReturn;
    }
    this.write('stats', s);
  }
}
