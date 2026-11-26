/** Suit glyphs as Path2D in a 100×100 box, so they render identically on every platform. */

function heart(): Path2D {
  const p = new Path2D();
  p.moveTo(50, 96);
  p.bezierCurveTo(30, 78, 0, 58, 0, 32);
  p.bezierCurveTo(0, 14, 13, 2, 28, 2);
  p.bezierCurveTo(39, 2, 47, 9, 50, 18);
  p.bezierCurveTo(53, 9, 61, 2, 72, 2);
  p.bezierCurveTo(87, 2, 100, 14, 100, 32);
  p.bezierCurveTo(100, 58, 70, 78, 50, 96);
  p.closePath();
  return p;
}

function diamond(): Path2D {
  const p = new Path2D();
  p.moveTo(50, 0);
  p.bezierCurveTo(58, 16, 72, 34, 86, 50);
  p.bezierCurveTo(72, 66, 58, 84, 50, 100);
  p.bezierCurveTo(42, 84, 28, 66, 14, 50);
  p.bezierCurveTo(28, 34, 42, 16, 50, 0);
  p.closePath();
  return p;
}

function spade(): Path2D {
  const p = new Path2D();
  p.moveTo(50, 0);
  p.bezierCurveTo(62, 20, 100, 38, 100, 62);
  p.bezierCurveTo(100, 78, 88, 88, 74, 88);
  p.bezierCurveTo(64, 88, 57, 83, 53, 76);
  p.bezierCurveTo(54, 87, 58, 95, 67, 100);
  p.lineTo(33, 100);
  p.bezierCurveTo(42, 95, 46, 87, 47, 76);
  p.bezierCurveTo(43, 83, 36, 88, 26, 88);
  p.bezierCurveTo(12, 88, 0, 78, 0, 62);
  p.bezierCurveTo(0, 38, 38, 20, 50, 0);
  p.closePath();
  return p;
}

function club(): Path2D {
  const p = new Path2D();
  p.arc(50, 25, 23, 0, Math.PI * 2);
  p.moveTo(47, 62);
  p.arc(25, 60, 23, 0, Math.PI * 2);
  p.moveTo(98, 60);
  p.arc(75, 60, 23, 0, Math.PI * 2);
  p.moveTo(40, 40);
  p.rect(38, 36, 24, 30);
  p.moveTo(47, 62);
  p.bezierCurveTo(46, 80, 42, 92, 32, 100);
  p.lineTo(68, 100);
  p.bezierCurveTo(58, 92, 54, 80, 53, 62);
  p.closePath();
  return p;
}

let cache: Path2D[] | null = null;
export function suitPaths(): Path2D[] {
  if (!cache) cache = [spade(), heart(), diamond(), club()];
  return cache;
}

/** Draws suit `s` centred at (cx, cy) with height `size`. */
export function drawSuit(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, size: number, flip = false) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.rotate(Math.PI);
  ctx.scale(size / 100, size / 100);
  ctx.translate(-50, -50);
  ctx.fill(suitPaths()[s]);
  ctx.restore();
}
