import gsap from 'gsap';
import * as THREE from 'three';
import type { Card3D } from './cardMesh';

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

/** Card flies from the shoe in an arc, spinning into place and flipping face up mid-air when asked. */
export function dealCard(c: Card3D, from: THREE.Vector3, fromYaw: number, to: Place, o: DealOpts): Promise<void> {
  const obj = c.obj;
  obj.position.copy(from);
  obj.rotation.set(0, fromYaw, Math.PI);
  obj.visible = true;
  const start = from.clone();
  const end = to.pos.clone();
  const arc = o.arc ?? 0.5;
  const spin = (Math.random() - 0.5) * 0.5;
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: o.dur ?? 0.52,
      delay: o.delay ?? 0,
      ease: 'power3.out',
      onStart: o.onStart,
      onUpdate: () => {
        const t = p.t;
        obj.position.lerpVectors(start, end, t);
        obj.position.y = lerp(start.y, end.y, t) + Math.sin(Math.PI * Math.min(1, t * 1.08)) * arc;
        obj.rotation.y = lerp(fromYaw, to.yaw, smooth(0, 0.9, t)) + spin * Math.sin(Math.PI * t);
        if (o.faceUp) {
          const f = smooth(0.12, 0.8, t);
          obj.rotation.z = Math.PI * (1 - f);
          c.bend.x = Math.sin(Math.PI * f) * 1.15;
        }
      },
      onComplete: () => {
        obj.position.copy(end);
        c.bend.set(0, 0);
        o.onLand?.();
        res();
      },
    });
  });
}

/** Lifts, curls and turns a card over in place. */
export function flipCard(c: Card3D, o: { dur?: number; lift?: number; onMid?: () => void } = {}): Promise<void> {
  const obj = c.obj;
  const y0 = obj.position.y;
  const from = obj.rotation.z;
  const to = Math.cos(from) > 0 ? Math.PI : 0;
  const lift = o.lift ?? 0.42;
  const p = { t: 0 };
  let mid = false;
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: o.dur ?? 0.62,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = p.t;
        obj.position.y = y0 + Math.sin(Math.PI * t) * lift;
        obj.rotation.z = lerp(from, to, smooth(0.08, 0.92, t));
        c.bend.x = Math.sin(Math.PI * t) * 1.35;
        if (!mid && t > 0.5) {
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

/** Slides a card to a new resting place (re-centering hands, splits). */
export function slideCard(c: Card3D, to: Place, dur = 0.32, lift = 0.06): Promise<void> {
  const obj = c.obj;
  const start = obj.position.clone();
  const yaw0 = obj.rotation.y;
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate: () => {
        obj.position.lerpVectors(start, to.pos, p.t);
        obj.position.y += Math.sin(Math.PI * p.t) * lift;
        obj.rotation.y = lerp(yaw0, to.yaw, p.t);
      },
      onComplete: () => res(),
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
