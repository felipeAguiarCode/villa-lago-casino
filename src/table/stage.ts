import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from '../core/settings';

export const BASE_VIEW_WIDTH = 3.3;
/** Visible table height at the reference 9:19.5 frame; shorter frames zoom out to keep it. */
export const REF_HEIGHT = BASE_VIEW_WIDTH / (9 / 19.5);

/**
 * Renderer + camera for a portrait table. The camera looks almost straight down
 * (tilted a few degrees toward the player) and is fitted so that `viewWidth`
 * table units always span the frame width, whatever the phone's aspect.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 0.46, 0.1, 80);
  /** Everything that belongs to the table (cards, chips, prints). */
  readonly table = new THREE.Group();
  w = 1;
  h = 1;
  private zoom = 1;
  private targetZoom = 1;
  private tilt = THREE.MathUtils.degToRad(12);
  private centerZ = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frameCbs = new Set<(dt: number) => void>();
  private resizeCbs = new Set<() => void>();
  private last = 0;
  private quality: Quality = 'high';

  constructor(private host: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.domElement.id = 'gl';
    host.prepend(r.domElement);
    this.renderer = r;

    this.scene.background = new THREE.Color('#03100a');
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();

    const hemi = new THREE.HemisphereLight(0xfff4e2, 0x1b2a20, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff3df, 1.05);
    key.position.set(-2.5, 9, 4);
    this.scene.add(key);
    const pool = new THREE.SpotLight(0xffe9c4, 62, 0, 0.62, 0.95, 1.6);
    pool.position.set(0, 9, 0.6);
    pool.target.position.set(0, 0, 0.2);
    this.scene.add(pool, pool.target);

    this.scene.add(this.table);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    r.setAnimationLoop((t) => this.tick(t));
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.resize();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    const dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.updateCamera();
    for (const cb of this.resizeCbs) cb();
  }

  private updateCamera() {
    const cam = this.camera;
    const vf = THREE.MathUtils.degToRad(cam.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const d = this.viewWidth / 2 / Math.tan(hf / 2);
    cam.position.set(0, d * Math.cos(this.tilt), this.centerZ + d * Math.sin(this.tilt));
    cam.lookAt(0, 0, this.centerZ);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Width of table visible across the frame. */
  get viewWidth() {
    return Math.max(BASE_VIEW_WIDTH, REF_HEIGHT * this.camera.aspect) * this.zoom;
  }

  /** Smoothly zooms the camera out (>1) or back (1), e.g. when blackjack hands are split. */
  setZoom(z: number) {
    this.targetZoom = z;
  }

  onFrame(cb: (dt: number) => void) {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  onResize(cb: () => void) {
    this.resizeCbs.add(cb);
    return () => this.resizeCbs.delete(cb);
  }

  /** Point on the table plane (height y) under the frame position (u, v) in 0..1, v from the top. */
  screenToTable(u: number, v: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    this.ray.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), this.camera);
    this.plane.constant = -y;
    this.ray.ray.intersectPlane(this.plane, out);
    return out;
  }

  /** CSS pixel position (relative to the frame) of a world point. */
  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  private tick(t: number) {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    if (Math.abs(this.targetZoom - this.zoom) > 1e-4) {
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 4);
      this.updateCamera();
    }
    for (const cb of this.frameCbs) cb(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
