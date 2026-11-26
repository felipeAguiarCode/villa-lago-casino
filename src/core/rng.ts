/** Returns an integer in [0, n). */
export type Rng = (n: number) => number;

const buf = new Uint32Array(64);
let bufPos = buf.length;

function nextU32(): number {
  if (bufPos >= buf.length) {
    crypto.getRandomValues(buf);
    bufPos = 0;
  }
  return buf[bufPos++];
}

/** Unbiased crypto-backed integer in [0, n) (rejection sampling). */
export const cryptoRng: Rng = (n: number) => {
  if (n <= 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  let x = nextU32();
  while (x >= limit) x = nextU32();
  return x % n;
};

/** Small deterministic PRNG (mulberry32) for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(arr: T[], rng: Rng = cryptoRng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
