import gsap from 'gsap';
import * as THREE from 'three';
import type { Sfx } from '../audio/sfx';
import { t } from '../core/i18n';
import type { Hud } from '../ui/hud';
import { REST_Y, type Card3D, type CardFactory } from './cardMesh';
import type { Stage } from './stage';
import type { Table } from './table';

export interface ShuffleCtx {
  stage: Stage;
  table: Table;
  cards: CardFactory;
  sfx: Sfx;
  hud: Hud;
}

export interface ShuffleOpts {
  /** Frame position (u, v) of the shuffle area. */
  at?: [number, number];
  /** Short version (mid-session reshuffle): riffle + bridge only. */
  quick?: boolean;
  /** Where the deck ends up. 'shoe' loads the table shoe; a point leaves the deck there (returned). */
  to?: 'shoe' | THREE.Vector3;
}

const STEP = 0.0026;
/** New-deck order: A..K of spades, hearts, diamonds, clubs. */
const NEW_DECK = Array.from({ length: 52 }, (_, i) => {
  const s = Math.floor(i / 13);
  const j = i % 13;
  return s * 13 + (j === 0 ? 12 : j - 1);
});

const all = (ps: unknown[]) => Promise.all(ps).then(() => undefined);
/**
 * Every tween of the show goes through here, so the show can run faster than the rest of the game
 * (and speed up on a tap) without touching the global timeline — changing the global time scale
 * mid-game left the next animation scheduled in the future.
 */
const show = { rate: 1, live: new Set<gsap.core.Tween>() };
const tw = (target: object, vars: gsap.TweenVars) => {
  const t = gsap.to(target, vars);
  t.timeScale(show.rate);
  show.live.add(t);
  return t.then(() => {
    show.live.delete(t);
  });
};
const wait = (s: number) => tw({ t: 0 }, { t: 1, duration: s, ease: 'none' });

/**
 * The opening flourish of every table: the deck arrives, is ribbon-spread, turned over
 * in a wave, gathered, riffled, bridged and finally loaded into the shoe.
 * Tapping the screen speeds it up.
 */
export async function shuffleShow(ctx: ShuffleCtx, o: ShuffleOpts = {}): Promise<Card3D[] | void> {
  const { stage, table, cards, sfx, hud } = ctx;
  const [u, v] = o.at ?? [0.5, 0.47];
  const C = stage.screenToTable(u, v);
  const deck: Card3D[] = NEW_DECK.map((c) => cards.createLite(c));
  show.rate = o.quick ? 1.15 : 1.4;
  let fast = false;
  const speedUp = () => {
    if (fast) return;
    fast = true;
    show.rate *= 3.5;
    for (const t of show.live) t.timeScale(show.rate);
  };
  window.addEventListener('pointerdown', speedUp);
  hud.toast(`${t('toast.shuffling')} · ${t('toast.skip')}`, o.quick ? 1400 : 2600);

  const stackAt = (list: Card3D[], p: THREE.Vector3, yaw = 0) =>
    list.forEach((c, i) => {
      c.obj.position.set(p.x, REST_Y + i * STEP, p.z);
      c.obj.rotation.set(0, yaw, Math.PI);
      c.bend.set(0, 0);
    });

  try {
    if (!o.quick) {
      // 1. the deck slides in from the dealer
      const top = stage.screenToTable(u, -0.05);
      stackAt(deck, new THREE.Vector3(C.x, 0, top.z));
      sfx.play('shove', { vol: 0.7 });
      await all(deck.map((c) => tw(c.obj.position, { z: C.z, duration: 0.42, ease: 'power3.out' })));

      // 2. ribbon spread along a smile-shaped arc
      const R = 2.25;
      const A = 0.6;
      sfx.play('fan');
      await all(
        deck.map((c, i) => {
          const th = -A + (2 * A * i) / (deck.length - 1);
          return all([
            tw(c.obj.position, { x: C.x + R * Math.sin(th), z: C.z - R * Math.cos(th) + R - 0.05, y: REST_Y + i * 0.0016, duration: 0.34, delay: i * 0.011, ease: 'power2.out' }),
            tw(c.obj.rotation, { y: -th, duration: 0.34, delay: i * 0.011, ease: 'power2.out' }),
          ]);
        }),
      );

      // 3. wave turnover: every card flips face up, left to right
      for (let k = 0; k < 6; k++) sfx.play('slide', { vol: 0.25, delay: k * 0.1, rate: 1.2 });
      await all(
        deck.map((c, i) => {
          const d = i * 0.011;
          return all([
            tw(c.obj.rotation, { z: 0, duration: 0.3, delay: d, ease: 'power2.inOut' }),
            tw(c.obj.position, { y: `+=0.22`, duration: 0.15, delay: d, yoyo: true, repeat: 1, ease: 'sine.out' }),
            tw(c.bend, { x: 1.1, duration: 0.15, delay: d, yoyo: true, repeat: 1, ease: 'sine.out' }),
          ]);
        }),
      );
      await wait(0.3);

      // 4. turn back face down while sweeping them together
      sfx.play('fan', { vol: 0.7 });
      await all(
        deck.map((c, i) => {
          const d = (deck.length - 1 - i) * 0.009;
          return all([
            tw(c.obj.rotation, { z: Math.PI, y: 0, duration: 0.34, delay: d, ease: 'power2.inOut' }),
            tw(c.obj.position, { x: C.x, z: C.z, duration: 0.42, delay: d + 0.08, ease: 'power2.inOut' }),
            tw(c.obj.position, { y: REST_Y + i * STEP + 0.16, duration: 0.2, delay: d, yoyo: true, repeat: 1, ease: 'sine.out' }),
            tw(c.bend, { x: -0.9, duration: 0.17, delay: d, yoyo: true, repeat: 1 }),
          ]);
        }),
      );
      deck.forEach((c, i) => (c.obj.position.y = REST_Y + i * STEP));
    } else {
      stackAt(deck, C);
    }

    // 5. riffle shuffle (twice in the full show)
    let order = deck;
    order = await riffle(order, C, sfx, 1);

    // 6. bridge: arch the deck and let it cascade down
    sfx.play('fan', { vol: 0.8 });
    await all(order.map((c, i) => tw(c.obj.position, { y: REST_Y + i * STEP + 0.12, duration: 0.22, ease: 'power2.out' })));
    await all(order.map((c) => tw(c.bend, { y: -1.25, duration: 0.22, ease: 'power2.out' })));
    await all(
      order.map((c, i) =>
        all([
          tw(c.bend, { y: 0, duration: 0.2, delay: i * 0.009, ease: 'power2.in' }),
          tw(c.obj.position, { y: REST_Y + i * STEP, duration: 0.2, delay: i * 0.009, ease: 'bounce.out' }),
        ]),
      ),
    );
    sfx.play('place', { vol: 0.6 });
    await wait(0.12);

    // 7. into the shoe (or leave the deck at a point)
    if (o.to instanceof THREE.Vector3) {
      const dest = o.to;
      await all(order.map((c, i) => tw(c.obj.position, { x: dest.x, z: dest.z, y: REST_Y + i * STEP, duration: 0.45, ease: 'power2.inOut' })));
      return order;
    }
    const mouth = table.shoeMouth();
    const yaw = table.shoeYaw;
    sfx.play('shove');
    const clumps = 4;
    const per = Math.ceil(order.length / clumps);
    const fill0 = 0;
    await all(
      order.map((c, i) => {
        const k = Math.floor(i / per);
        const d = k * 0.1;
        return all([
          tw(c.obj.position, { x: mouth.x, z: mouth.z, y: mouth.y + (i % per) * STEP, duration: 0.42, delay: d, ease: 'power2.inOut' }),
          tw(c.obj.rotation, { y: yaw, duration: 0.42, delay: d, ease: 'power2.inOut' }),
          tw(c.obj.scale, {
            x: 0.75,
            y: 0.75,
            z: 0.75,
            duration: 0.42,
            delay: d,
            onComplete: () => {
              c.obj.visible = false;
              if (i % per === per - 1 || i === order.length - 1) table.setShoeFill(fill0 + (k + 1) / clumps);
            },
          }),
        ]);
      }),
    );
    table.setShoeFill(1);
  } finally {
    window.removeEventListener('pointerdown', speedUp);
    show.rate = 1;
    if (!(o.to instanceof THREE.Vector3)) for (const c of deck) cards.destroy(c);
  }
}

/** One riffle: split, interleave both halves into the middle, square up. Returns the new order (bottom to top). */
async function riffle(stack: Card3D[], C: THREE.Vector3, sfx: Sfx, speed: number): Promise<Card3D[]> {
  const half = Math.floor(stack.length / 2);
  const left = stack.slice(0, half);
  const right = stack.slice(half);
  const L = new THREE.Vector3(C.x - 0.5, 0, C.z + 0.1);
  const Rp = new THREE.Vector3(C.x + 0.5, 0, C.z + 0.1);
  const dur = 0.3 / speed;
  // split the cut
  await all([
    ...left.map((c, i) =>
      all([
        tw(c.obj.position, { x: L.x, z: L.z, y: REST_Y + i * STEP, duration: dur, ease: 'power2.inOut' }),
        tw(c.obj.rotation, { y: 0.24, duration: dur, ease: 'power2.inOut' }),
      ]),
    ),
    ...right.map((c, i) =>
      all([
        tw(c.obj.position, { x: Rp.x, z: Rp.z, y: REST_Y + i * STEP + 0.05, duration: dur * 0.5, ease: 'power2.out' }).then(() =>
          tw(c.obj.position, { y: REST_Y + i * STEP, duration: dur * 0.5, ease: 'power2.in' }),
        ),
        tw(c.obj.rotation, { y: -0.24, duration: dur, ease: 'power2.inOut' }),
      ]),
    ),
  ]);
  // thumbs lift the inner corners
  await all([...left.map((c) => tw(c.bend, { x: -0.7, duration: 0.14 / speed })), ...right.map((c) => tw(c.bend, { x: 0.7, duration: 0.14 / speed }))]);
  // interleave: cards drop alternately (sometimes in pairs) into the middle
  const order: Card3D[] = [];
  let li = 0;
  let ri = 0;
  let fromLeft = Math.random() < 0.5;
  while (li < left.length || ri < right.length) {
    const n = Math.random() < 0.25 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (fromLeft && li < left.length) order.push(left[li++]);
      else if (!fromLeft && ri < right.length) order.push(right[ri++]);
    }
    if (li >= left.length) fromLeft = false;
    else if (ri >= right.length) fromLeft = true;
    else fromLeft = !fromLeft;
  }
  sfx.play('shuffle', { rate: speed > 1 ? 1.15 : 1 });
  const step = 0.019 / speed;
  await all(
    order.map((c, k) => {
      const d = k * step;
      return all([
        tw(c.obj.position, { x: C.x + (Math.random() - 0.5) * 0.02, z: C.z + (Math.random() - 0.5) * 0.02, y: REST_Y + k * STEP, duration: 0.17 / speed, delay: d, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: (Math.random() - 0.5) * 0.06, duration: 0.17 / speed, delay: d, ease: 'power2.out' }),
        tw(c.bend, { x: 0, duration: 0.12 / speed, delay: d + 0.05 / speed }),
      ]);
    }),
  );
  // square up
  await all(order.map((c) => tw(c.obj.rotation, { y: 0, duration: 0.14 / speed })));
  return order;
}
