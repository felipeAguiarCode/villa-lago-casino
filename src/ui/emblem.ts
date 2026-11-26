/**
 * The Villa Lago casino symbol: "VL" on a golden chip. Drawn in canvas so it can be printed on
 * card backs, the deck box, the lobby and the browser tab.
 */
export function drawEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.save();
  g.translate(cx, cy);
  // soft drop shadow
  g.shadowColor = 'rgba(0,0,0,.45)';
  g.shadowBlur = r * 0.12;
  g.shadowOffsetY = r * 0.04;
  const body = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#fff3c8');
  body.addColorStop(0.45, '#e9c46a');
  body.addColorStop(0.8, '#b8862a');
  body.addColorStop(1, '#7a5416');
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.shadowColor = 'transparent';
  // edge inserts, like a casino chip
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    g.fillStyle = '#5b1020';
    g.beginPath();
    g.arc(0, 0, r * 0.985, a - 0.16, a + 0.16);
    g.arc(0, 0, r * 0.78, a + 0.16, a - 0.16, true);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,240,200,.85)';
    g.lineWidth = r * 0.02;
    g.beginPath();
    g.arc(0, 0, r * 0.885, a - 0.1, a + 0.1);
    g.stroke();
  }
  // rims
  g.strokeStyle = 'rgba(70,44,8,.9)';
  g.lineWidth = r * 0.035;
  g.beginPath();
  g.arc(0, 0, r * 0.985, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  g.stroke();
  // inlay
  const inlay = g.createRadialGradient(-r * 0.15, -r * 0.25, r * 0.05, 0, 0, r * 0.74);
  inlay.addColorStop(0, '#fff6d6');
  inlay.addColorStop(0.6, '#f0d48c');
  inlay.addColorStop(1, '#c9952f');
  g.fillStyle = inlay;
  g.beginPath();
  g.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(90,58,10,.75)';
  g.lineWidth = r * 0.022;
  g.setLineDash([r * 0.06, r * 0.04]);
  g.beginPath();
  g.arc(0, 0, r * 0.64, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // the monogram, embossed
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${r * 0.62}px "Cinzel", serif`;
  g.fillStyle = 'rgba(255,248,225,.85)';
  g.fillText('VL', r * 0.015, r * 0.07);
  g.fillStyle = '#4a2c06';
  g.fillText('VL', 0, r * 0.05);
  g.restore();
}

const cache = new Map<number, string>();

/** PNG data URL of the emblem at `size` pixels. */
export function emblemDataURL(size = 128): string {
  let u = cache.get(size);
  if (!u) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    drawEmblem(cv.getContext('2d')!, size / 2, size / 2, size / 2 - size * 0.03);
    u = cv.toDataURL('image/png');
    cache.set(size, u);
  }
  return u;
}

/** Uses the emblem as the browser-tab icon. */
export function setFavicon() {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = emblemDataURL(64);
}
