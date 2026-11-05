/**
 * Prints the mark as ASCII art so its geometry can be checked in a terminal,
 * including at the small sizes it will actually be seen at on a home screen.
 *
 * This is the fastest way to catch a geometry change that renders off-centre,
 * too thick, or merged into a blob — all of which survive a dimension check.
 *
 * Run: node tools/ascii-mark.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAMP = ' .:-=+*#%@';

for (const [file, cols, rows] of [
  ['icon.png', 70, 35],
  ['adaptive-icon.png', 70, 35],
  ['icon.png', 30, 15],
  ['icon.png', 18, 9],
]) {
  const image = decodePng(fs.readFileSync(path.join(ROOT, 'assets', file)));
  const { width, height, hasAlpha, pixels } = image;
  console.log(`\n${file} at ${cols}x${rows}  (${hasAlpha ? 'alpha' : 'brightness'}):`);
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor((c * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      const y0 = Math.floor((r * height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const o = (y * width + x) * 4;
          if (hasAlpha) {
            sum += pixels[o + 3];
          } else {
            // The icon has no alpha, so the mark is measured by brightness
            // against its near-black background instead.
            const luma = 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2];
            sum += Math.max(0, Math.min(255, (luma - 16) * (255 / 200)));
          }
          n += 1;
        }
      }
      const ink = n ? sum / n / 255 : 0;
      line += RAMP[Math.min(RAMP.length - 1, Math.round(ink * (RAMP.length - 1)))];
    }
    console.log(`  |${line}|`);
  }
}
