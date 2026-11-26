/** Casino sound effects (Kenney "Casino Audio", CC0) plus small synthesized jingles. */

const GROUPS: Record<string, string[]> = {
  slide: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `card-slide-${n}`),
  place: [1, 2, 3, 4].map((n) => `card-place-${n}`),
  shove: [1, 2, 3, 4].map((n) => `card-shove-${n}`),
  fan: ['card-fan-1', 'card-fan-2'],
  shuffle: ['card-shuffle'],
  chip: ['chip-lay-1', 'chip-lay-2', 'chip-lay-3'],
  chips: [1, 2, 3, 4].map((n) => `chips-collide-${n}`),
  handle: [1, 2, 3, 4, 5, 6].map((n) => `chips-handle-${n}`),
  stack: [1, 2, 3, 4, 5, 6].map((n) => `chips-stack-${n}`),
};

export type SfxName = keyof typeof GROUPS;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private lastPick = new Map<string, number>();
  private volume = 0.8;
  private muted = false;

  constructor(private base: string) {
    const unlock = () => {
      this.ensure();
      this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  setVolume(v: number, muted: boolean) {
    this.volume = v;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : v;
  }

  async load(onProgress?: (f: number) => void) {
    const ctx = this.ensure();
    if (!ctx) return;
    const names = Object.values(GROUPS).flat();
    let done = 0;
    const decoded = new Map<string, AudioBuffer>();
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${this.base}${n}.wav`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          decoded.set(n, buf);
        } catch {
          /* missing sound: stay silent */
        }
        onProgress?.(++done / names.length);
      }),
    );
    for (const [g, list] of Object.entries(GROUPS)) this.buffers.set(g, list.map((n) => decoded.get(n)).filter(Boolean) as AudioBuffer[]);
  }

  play(name: SfxName, o: { vol?: number; rate?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    const list = this.buffers.get(name);
    if (!ctx || !this.master || !list || !list.length || ctx.state !== 'running') return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastPick.get(name)) i = (i + 1) % list.length;
    this.lastPick.set(name, i);
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = (o.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = (o.vol ?? 1) * 0.9;
    src.connect(g).connect(this.master);
    src.start(ctx.currentTime + (o.delay ?? 0));
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private ready() {
    return !!(this.ctx && this.master && this.ctx.state === 'running');
  }

  click() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(1650, t, 0.06, 'sine', 0.12);
    this.tone(2480, t, 0.04, 'triangle', 0.05);
  }

  /** Bright arpeggio for a win; `big` adds a shimmering tail (blackjack, top hands). */
  win(big = false) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const notes = big ? [784, 988, 1175, 1568, 1976, 2349] : [1047, 1319, 1568, 2093];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.075, 0.45, 'triangle', 0.13);
      this.tone(f * 2, t + i * 0.075, 0.25, 'sine', 0.04);
    });
    if (big)
      for (let i = 0; i < 10; i++) this.tone(2600 + Math.random() * 1600, t + 0.45 + i * 0.05, 0.25, 'sine', 0.035);
  }

  lose() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(392, t, 0.28, 'sine', 0.1);
    this.tone(311, t + 0.16, 0.5, 'sine', 0.1);
  }

  push() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(660, t, 0.22, 'sine', 0.08);
    this.tone(660, t + 0.14, 0.22, 'sine', 0.06);
  }

  levelUp() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.6, 'triangle', 0.12));
  }
}
