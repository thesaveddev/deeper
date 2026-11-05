/**
 * Applies the mechanical half of the de-slop pass to every page in site/.
 *
 * The transforms here are the ones that are identical on every page and where a
 * hand edit would risk missing one instance across five files:
 *
 *   1. the body face swap, so the font is named once rather than in five <link>s
 *   2. removal of every eyebrow kicker
 *   3. replacement of the Unicode deck glyphs with the authored SVGs
 *   4. the .lit -> .panel rename, and .lit mode -> .mode
 *
 * Everything structural (the hero-metric rows becoming ruled specs, the section
 * heads) is edited by hand, because the content differs per page.
 *
 * Run: node tools/apply-de-slop.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark } from './deck-marks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PAGES = ['index.html', 'how-to-play.html', 'decks.html', 'faq.html', 'privacy-policy.html'];

const OLD_FONT = 'family=Plus+Jakarta+Sans:wght@400;500;600';
const NEW_FONT = 'family=Schibsted+Grotesk:wght@400;500;600;700';

const report = [];

for (const name of PAGES) {
  const file = path.join(SITE, name);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  // 1. body face
  src = src.split(OLD_FONT).join(NEW_FONT);

  // 2. eyebrows. The element is on its own line in every page, so a line-level
  //    removal is exact. Nothing else uses the class.
  const eyebrowLines = src.match(/^[ \t]*<span class="eyebrow">[^<]*<\/span>\r?\n/gm) ?? [];
  src = src.replace(/^[ \t]*<span class="eyebrow">[^<]*<\/span>\r?\n/gm, '');

  // 3. deck glyphs -> authored SVG
  const glyphs = src.match(/<span class="deck__glyph" aria-hidden="true">[^<]*<\/span>/g) ?? [];
  const glyphIds = ['couples', 'deep', 'know-me', 'funny', 'friends', 'first-date', 'late-night', 'after-dark'];
  let gi = -1;
  src = src.replace(/<span class="deck__glyph" aria-hidden="true">[^<]*<\/span>/g, () => {
    gi += 1;
    return mark(glyphIds[gi] ?? 'couples');
  });

  // 4. the removed card wrapper
  src = src.split('class="lit feature"').join('class="panel"');
  src = src.split('class="lit mode"').join('class="mode"');

  if (src !== before) {
    fs.writeFileSync(file, src);
    report.push({ name, eyebrows: eyebrowLines.length, glyphs: glyphs.length, changed: true });
  } else {
    report.push({ name, eyebrows: 0, glyphs: 0, changed: false });
  }
}

for (const r of report) {
  console.log(
    `${r.name.padEnd(22)} eyebrows removed: ${String(r.eyebrows).padStart(2)}   glyphs -> svg: ${String(r.glyphs).padStart(2)}   ${r.changed ? 'rewritten' : 'unchanged'}`,
  );
}

const leftover = PAGES.flatMap((name) => {
  const src = fs.readFileSync(path.join(SITE, name), 'utf8');
  const hits = [];
  if (src.includes('eyebrow')) hits.push(`${name}: eyebrow`);
  if (src.includes('deck__glyph')) hits.push(`${name}: deck__glyph`);
  if (src.includes('Plus+Jakarta')) hits.push(`${name}: old font`);
  if (src.includes('class="lit')) hits.push(`${name}: lit`);
  return hits;
});

console.log(leftover.length ? `\nLEFTOVER:\n  ${leftover.join('\n  ')}` : '\nNo leftovers.');
