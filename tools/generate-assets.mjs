/**
 * Generates DEEPER's app artwork with no image-library dependency.
 *
 * Why this exists: the icon, adaptive icon and splash were the last thing
 * standing between the repo and a real dev build, and the machine this was
 * written on has no sharp, no ImageMagick and no Pillow. So the artwork is
 * drawn here instead of being exported from a design tool — which has the happy
 * side effect that the mark is defined by geometry, reviewable in a diff, and
 * reproducible with `npm run assets`.
 *
 * Technique: signed distance fields, evaluated per pixel, with a 1px analytic
 * feather for anti-aliasing. No supersampling, so a 1024x1024 render is fast and
 * the output has no ringing.
 *
 * Run: npm run assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');

// ---------------------------------------------------------------- palette ---
// Taken from src/lib/theme.ts. If the theme moves, move these.
const BG_TOP = '#11111A';
const BG_BOTTOM = '#08080C';
const PINK = '#FF3B6B';
const PURPLE = '#9B5CFF';
const GLOW = '#5B2BD9';

// ------------------------------------------------------------------ mark ---
// The "?" is built from primitives rather than a font, so it renders identically
// on every machine and scales to 48px without a hinting dependency.
//
// Normalised space is y-up and roughly [-0.5, 0.7]; the render centres whatever
// bounding box the primitives produce, so the mark is optically centred rather
// than assuming it is symmetric.
// 0.108 is the sweet spot. Thicker and the hook's counter closes up and the
// lower-right diagonal turns into a solid slab; thinner and the mark goes soft
// and loses its weight against the dark background.
const STROKE = 0.108;      // half-width of the hook stroke
// The left terminal has to stop high (around 10 o'clock) and the inward curl has
// to stay shallow. Push either too far and the hook closes into a spiral that
// reads as a "6" rather than a question mark.
const ARC = { cx: 0, cy: 0.16, r: 0.4, from: 155, to: -8 }; // degrees, swept clockwise
const STEM = { c1x: 0.34, c1y: -0.02, c2x: 0.04, c2y: -0.28 };
// The gap between the stem's foot and the dot is what stops the two reading as
// one blob. Keep it visibly open — it is the first thing that breaks at 16px.
const DOT = { cx: 0.04, cy: -0.57, r: 0.095 };

// ------------------------------------------------------------------ raster ---
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** A coverage buffer the shapes stamp into, composited once at the end. */
function makeCoverage(width, height) {
  return new Float32Array(width * height);
}

/** Squared distance from point p to segment ab. */
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/**
 * Stamp a round-capped polyline into the coverage buffer.
 *
 * Only the bounding box of each segment is visited, so the cost is proportional
 * to the drawn area rather than to pixels x segments.
 */
function stampPolyline(cover, width, height, points, radius) {
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const pad = radius + 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + pad));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
        const a = Math.max(0, Math.min(1, radius + 0.5 - d));
        if (a > 0) {
          const idx = y * width + x;
          if (a > cover[idx]) cover[idx] = a;
        }
      }
    }
  }
}

function stampCircle(cover, width, height, cx, cy, radius) {
  const pad = radius + 1;
  const x0 = Math.max(0, Math.floor(cx - pad));
  const x1 = Math.min(width - 1, Math.ceil(cx + pad));
  const y0 = Math.max(0, Math.floor(cy - pad));
  const y1 = Math.min(height - 1, Math.ceil(cy + pad));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.max(0, Math.min(1, radius + 0.5 - d));
      if (a > 0) {
        const idx = y * width + x;
        if (a > cover[idx]) cover[idx] = a;
      }
    }
  }
}

/** The "?" outline sampled in normalised space, before it is mapped to pixels. */
function markOutline() {
  const arc = [];
  for (let deg = ARC.from; deg >= ARC.to; deg -= 1) {
    const rad = (deg * Math.PI) / 180;
    arc.push([ARC.cx + ARC.r * Math.cos(rad), ARC.cy + ARC.r * Math.sin(rad)]);
  }
  // Quadratic Bezier continuing the arc's terminal inward, which is what turns
  // a plain C into something that reads as a question mark.
  const [x0, y0] = arc[arc.length - 1];
  const stem = [];
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24;
    const u = 1 - t;
    stem.push([
      u * u * x0 + 2 * u * t * STEM.c1x + t * t * STEM.c2x,
      u * u * y0 + 2 * u * t * STEM.c1y + t * t * STEM.c2y,
    ]);
  }
  return { polyline: [...arc, ...stem], dot: DOT };
}

function render({ size, maxDimFraction, background, withAlpha, glow }) {
  const { polyline, dot } = markOutline();
  const bounds = { ...dot, minX: DOT.cx - DOT.r, minY: DOT.cy - DOT.r, maxX: DOT.cx + DOT.r, maxY: DOT.cy + DOT.r };
  for (const [x, y] of polyline) {
    bounds.minX = Math.min(bounds.minX, x - STROKE);
    bounds.maxX = Math.max(bounds.maxX, x + STROKE);
    bounds.minY = Math.min(bounds.minY, y - STROKE);
    bounds.maxY = Math.max(bounds.maxY, y + STROKE);
  }
  // Centre on the mark's own bounding box, then constrain its larger dimension.
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = (size * maxDimFraction) / Math.max(spanX, spanY);
  const originX = size / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const originY = size / 2 + ((bounds.minY + bounds.maxY) / 2) * scale;
  const toPx = ([x, y]) => [originX + x * scale, originY - y * scale];

  const cover = makeCoverage(size, size);
  stampPolyline(cover, size, size, polyline.map(toPx), STROKE * scale);
  stampCircle(cover, size, size, originX + dot.cx * scale, originY - dot.cy * scale, dot.r * scale);

  // The gradient runs across the mark's own extent so the colour actually
  // changes across the visible artwork rather than sitting at one end of it.
  const markTop = originY - bounds.maxY * scale;
  const markBottom = originY - bounds.minY * scale;
  const pink = hex(PINK);
  const purple = hex(PURPLE);
  const glowRgb = hex(GLOW);
  const [bgTop, bgBottom] = background ? [hex(BG_TOP), hex(BG_BOTTOM)] : [null, null];

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const alpha = cover[idx] ?? 0;

      let r = 0;
      let g = 0;
      let b = 0;
      if (bgTop) {
        const t = y / (size - 1);
        r = bgTop[0] + (bgBottom[0] - bgTop[0]) * t;
        g = bgTop[1] + (bgBottom[1] - bgTop[1]) * t;
        b = bgTop[2] + (bgBottom[2] - bgTop[2]) * t;
        if (glow) {
          // A very soft off-centre bloom. Kept under 8% so it reads as depth
          // rather than as a coloured blob behind the mark.
          const dx = (x - size * 0.5) / (size * 0.42);
          const dy = (y - size * 0.44) / (size * 0.42);
          const k = Math.max(0, 1 - (dx * dx + dy * dy)) * 0.08;
          r += (glowRgb[0] - r) * k;
          g += (glowRgb[1] - g) * k;
          b += (glowRgb[2] - b) * k;
        }
      }

      if (alpha > 0) {
        const t = Math.max(0, Math.min(1, (y - markTop) / (markBottom - markTop)));
        const mr = pink[0] + (purple[0] - pink[0]) * t;
        const mg = pink[1] + (purple[1] - pink[1]) * t;
        const mb = pink[2] + (purple[2] - pink[2]) * t;
        r = r + (mr - r) * alpha;
        g = g + (mg - g) * alpha;
        b = b + (mb - b) * alpha;
      }

      const o = idx * 4;
      out[o] = Math.round(r);
      out[o + 1] = Math.round(g);
      out[o + 2] = Math.round(b);
      out[o + 3] = withAlpha ? Math.round(alpha * 255) : 255;
    }
  }
  return out;
}

// ------------------------------------------------------------------ assets ---
const targets = [
  // iOS app icon: full-bleed, opaque, no alpha channel. iOS applies its own
  // mask, so the square must not be pre-rounded.
  { file: 'icon.png', size: 1024, maxDimFraction: 0.746, background: true, withAlpha: false, glow: true },
  // Android adaptive foreground. Transparent, and the mark is kept inside the
  // centre 64% so no OEM mask (circle, squircle, teardrop) can clip it.
  { file: 'adaptive-icon.png', size: 1024, maxDimFraction: 0.64, background: false, withAlpha: true, glow: false },
  // Splash: transparent mark laid over the dark background colour in app.json.
  { file: 'splash-icon.png', size: 512, maxDimFraction: 0.7, background: false, withAlpha: true, glow: false },
  { file: 'favicon.png', size: 48, maxDimFraction: 0.86, background: true, withAlpha: false, glow: false },
];

fs.mkdirSync(OUT, { recursive: true });
// The marketing site is a separate static bundle, so the two files it also
// needs are mirrored into site/assets rather than reaching back up the tree.
const SITE_ASSETS = path.join(ROOT, 'site', 'assets');
fs.mkdirSync(SITE_ASSETS, { recursive: true });
const MIGRATED = new Set(['icon.png', 'adaptive-icon.png', 'favicon.png']);
for (const target of targets) {
  const pixels = render(target);
  const png = encodePng(target.size, target.size, pixels, target.withAlpha);
  fs.writeFileSync(path.join(OUT, target.file), png);
  if (MIGRATED.has(target.file)) {
    fs.writeFileSync(path.join(SITE_ASSETS, target.file), png);
  }
  console.log(`  ${target.file.padEnd(18)} ${target.size}x${target.size}  ${(png.length / 1024).toFixed(1)} KiB`);
}
console.log(`\nArtwork written to ${path.relative(ROOT, OUT)}/`);
