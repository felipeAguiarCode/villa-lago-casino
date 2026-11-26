import gsap from 'gsap';
import * as THREE from 'three';
import { CARD_W, type Card3D } from './cardMesh';

/** Delay that honours the global animation speed. */
export const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Place {
  pos: THREE.Vector3;
  yaw: number;
}

export interface DealOpts {
  faceUp: boolean;
  dur?: number;
  arc?: number;
  delay?: number;
  onStart?: () => void;
  onLand?: () => void;
}

/** Speed of a slide that decays exponentially (felt friction): 0..1 progress for 0..1 time. */
const friction = (t: number, k: number) => (1 - Math.exp(-k * t)) / (1 - Math.exp(-k));
/** Damped oscillation that starts at 0 (sin) or 1 (cos) and dies out over the unit interval. */
const dampSin = (t: number, cycles: number, decay: number) => Math.exp(-decay * t) * Math.sin(2 * Math.PI * cycles * t);
const dampCos = (t: number, cycles: number, decay: number) => Math.exp(-decay * t) * Math.cos(2 * Math.PI * cycles * t);
/** Under-damped spring step response normalised to end at 1 (small natural overshoot). */
function spring(t: number, zeta = 0.72, w = 10) {
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const f = (x: number) => 1 - Math.exp(-zeta * w * x) * (Math.cos(wd * x) + ((zeta * w) / wd) * Math.sin(wd * x));
  return f(t) / f(1);
}

/**
 * A card thrown from the shoe: a low ballistic flight that spins and flutters, a touchdown with a
 * tiny hop, then a short slide on the felt (friction) while the yaw settles like a damped spring.
 * Turns face up in the air when asked.
 */
export function dealCard(c: Card3D, from: THREE.Vector3, fromYaw: number, to: Place, o: DealOpts): Promise<void> {
  const obj = c.obj;
  obj.position.copy(from);
  obj.rotation.set(0, fromYaw, Math.PI);
  obj.visible = true;
  const start = from.clone();
  const end = to.pos.clone();
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  const apex = Math.min(o.arc ?? 0.5, 0.1 + dist * 0.075);
  const spin = (Math.random() - 0.5) * 0.7;
  const settle = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.05);
  const flutter = 20 + Math.random() * 10;
  const LAND = 0.6;
  const p = { t: 0 };
  let landed = false;
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: o.dur ?? 0.56,
      delay: o.delay ?? 0,
      ease: 'none',
      onStart: o.onStart,
      onUpdate: () => {
        const t = p.t;
        obj.position.lerpVectors(start, end, friction(t, 3.4));
        if (t < LAND) {
          const u = t / LAND;
          obj.position.y = lerp(start.y, end.y, u) + 4 * apex * u * (1 - u);
          obj.rotation.y = lerp(fromYaw, to.yaw, smooth(0, 1, u)) + spin * Math.sin(Math.PI * u);
          obj.rotation.x = -0.1 * Math.sin(Math.PI * u);
        } else {
          const u = (t - LAND) / (1 - LAND);
          if (!landed) {
            landed = true;
            o.onLand?.();
          }
          obj.position.y = end.y + (u < 0.4 ? 0.014 * Math.sin((Math.PI * u) / 0.4) : 0);
          obj.rotation.y = to.yaw + settle * dampSin(u, 1.1, 4.5);
          obj.rotation.x = 0;
        }
        if (o.faceUp) {
          const f = smooth(0.06, LAND * 0.92, t);
          obj.rotation.z = Math.PI * (1 - f);
          c.bend.x = Math.sin(Math.PI * f) * 1.05;
        } else c.bend.x = t < LAND ? 0.1 * Math.sin(t * flutter) * (1 - t / LAND) : 0;
      },
      onComplete: () => {
        obj.position.copy(end);
        obj.rotation.set(0, to.yaw, o.faceUp ? 0 : Math.PI);
        c.bend.set(0, 0);
        if (!landed) o.onLand?.();
        res();
      },
    });
  });
}

/**
 * Turns a card over the way a hand does: one edge peels up and the card curls, it rolls over its
 * other edge (that edge stays on the felt, so the centre rises by half the card's width), falls
 * flat on a cushion of air with a small rebound, and the curl ripples out.
 */
export function flipCard(c: Card3D, o: { dur?: number; lift?: number; onMid?: () => void } = {}): Promise<void> {
  const obj = c.obj;
  const y0 = obj.position.y;
  const from = obj.rotation.z;
  const to = Math.cos(from) > 0 ? Math.PI : 0;
  const extra = Math.min(0.1, (o.lift ?? 0.42) * 0.22);
  const PEEL = 0.17;
  const DOWN = 0.76;
  const p = { t: 0 };
  let mid = false;
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: o.dur ?? 0.62,
      ease: 'none',
      onUpdate: () => {
        const t = p.t;
        let a: number;
        let bend: number;
        let y: number;
        if (t < PEEL) {
          const u = smooth(0, 1, t / PEEL);
          a = 0.07 * u;
          bend = 1.15 * u;
          y = 0;
        } else if (t < DOWN) {
          const u = (t - PEEL) / (DOWN - PEEL);
          // quick turn through the vertical, slowed by the air as it lies down
          a = 0.07 + 0.93 * (1 - Math.pow(1 - smooth(0, 1, u), 1.6));
          bend = lerp(1.15, -0.3, smooth(0, 1, u));
          y = extra * Math.sin(Math.PI * Math.min(1, u * 1.15));
        } else {
          const u = (t - DOWN) / (1 - DOWN);
          a = 1 - 0.035 * dampSin(u, 1.3, 5);
          bend = -0.3 * dampCos(u, 1.5, 5.5);
          y = u < 0.35 ? 0.008 * Math.sin((Math.PI * u) / 0.35) : 0;
        }
        obj.rotation.z = lerp(from, to, a);
        obj.position.y = y0 + (CARD_W / 2) * Math.abs(Math.sin(Math.PI * Math.min(1, a))) + y;
        c.bend.x = bend;
        if (!mid && a > 0.5) {
          mid = true;
          o.onMid?.();
        }
      },
      onComplete: () => {
        obj.position.y = y0;
        obj.rotation.z = to;
        c.bend.set(0, 0);
        res();
      },
    });
  });
}

/** Dealer lifts the near edge of the hole card to check it, then lays it back. */
export async function peekCard(c: Card3D): Promise<void> {
  const obj = c.obj;
  const y0 = obj.position.y;
  const p = { t: 0 };
  await gsap.to(p, {
    t: 1,
    duration: 0.75,
    ease: 'sine.inOut',
    onUpdate: () => {
      const s = Math.sin(Math.PI * p.t);
      obj.position.y = y0 + s * 0.05;
      c.bend.y = -s * 0.9;
    },
  });
  obj.position.y = y0;
  c.bend.set(0, 0);
}

/**
 * Moves a card to a new resting place (re-centering hands, splits, confirmed cards): picked up a
 * little, carried with a slight swing in the direction of travel and set down by a spring that
 * overshoots a hair before it rests.
 */
export function slideCard(c: Card3D, to: Place, dur = 0.32, lift = 0.06): Promise<void> {
  const obj = c.obj;
  const start = obj.position.clone();
  const yaw0 = obj.rotation.y;
  const dx = to.pos.x - start.x;
  const swing = Math.max(-0.08, Math.min(0.08, dx * 0.06));
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: dur * 1.1,
      ease: 'none',
      onUpdate: () => {
        const t = p.t;
        const s = spring(t, 0.78, 9.5);
        obj.position.lerpVectors(start, to.pos, s);
        obj.position.y = lerp(start.y, to.pos.y, Math.min(1, s)) + Math.sin(Math.PI * Math.min(1, t * 1.25)) * lift;
        obj.rotation.y = lerp(yaw0, to.yaw, Math.min(1, s)) - swing * Math.sin(Math.PI * Math.min(1, t * 1.2));
        if (lift > 0.05) c.bend.x = 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.25));
      },
      onComplete: () => {
        obj.position.copy(to.pos);
        obj.rotation.y = to.yaw;
        if (lift > 0.05) c.bend.x = 0;
        res();
      },
    });
  });
}

/** Gathers cards into the discard tray (face down), staggered. */
export function collectCards(cards: Card3D[], tray: THREE.Vector3, trayYaw: number, onEach?: (c: Card3D) => void): Promise<void> {
  const jobs = cards.map((c, i) => {
    const obj = c.obj;
    const start = obj.position.clone();
    const z0 = obj.rotation.z;
    const yaw0 = obj.rotation.y;
    const zTarget = Math.cos(z0) > 0 ? Math.PI : z0;
    const p = { t: 0 };
    return new Promise<void>((res) => {
      gsap.to(p, {
        t: 1,
        duration: 0.55,
        delay: i * 0.055,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = p.t;
          obj.position.lerpVectors(start, tray, t);
          obj.position.y += Math.sin(Math.PI * t) * 0.6;
          obj.rotation.z = lerp(z0, zTarget, smooth(0.05, 0.6, t));
          obj.rotation.y = lerp(yaw0, trayYaw, t);
          c.bend.x = Math.sin(Math.PI * smooth(0.05, 0.6, t)) * 0.7;
          obj.scale.setScalar(1 - smooth(0.85, 1, t) * 0.6);
        },
        onComplete: () => {
          onEach?.(c);
          res();
        },
      });
    });
  });
  return Promise.all(jobs).then(() => undefined);
}

/** Small horizontal shake (bust). */
export function shake(objs: THREE.Object3D[], amp = 0.05): Promise<void> {
  const base = objs.map((o) => o.position.x);
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: 0.42,
      ease: 'none',
      onUpdate: () => {
        const d = Math.sin(p.t * Math.PI * 7) * amp * (1 - p.t);
        objs.forEach((o, i) => (o.position.x = base[i] + d));
      },
      onComplete: () => {
        objs.forEach((o, i) => (o.position.x = base[i]));
        res();
      },
    });
  });
}

/** Moves any object along an arc to a target. */
export function arcTo(obj: THREE.Object3D, to: THREE.Vector3, dur = 0.5, arc = 0.3, ease = 'power2.inOut', delay = 0): Promise<void> {
  const start = obj.position.clone();
  const end = to.clone();
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: dur,
      delay,
      ease,
      onUpdate: () => {
        obj.position.lerpVectors(start, end, p.t);
        obj.position.y += Math.sin(Math.PI * p.t) * arc;
      },
      onComplete: () => res(),
    });
  });
}

/**
 * Slides a chip stack across the felt like a dealer's push. The stack leans back as it starts and
 * forward as it brakes (inertia), then rocks upright. `ease` keeps arcTo's vocabulary: an ".in"
 * ease is a push away (no stop), ".out" or ".inOut" end with the braking rock.
 */
export function slideChips(obj: THREE.Object3D, to: THREE.Vector3, dur = 0.5, arc = 0.1, ease = 'power2.inOut', delay = 0): Promise<void> {
  const start = obj.position.clone();
  const end = to.clone();
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  const axis = new THREE.Vector3(dz / len, 0, -dx / len);
  const away = ease.endsWith('.in');
  const incoming = ease.endsWith('.out');
  const hop = arc * 0.3;
  const LEAN = 0.075;
  const MOVE = away ? 1 : 0.8;
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: dur * (away ? 1 : 1.15),
      delay,
      ease: 'none',
      onUpdate: () => {
        const t = p.t;
        let lean: number;
        if (t < MOVE) {
          const u = t / MOVE;
          // incoming stacks arrive already moving and only brake; others start from rest
          const s = away ? u * u : incoming ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
          obj.position.lerpVectors(start, end, s);
          obj.position.y = lerp(start.y, end.y, s) + Math.sin(Math.PI * u) * hop;
          lean = away ? -LEAN * (1 - u) : incoming ? LEAN * u : -LEAN * (1 - 2 * u);
        } else {
          const u = (t - MOVE) / (1 - MOVE);
          obj.position.copy(end);
          lean = LEAN * dampCos(u, 1.4, 4.2);
        }
        obj.quaternion.setFromAxisAngle(axis, lean);
      },
      onComplete: () => {
        obj.position.copy(end);
        obj.quaternion.identity();
        res();
      },
    });
  });
}

/** Baccarat "squeeze": the card is peeled open slowly, teased, then turned over. */
export async function squeezeCard(c: Card3D, onReveal?: () => void): Promise<void> {
  const obj = c.obj;
  const y0 = obj.position.y;
  const z0 = obj.rotation.z;
  const p = { t: 0 };
  const peel = (t: number) => {
    obj.rotation.z = z0 - 0.62 * t;
    obj.position.y = y0 + 0.07 * t;
    c.bend.x = -1.9 * t;
  };
  await gsap.to(p, { t: 1, duration: 0.85, ease: 'sine.inOut', onUpdate: () => peel(p.t) });
  await gsap.to(p, { t: 0.55, duration: 0.3, ease: 'sine.inOut', onUpdate: () => peel(p.t) });
  await gsap.to(p, { t: 1.15, duration: 0.45, ease: 'sine.inOut', onUpdate: () => peel(p.t) });
  const zStart = obj.rotation.z;
  const yStart = obj.position.y;
  const bStart = c.bend.x;
  const q = { t: 0 };
  let shown = false;
  await gsap.to(q, {
    t: 1,
    duration: 0.38,
    ease: 'power2.out',
    onUpdate: () => {
      obj.rotation.z = lerp(zStart, 0, q.t);
      obj.position.y = lerp(yStart, y0, q.t) + Math.sin(Math.PI * q.t) * 0.25;
      c.bend.x = lerp(bStart, 0, q.t);
      if (!shown && q.t > 0.5) {
        shown = true;
        onReveal?.();
      }
    },
  });
  obj.rotation.z = 0;
  obj.position.y = y0;
  c.bend.set(0, 0);
}
