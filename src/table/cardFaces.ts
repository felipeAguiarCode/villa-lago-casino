import { isRed, rankLabel, rankOf, suitOf, SUIT_NAME, type Card } from '../core/cards';
import type { BackColor } from '../core/settings';
import { drawSuit } from './suits';

export const FACE_W = 512;
export const FACE_H = 716;
const RAD = 34;
const RED = '#d0121f';
const BLACK = '#16161c';

const COURT_RANK = { 11: 'jack', 12: 'queen', 13: 'king' } as Record<number, string>;
const courts = new Map<string, HTMLImageElement>();

/** Loads the CC0 court card art (Dmitry Fomin, Wikimedia Commons). Missing files fall back to procedural courts. */
export async function loadCourtArt(base: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const r of [11, 12, 13])
    for (const s of SUIT_NAME) {
      const key = `${COURT_RANK[r]}_of_${s}`;
      const img = new Image();
      img.decoding = 'async';
      jobs.push(
        new Promise<void>((res) => {
          img.onload = () => {
            courts.set(key, img);
            res();
          };
          img.onerror = () => res();
        }),
      );
      img.src = `${base}${key}.jpg`;
    }
  await Promise.all(jobs);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paper(g: CanvasRenderingContext2D) {
  roundRect(g, 2, 2, FACE_W - 4, FACE_H - 4, RAD);
  const grd = g.createLinearGradient(0, 0, FACE_W * 0.3, FACE_H);
  grd.addColorStop(0, '#fffef9');
  grd.addColorStop(1, '#f4efe1');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(60,50,30,.28)';
  g.stroke();
}

function index(g: CanvasRenderingContext2D, label: string, suit: number, color: string) {
  g.fillStyle = color;
  const ten = label === '10';
  g.font = `600 ${ten ? 120 : 136}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const cx = 64;
  if (ten) {
    g.save();
    g.translate(cx, 128);
    g.scale(0.86, 1);
    g.fillText(label, 0, 0);
    g.restore();
  } else g.fillText(label, cx, 130);
  drawSuit(g, suit, cx, 180, 64);
}

type Pip = [number, number];
const L = 0, C = 1, R = 2;
const PIPS: Record<number, Pip[]> = {
  2: [[C, 0], [C, 1]],
  3: [[C, 0], [C, 0.5], [C, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [C, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [C, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [C, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [C, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [C, 5 / 6], [L, 1], [R, 1]],
};
const COL_X = [170, 256, 342];

function pips(g: CanvasRenderingContext2D, rank: number, suit: number) {
  const top = 124;
  const span = FACE_H - 2 * top;
  for (const [col, f] of PIPS[rank]) {
    drawSuit(g, suit, COL_X[col], top + f * span, rank >= 9 ? 82 : 88, f > 0.5);
  }
}

function ace(g: CanvasRenderingContext2D, suit: number, color: string) {
  if (suit === 0) {
    // ace of spades: ornate, with the house monogram
    g.save();
    g.strokeStyle = 'rgba(160,120,40,.55)';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(256, 352, 150, 176, 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(256, 352, 138, 164, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    g.fillStyle = color;
    drawSuit(g, 0, 256, 340, 210);
    g.fillStyle = '#a88332';
    g.font = '700 30px "Cinzel", serif';
    g.textAlign = 'center';
    g.fillText('VILLA LAGO', 256, 492);
  } else {
    g.fillStyle = color;
    drawSuit(g, suit, 256, 358, 170);
  }
}

function court(g: CanvasRenderingContext2D, rank: number, suit: number, color: string) {
  const x0 = 98, y0 = 30, x1 = 414, y1 = 686;
  const img = courts.get(`${COURT_RANK[rank]}_of_${SUIT_NAME[suit]}`);
  g.save();
  if (img) {
    // crop the central figure of the 2:3 source so it fits our narrower frame without distortion
    const sh = img.height * (666 / 750);
    const sw = sh * ((x1 - x0) / (y1 - y0));
    const sx = (img.width - sw) / 2;
    const sy = img.height * (42 / 750);
    g.drawImage(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
  } else {
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, '#fff6dc');
    grd.addColorStop(0.5, '#f1dca6');
    grd.addColorStop(1, '#fff6dc');
    g.fillStyle = grd;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = color;
    g.font = '700 230px "Cinzel", serif';
    g.textAlign = 'center';
    g.fillText(rankLabel(rank), 256, 420);
    drawSuit(g, suit, 256, 520, 90);
    drawSuit(g, suit, 256, 150, 90, true);
  }
  g.strokeStyle = '#4b4f97';
  g.lineWidth = 4;
  g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  g.restore();
}

/** Renders a full-resolution card face. */
export function renderFace(card: Card): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FACE_W;
  cv.height = FACE_H;
  drawFace(cv.getContext('2d')!, card);
  return cv;
}

export const ATLAS_COLS = 13;
export const ATLAS_ROWS = 4;
export const ATLAS_CELL_W = 156;
export const ATLAS_CELL_H = 218;

/** All 52 faces at low resolution in one canvas (index = card number). Used by the shuffle show. */
export function renderAtlas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * ATLAS_CELL_W;
  cv.height = ATLAS_ROWS * ATLAS_CELL_H;
  const g = cv.getContext('2d')!;
  const sx = ATLAS_CELL_W / FACE_W;
  const sy = ATLAS_CELL_H / FACE_H;
  for (let c = 0; c < 52; c++) {
    g.save();
    g.translate((c % ATLAS_COLS) * ATLAS_CELL_W, Math.floor(c / ATLAS_COLS) * ATLAS_CELL_H);
    g.scale(sx, sy);
    drawFace(g, c);
    g.restore();
  }
  return cv;
}

function drawFace(g: CanvasRenderingContext2D, card: Card) {
  if (card >= 100) return drawNumberCard(g, card - 100);
  if (card >= 52) return drawJoker(g, card === 53);
  paper(g);
  const rank = rankOf(card);
  const suit = suitOf(card);
  const color = isRed(card) ? RED : BLACK;
  if (rank === 14) ace(g, suit, color);
  else if (rank >= 11) court(g, rank, suit, color);
  else {
    g.fillStyle = color;
    pips(g, rank, suit);
  }
  index(g, rankLabel(rank), suit, color);
  g.save();
  g.translate(FACE_W, FACE_H);
  g.rotate(Math.PI);
  index(g, rankLabel(rank), suit, color);
  g.restore();
}

export const BACK_COLORS: Record<BackColor, [string, string]> = {
  bordo: ['#7a1129', '#4a0817'],
  marinho: ['#16295a', '#0a1533'],
  esmeralda: ['#0f5a3c', '#073322'],
};

/** Original card back: lattice of lake waves and the VL medallion. */
export function renderBack(color: BackColor): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FACE_W;
  cv.height = FACE_H;
  const g = cv.getContext('2d')!;
  const [c1, c2] = BACK_COLORS[color];
  paper(g);
  const m = 22;
  roundRect(g, m, m, FACE_W - 2 * m, FACE_H - 2 * m, RAD - 14);
  const grd = g.createRadialGradient(256, 358, 40, 256, 358, 420);
  grd.addColorStop(0, c1);
  grd.addColorStop(1, c2);
  g.fillStyle = grd;
  g.fill();
  g.save();
  g.clip();
  // diagonal lattice
  g.strokeStyle = 'rgba(255,226,160,.28)';
  g.lineWidth = 2;
  const step = 30;
  for (let i = -FACE_H; i < FACE_W + FACE_H; i += step) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + FACE_H, FACE_H);
    g.moveTo(i, FACE_H);
    g.lineTo(i + FACE_H, 0);
    g.stroke();
  }
  // little wave marks in each cell
  g.strokeStyle = 'rgba(255,226,160,.42)';
  g.lineWidth = 2.2;
  for (let y = 0; y < FACE_H + step; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < FACE_W + step; x += step) {
      g.beginPath();
      g.moveTo(x - 6, y + 1);
      g.quadraticCurveTo(x - 3, y - 4, x, y + 1);
      g.quadraticCurveTo(x + 3, y + 6, x + 6, y + 1);
      g.stroke();
    }
  }
  g.restore();
  // inner gold border
  g.strokeStyle = 'rgba(240,206,130,.85)';
  g.lineWidth = 4;
  roundRect(g, m + 12, m + 12, FACE_W - 2 * m - 24, FACE_H - 2 * m - 24, RAD - 20);
  g.stroke();
  // medallion
  g.save();
  g.translate(256, 358);
  g.fillStyle = c2;
  g.beginPath();
  g.ellipse(0, 0, 112, 128, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#efcf86';
  g.lineWidth = 6;
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(0, 0, 98, 114, 0, 0, Math.PI * 2);
  g.stroke();
  const tg = g.createLinearGradient(0, -60, 0, 60);
  tg.addColorStop(0, '#fff1c4');
  tg.addColorStop(0.5, '#e7c06a');
  tg.addColorStop(1, '#a8792b');
  g.fillStyle = tg;
  g.font = '700 118px "Cinzel", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('VL', 0, 6);
  g.font = '700 20px "Cinzel", serif';
  g.fillText('CASINO', 0, 78);
  g.restore();
  return cv;
}

/** Small PNG data URL of a card, for HUD and lobby art. */
export function cardDataURL(card: Card | 'back', w = 120, back: BackColor = 'bordo'): string {
  const src = card === 'back' ? renderBack(back) : renderFace(card);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = Math.round((w * FACE_H) / FACE_W);
  const g = cv.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/png');
}

/** Joker: jester medallion, "JOKER" written down both corners. Two colourways (red / black). */
function drawJoker(g: CanvasRenderingContext2D, black: boolean) {
  paper(g);
  const ink = black ? BLACK : RED;
  g.save();
  g.fillStyle = ink;
  g.font = '700 54px "Cinzel", serif';
  g.textAlign = 'center';
  const word = 'JOKER';
  for (let i = 0; i < word.length; i++) g.fillText(word[i], 58, 96 + i * 56);
  g.translate(FACE_W, FACE_H);
  g.rotate(Math.PI);
  for (let i = 0; i < word.length; i++) g.fillText(word[i], 58, 96 + i * 56);
  g.restore();
  // medallion
  g.save();
  g.translate(276, 358);
  const grd = g.createRadialGradient(0, -40, 20, 0, 0, 190);
  grd.addColorStop(0, black ? '#3a3f52' : '#f5d16a');
  grd.addColorStop(1, black ? '#11131c' : '#a6741b');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(0, 0, 150, 200, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d8b660';
  g.lineWidth = 8;
  g.stroke();
  // jester hat: three curled points with bells
  g.fillStyle = ink;
  g.strokeStyle = '#fff6dc';
  g.lineWidth = 5;
  const tips: [number, number][] = [
    [-110, -120],
    [0, -165],
    [110, -120],
  ];
  g.beginPath();
  g.moveTo(-95, 40);
  for (const [x, y] of tips) {
    g.quadraticCurveTo(x * 0.5, -20, x, y);
    g.quadraticCurveTo(x * 0.3, -10, 0, 10);
  }
  g.lineTo(95, 40);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#f2d27a';
  for (const [x, y] of tips) {
    g.beginPath();
    g.arc(x, y, 18, 0, Math.PI * 2);
    g.fill();
  }
  // band and face
  g.fillStyle = '#fff6dc';
  g.fillRect(-100, 36, 200, 26);
  g.beginPath();
  g.arc(0, 112, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 118, 30, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.fillStyle = ink;
  g.beginPath();
  g.arc(-20, 98, 7, 0, Math.PI * 2);
  g.arc(20, 98, 7, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Numbered card (1..11) for Trump 21: big numeral, gold frame, original design. */
function drawNumberCard(g: CanvasRenderingContext2D, n: number) {
  paper(g);
  const hue = ['#7a1129', '#16295a', '#0f5a3c'][n % 3];
  const m = 30;
  g.save();
  g.strokeStyle = '#c9a35a';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(m, m, FACE_W - 2 * m, FACE_H - 2 * m, 24);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(m + 14, m + 14, FACE_W - 2 * m - 28, FACE_H - 2 * m - 28, 16);
  g.stroke();
  // ring of pips around the numeral
  g.fillStyle = hue;
  g.globalAlpha = 0.85;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    g.beginPath();
    g.arc(256 + Math.cos(a) * 168, 358 + Math.sin(a) * 210, 15, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const grd = g.createLinearGradient(0, 220, 0, 500);
  grd.addColorStop(0, hue);
  grd.addColorStop(1, '#0b0b10');
  g.fillStyle = grd;
  g.font = `700 ${n >= 10 ? 250 : 300}px "Cinzel", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 256, 372);
  g.font = '700 86px "Barlow Condensed", sans-serif';
  g.fillStyle = hue;
  g.textBaseline = 'alphabetic';
  g.fillText(String(n), 92, 140);
  g.translate(FACE_W, FACE_H);
  g.rotate(Math.PI);
  g.fillText(String(n), 92, 140);
  g.restore();
}
