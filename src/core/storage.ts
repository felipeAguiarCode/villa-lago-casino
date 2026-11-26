/** Key/value storage used for round history and crash recovery (the browser's localStorage). */
export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** In-memory store (tests, or when the browser blocks storage). */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** localStorage when it works, memory otherwise. */
export function browserStore(): KeyValueStore {
  try {
    const t = '__vlc_store__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return new MemoryStore();
  }
}
