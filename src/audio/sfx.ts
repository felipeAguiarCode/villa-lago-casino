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

  // ---------------------------------------------------------------- trump cards (Trump 21)
  private noiseBuf: AudioBuffer | null = null;

  /** A burst of filtered white noise (one second of noise, made once). */
  private noise(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqTo?: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, at);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /**
   * A trump card coming out of the deck with a hit: a rising shimmer as it flies out, a soft snap
   * as it turns over, then a quick run of glassy bells that lands on a chord. Uncommon cards ring
   * brighter; a rare one climbs higher and sparkles. `faceDown`: the dealer's, a quieter shimmer
   * and the landing only. Timed to the flight in trump21/trumpUi.ts. Original, synthesized.
   */
  trumpDraw(rarity: 'common' | 'uncommon' | 'rare' = 'common', faceDown = false, speed = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const k = 1 / Math.max(0.25, speed);
    const t = ctx.currentTime + 0.01;
    this.noise(t, 0.46 * k, faceDown ? 0.025 : 0.05, 'bandpass', 700, 2.2, 6500);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.42 * k);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(faceDown ? 0.015 : 0.03, t + 0.2 * k);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.46 * k);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.5 * k);
    if (faceDown) {
      this.noise(t + 0.5 * k, 0.04, 0.05, 'bandpass', 2200, 1.2);
      this.tone(1568, t + 0.5 * k, 0.25, 'sine', 0.03);
      return;
    }
    const flip = t + 0.43 * k;
    this.noise(flip, 0.035, 0.08, 'highpass', 2800, 0.8);
    this.tone(196, flip, 0.16, 'sine', 0.09);
    const runs = {
      common: [784, 880, 1047, 1319, 1568],
      uncommon: [880, 1047, 1175, 1397, 1760],
      rare: [1047, 1175, 1397, 1568, 2093, 2637],
    };
    const run = runs[rarity];
    const at0 = t + 0.53 * k;
    run.forEach((f, i) => {
      const at = at0 + i * 0.05 * k;
      this.tone(f, at, 0.42, 'sine', 0.065);
      this.tone(f * 2.005, at, 0.16, 'triangle', 0.018);
    });
    const end = at0 + run.length * 0.05 * k;
    const chord = rarity === 'rare' ? [1047, 1319, 1568, 2093] : [run[0], run[2], run[4]];
    chord.forEach((f) => {
      this.tone(f, end, 1.1, 'sine', 0.045);
      this.tone(f * 1.003, end, 1.1, 'sine', 0.025);
    });
    if (rarity !== 'common') for (let i = 0; i < (rarity === 'rare' ? 10 : 4); i++) this.tone(2800 + Math.random() * 2400, end + 0.04 + i * 0.06, 0.3, 'sine', 0.018);
  }

  /** A trump card lifted to be read (held): a soft paper lift. */
  trumpLift() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.09, 0.05, 'bandpass', 1800, 1.4, 3200);
    this.tone(1175, t + 0.02, 0.12, 'sine', 0.025);
  }

  /** A Barrier stopping an attack: a glassy clang with a ring that falls away. */
  barrier() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.06, 0.16, 'bandpass', 3400, 1.6);
    [[620, 0.09, 0.7], [1490, 0.05, 0.45], [2310, 0.03, 0.3]].forEach(([f, v, d]) => this.tone(f, t, d, 'sine', v));
    this.tone(180, t, 0.14, 'triangle', 0.08);
  }
}
