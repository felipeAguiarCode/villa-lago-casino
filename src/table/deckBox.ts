import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { drawEmblem } from '../ui/emblem';

/**
 * A sealed playing-card box lying on the felt. Box art is drawn in canvas from the current card
 * back; the gold parts are real foil: a matching mask drives metalness and roughness so they catch
 * the room reflections.
 */
export const BOX_W = 0.8;
export const BOX_D = 1.1;
export const BOX_T = 0.26;
const RAD = 0.035;
/** Canvas pixels per table unit. */
const PX = 1000;

const PAPER = 'rgb(0,150,0)'; // mask: roughness .59, metalness 0
const FOIL = 'rgb(0,58,255)'; // mask: roughness .23, metalness 1
const INK = 'rgb(0,200,0)'; // mask: matte ink

type Paint = (g: CanvasRenderingContext2D, mask: boolean) => void;

function goldGrad(g: CanvasRenderingContext2D, y0: number, y1: number) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#fff0bf');
  gr.addColorStop(0.45, '#e2b75c');
  gr.addColorStop(0.55, '#c99838');
  gr.addColorStop(1, '#f6dc96');
  return gr;
}

/** Draws the same layout twice: in colour and as the foil mask. */
function art(w: number, h: number, paint: Paint) {
  const make = (mask: boolean) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    paint(g, mask);
    return cv;
  };
  const color = new THREE.CanvasTexture(make(false));
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 8;
  const mask = new THREE.CanvasTexture(make(true));
  mask.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: color, roughnessMap: mask, metalnessMap: mask, roughness: 1, metalness: 1 });
}

function rule(g: CanvasRenderingContext2D, mask: boolean, x: number, y: number, w: number, h: number, lw: number, r = 0) {
  g.strokeStyle = mask ? FOIL : goldGrad(g, y, y + h);
  g.lineWidth = lw;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.stroke();
}

function goldText(g: CanvasRenderingContext2D, mask: boolean, text: string, x: number, y: number, font: string, spacing = 0) {
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = `${spacing}px`;
  g.fillStyle = mask ? FOIL : goldGrad(g, y - 40, y + 40);
  g.fillText(text, x, y);
  g.letterSpacing = '0px';
}

/** Small diamond fleuron. */
function fleuron(g: CanvasRenderingContext2D, mask: boolean, x: number, y: number, s: number) {
  g.fillStyle = mask ? FOIL : goldGrad(g, y - s, y + s);
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.55, y);
  g.lineTo(x, y + s);
  g.lineTo(x - s * 0.55, y);
  g.closePath();
  g.fill();
  for (const d of [-1, 1]) {
    g.beginPath();
    g.arc(x + d * s * 1.05, y, s * 0.22, 0, Math.PI * 2);
    g.fill();
  }
}

/** The face of the box: the card back framed in gold, title bands and the seal over the flap. */
function frontPaint(back: HTMLCanvasElement | null): Paint {
  const w = BOX_W * PX;
  const h = BOX_D * PX;
  return (g, mask) => {
    if (mask) {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, w, h);
    } else if (back) {
      // the back design, without the card's white margin, fills the box
      const m = back.width * 0.09;
      g.drawImage(back, m, m, back.width - 2 * m, back.height - 2 * m, 0, 0, w, h);
      // darker outer band
      g.fillStyle = 'rgba(0,0,0,.42)';
      g.fillRect(0, 0, w, 70);
      g.fillRect(0, h - 70, w, 70);
      g.fillRect(0, 0, 54, h);
      g.fillRect(w - 54, 0, 54, h);
    } else {
      g.fillStyle = '#4a0817';
      g.fillRect(0, 0, w, h);
    }
    rule(g, mask, 30, 30, w - 60, h - 60, 7, 26);
    rule(g, mask, 46, 46, w - 92, h - 92, 2.5, 18);
    for (const [x, y] of [
      [46, 46],
      [w - 46, 46],
      [46, h - 46],
      [w - 46, h - 46],
    ])
      fleuron(g, mask, x, y, 22);
    // title bands
    for (const [y, text, size] of [
      [235, 'VILLA LAGO', 92],
      [h - 200, 'PLAYING CARDS', 54],
    ] as const) {
      g.fillStyle = mask ? INK : 'rgba(10,6,4,.78)';
      g.fillRect(70, y - 62, w - 140, 124);
      rule(g, mask, 70, y - 62, w - 140, 124, 4);
      rule(g, mask, 82, y - 50, w - 164, 100, 1.5);
      goldText(g, mask, text, w / 2, y + 4, `700 ${size}px "Cinzel", serif`, size > 60 ? 6 : 8);
    }
    goldText(g, mask, 'FINE QUALITY · 52 CARDS', w / 2, h - 128, '600 22px "Cinzel", serif', 5);
    // the seal strip across the flap (the box is closed)
    const sy = 0;
    const sh = 118;
    g.fillStyle = mask ? PAPER : '#f1e6cc';
    g.fillRect(w / 2 - 92, sy, 184, sh);
    if (!mask) {
      g.fillStyle = 'rgba(120,90,40,.25)';
      for (let y = sy + 6; y < sh; y += 7) g.fillRect(w / 2 - 88, y, 176, 1.2);
    }
    rule(g, mask, w / 2 - 92, sy - 10, 184, sh + 10, 5);
    if (mask) {
      g.fillStyle = FOIL;
      g.beginPath();
      g.arc(w / 2, sh - 4, 48, 0, Math.PI * 2);
      g.fill();
    } else drawEmblem(g, w / 2, sh - 4, 48);
  };
}

/** Long sides: dark band with gold pinstripes and the name. */
function sidePaint(len: number, label: string): Paint {
  const w = len * PX;
  const h = BOX_T * PX;
  return (g, mask) => {
    g.fillStyle = mask ? PAPER : '#140d0a';
    g.fillRect(0, 0, w, h);
    if (!mask) {
      const sh = g.createLinearGradient(0, 0, 0, h);
      sh.addColorStop(0, 'rgba(255,255,255,.08)');
      sh.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = sh;
      g.fillRect(0, 0, w, h);
    }
    rule(g, mask, 24, 22, w - 48, h - 44, 4);
    rule(g, mask, 34, 32, w - 68, h - 64, 1.5);
    goldText(g, mask, label, w / 2, h / 2 + 3, '700 64px "Cinzel", serif', 10);
    fleuron(g, mask, 90, h / 2, 26);
    fleuron(g, mask, w - 90, h / 2, 26);
  };
}

/** The end with the tuck flap: flap edge, thumb notch and the end of the seal. */
function flapPaint(): Paint {
  const w = BOX_W * PX;
  const h = BOX_T * PX;
  return (g, mask) => {
    g.fillStyle = mask ? PAPER : '#140d0a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = mask ? INK : 'rgba(0,0,0,.7)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(20, h * 0.42);
    g.lineTo(w / 2 - 90, h * 0.42);
    g.arc(w / 2, h * 0.42, 90, Math.PI, 0, true);
    g.lineTo(w - 20, h * 0.42);
    g.stroke();
    rule(g, mask, 24, 22, w - 48, h - 44, 3);
    g.fillStyle = mask ? PAPER : '#f1e6cc';
    g.fillRect(w / 2 - 92, 0, 184, h);
    rule(g, mask, w / 2 - 92, -10, 184, h + 20, 5);
  };
}

export class DeckBox {
  readonly group = new THREE.Group();
  private front: THREE.Mesh;

  constructor(back: HTMLCanvasElement | null) {
    const body = new THREE.Mesh(new RoundedBoxGeometry(BOX_W, BOX_T, BOX_D, 4, RAD), new THREE.MeshStandardMaterial({ color: '#120b08', roughness: 0.55, metalness: 0.05 }));
    body.position.y = BOX_T / 2;
    this.group.add(body);
    const inset = RAD * 0.9;
    const plane = (w: number, h: number) => new THREE.PlaneGeometry(w - 2 * inset, h - 2 * inset);
    // top face (the box's front)
    this.front = new THREE.Mesh(plane(BOX_W, BOX_D).rotateX(-Math.PI / 2), art(BOX_W * PX, BOX_D * PX, frontPaint(back)));
    this.front.position.y = BOX_T + 0.0015;
    // the art planes are cropped by the inset, so their UVs match the drawn layout closely enough
    const sideMat = art(BOX_D * PX, BOX_T * PX, sidePaint(BOX_D, 'VILLA LAGO'));
    const sideMat2 = art(BOX_D * PX, BOX_T * PX, sidePaint(BOX_D, 'PLAYING CARDS'));
    const right = new THREE.Mesh(plane(BOX_D, BOX_T).rotateY(Math.PI / 2), sideMat);
    right.position.set(BOX_W / 2 + 0.0015, BOX_T / 2, 0);
    const left = new THREE.Mesh(plane(BOX_D, BOX_T).rotateY(-Math.PI / 2), sideMat2);
    left.position.set(-BOX_W / 2 - 0.0015, BOX_T / 2, 0);
    const flap = new THREE.Mesh(plane(BOX_W, BOX_T).rotateY(Math.PI), art(BOX_W * PX, BOX_T * PX, flapPaint()));
    flap.position.set(0, BOX_T / 2, -BOX_D / 2 - 0.0015);
    const bottomEnd = new THREE.Mesh(plane(BOX_W, BOX_T), art(BOX_W * PX, BOX_T * PX, sidePaint(BOX_W, '52')));
    bottomEnd.position.set(0, BOX_T / 2, BOX_D / 2 + 0.0015);
    this.group.add(this.front, right, left, flap, bottomEnd);
    // soft contact shadow
    const sh = document.createElement('canvas');
    sh.width = 128;
    sh.height = 160;
    const sg = sh.getContext('2d')!;
    const grd = sg.createRadialGradient(64, 80, 20, 64, 80, 78);
    grd.addColorStop(0, 'rgba(0,0,0,.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 128, 160);
    const shadowTex = new THREE.CanvasTexture(sh);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(BOX_W * 1.5, BOX_D * 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.position.set(0.05, 0.002, 0.06);
    shadow.renderOrder = 1;
    this.group.add(shadow);
  }

  /** Re-prints the box for a new card back. */
  setBack(back: HTMLCanvasElement) {
    const old = this.front.material as THREE.MeshStandardMaterial;
    this.front.material = art(BOX_W * PX, BOX_D * PX, frontPaint(back));
    old.map?.dispose();
    old.roughnessMap?.dispose();
    old.dispose();
  }
}
