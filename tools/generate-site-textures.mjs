/**
 * Generates the site's atmospheric textures.
 *
 * These are real image files, not CSS gradients, for three reasons: a PNG glow
 * can carry a noise dither that a CSS radial gradient cannot (which is what
 * stops an 8-bit gradient from banding on a wide dark surface), it costs one
 * cached request instead of a repainting layer, and the grain has to be a
 * decodable texture rather than a CSS filter.
 *
 * Everything is drawn with the same SDF rasteriser as the app icon
 * (tools/png.mjs), so there is still no image-library dependency.
 *
 * Run: npm run site:textures
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// Brand hues, kept in sync with site/tokens.css.
const PINK = hex('#FF3B6B');
const VIOLET = hex('#9B5CFF');
const EMBER = hex('#FF8A4C');

/** Deterministic value noise, so a rebuild produces a byte-identical file. */
function makeNoise(seed) {
  let s = seed >>> 0;
  const next = () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
  return next;
}

/**
 * A soft off-centre glow.
 *
 * `falloff` is the exponent on the radial distance. Above 1 it tightens the
 * bright core; the important part is the tail, which has to reach zero smoothly
 * or the edge of the sprite is visible as a disc.
 *
 * No per-pixel noise here on purpose. A dither stops 8-bit banding, but it also
 * makes the file incompressible: with noise these encoded to ~290 KiB each, and
 * without it to single-digit KiB. The separate grain.png overlay dithers
 * perceptually for a fraction of the cost.
 */
function glow({ size, colour, cx = 0.5, cy = 0.5, radius = 0.5, intensity = 0.5, falloff = 2.1 }) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - cx;
      const dy = (y + 0.5) / size - cy;
      const dist = Math.hypot(dx, dy) / radius;
      // Smoothstep to zero at the rim so the sprite edge never shows.
      const edge = 1 - Math.min(1, Math.max(0, (dist - 0.55) / 0.45));
      const a = Math.pow(Math.max(0, 1 - dist), falloff) * edge * intensity;
      const o = (y * size + x) * 4;
      px[o] = colour[0];
      px[o + 1] = colour[1];
      px[o + 2] = colour[2];
      px[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  return px;
}

/** Monochrome film grain as a tileable greyscale-alpha texture. */
function grain({ size, strength = 0.055, seed = 19 }) {
  const px = Buffer.alloc(size * size * 4);
  const rand = makeNoise(seed);
  for (let i = 0; i < size * size; i += 1) {
    const v = rand();
    // Push toward the mid so the grain reads as texture, not as salt and pepper.
    const m = 0.5 + (v - 0.5) * 2;
    const o = i * 4;
    const c = Math.round(m * 255);
    px[o] = c; px[o + 1] = c; px[o + 2] = c;
    px[o + 3] = Math.round(Math.abs(v - 0.5) * 2 * strength * 255);
  }
  return px;
}

const targets = [
  // Hero warmth: pink, large, sitting high-left where the headline lands.
  { file: 'glow-pink.png', gen: () => glow({ size: 900, colour: PINK, cx: 0.28, cy: 0.2, radius: 0.62, intensity: 0.42 }) },
  // Counterweight: violet, low-right, keeps the hero from reading as one wash.
  { file: 'glow-violet.png', gen: () => glow({ size: 820, colour: VIOLET, cx: 0.74, cy: 0.78, radius: 0.6, intensity: 0.34 }) },
  // A third, warm and very soft, for the decks and CTA bands.
  { file: 'glow-ember.png', gen: () => glow({ size: 780, colour: EMBER, cx: 0.5, cy: 0.42, radius: 0.66, intensity: 0.2 }) },
  // Small on purpose: grain is incompressible, so a big tile is a big download.
  { file: 'grain.png', gen: () => grain({ size: 128, strength: 0.05, seed: 19 }) },
];

for (const t of targets) {
  const pixels = t.gen();
  // Derive the size from the buffer rather than repeating it. A mismatch here
  // silently crops the sprite instead of failing.
  const size = Math.round(Math.sqrt(pixels.length / 4));
  const png = encodePng(size, size, pixels, true);
  fs.writeFileSync(path.join(OUT, t.file), png);
  console.log(`  ${t.file.padEnd(18)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KiB`);
}
console.log(`\nTextures written to ${path.relative(ROOT, OUT)}/`);
