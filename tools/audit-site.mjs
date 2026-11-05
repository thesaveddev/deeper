/**
 * Static half of the slop test, run against the emitted files.
 *
 * The visual gates (contrast, wrap, fold fit) need a real browser and are
 * checked there. Everything checkable from the source is checked here, so a
 * regression is caught without a human re-reading the CSS.
 *
 * Run: node tools/audit-site.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast } from './contrast-math.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const css = read('site/styles.css');
const tokens = read('site/tokens.css');
const html = read('site/index.html');
const visible = html.replace(/<!--[\s\S]*?-->/g, '');

/**
 * Every page is audited, not just the index. The site grew past one page, and a
 * gate that only reads index.html would have happily passed a broken nav link
 * on decks.html.
 *
 * The privacy policy is excluded from the copy gates, and only from those. It is
 * generated from docs/privacy-policy.md, which is the product's own legal copy
 * and is deliberately not rewritten to satisfy a marketing-page style rule. Its
 * structure, links and assets are still checked.
 */
const PAGES = ['index', 'how-to-play', 'decks', 'faq'];
const GENERATED = ['privacy-policy'];
const pageHtml = Object.fromEntries(
  [...PAGES, ...GENERATED].map((name) => [name, read(`site/${name}.html`).replace(/<!--[\s\S]*?-->/g, '')]),
);
/** Text a reader actually sees: tags stripped, so meta attributes do not count. */
const allPagesScrolling = [...PAGES, ...GENERATED];
const pageText = Object.fromEntries(
  Object.entries(pageHtml).map(([name, src]) => [
    name,
    // Start at <body> so <title> and the meta tags, which the browser renders
    // as chrome rather than page copy, are not measured as body copy.
    src.slice(src.indexOf('<body'))
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
      .replace(/<[^>]+>/g, ' '),
  ]),
);
const copyText = PAGES.map((name) => pageText[name]).join('\n');

const results = [];
const check = (id, pass, detail) => results.push({ id, pass, detail });

// --- 1 / 48: no improvised colours or fonts outside the token block ---------
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rawColour = cssNoComments.match(/(?<![\w-])(oklch|rgba?|hsla?)\(/g) ?? [];
check('48 tokens', rawColour.length === 0, rawColour.length ? `raw colours: ${rawColour.join(',')}` : 'no raw colour values outside tokens.css');

// Every font-family value must resolve to a token. Match the whole declaration
// value rather than relying on a negative lookahead, which \s* defeats by
// backtracking to zero-width.
const fontValues = [...cssNoComments.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim());
const rawFont = fontValues.filter((v) => !v.startsWith('var('));
check('48 fonts', rawFont.length === 0, rawFont.length ? `raw: ${rawFont.join(' | ')}` : `${fontValues.length} font-family declarations, all tokenised`);

// Zero-chroma neutrals.
//
// The rule exists because a zero-chroma grey on a near-black field reads dead
// flat. That is a claim about surfaces and ink, which a reader perceives
// directly. It is not a claim about shadows, an inset light catch, a mask
// colour, a caret or a scrollbar thumb: tinting a drop shadow pink to satisfy a
// linter would be a fiction, and none of them are ever seen as a field. Those
// token families are allowlisted by name so a new zero-chroma *surface* token
// still fails the gate.
const CHROMA_EXEMPT = /^--(shadow-|light-catch|color-mask|caret|scrollbar-)/;
const zeroChroma = [...tokens.matchAll(/--([\w-]+):\s*oklch\(\s*[\d.]+%\s+0\s/g)]
  .filter((m) => !CHROMA_EXEMPT.test(`--${m[1]}`))
  .map((m) => m[1]);
// Two light-scheme values are pure neutral white on purpose and are named
// explicitly rather than hidden behind a broad exemption:
//   color-paper-card  the raised surface, so a panel separates from the page by
//                     lightness alone. On paper, a tinted card and a tinted page
//                     at the same lightness read as the same surface.
//   color-accent-ink  the ink ON the accent fill. It is a knockout, not a field:
//                     it is whatever the fill needs to be legible against, and
//                     tinting it would put a visible colour cast on every
//                     primary button.
// Anything else zero-chroma in either scheme still fails.
const CHROMA_ALLOWED_LIGHT = new Set(['color-paper-card', 'color-accent-ink']);
const unexpectedChroma = zeroChroma.filter((n) => !CHROMA_ALLOWED_LIGHT.has(n));
check('22 chroma', unexpectedChroma.length === 0,
  unexpectedChroma.length
    ? `zero-chroma surfaces: ${unexpectedChroma.join(', ')}`
    : `every neutral surface and ink carries chroma, except ${[...CHROMA_ALLOWED_LIGHT].join(' and ')} (paper card, accent knockout)`);

// --- 2 / 6 / 7: visual tells ------------------------------------------------
const gradientText = (cssNoComments.match(/(?<!-)background-clip:\s*text/g) ?? []).length;
check('2 no gradient text', gradientText === 0, gradientText ? `${gradientText} background-clip:text declaration(s)` : 'no gradient-filled text anywhere');
check('6 hero not centred', !/text-align:\s*center/.test(css), 'no centred text declarations');
check('7 no pure black/white', !/#000\b|#fff\b|rgb\(255,\s*255,\s*255\)|rgb\(0,\s*0,\s*0\)/.test(cssNoComments), 'no pure #000 or #fff');

// --- 10 / 11 / 12 / 14: microinteraction tells ------------------------------
check('10 no transition-all', !/transition:\s*all/.test(css), 'all transitions name their properties');
check('11 no uniform hover scale', !/hover[^{]*scale\(/.test(css), 'no hover scale');
// Overshoot easings are a cubic-bezier concern only. A bare /1.5/ match also
// catches line-height: 1.55, which is not an easing at all.
const overshoot = [...cssNoComments.matchAll(/cubic-bezier\(([^)]*)\)/g)].filter((m) => /,\s*1\.[5-9]\d*\s*,/.test(m[1]));
check('12 no overshoot easing', overshoot.length === 0, overshoot.length ? overshoot.map((m) => m[0]).join(' ') : 'no overshoot cubic-bezier on UI state');
const animProps = (cssNoComments.match(/transition:\s*([^;]+)/g) ?? []).join(';');
check('14 no layout anim', !/transition:[^;]*\b(width|height|top|left|margin|padding)\b/.test(animProps), 'transitions touch only paint properties');

// --- 20: the stamp ----------------------------------------------------------
// The stamp records which design system owns this file. Two systems have been
// applied to this site: Hallmark set the visual world and macrostructure, and
// Impeccable's polish pass rebuilt the depth, type and component layer on top
// of it. Either marker satisfies the gate, and the detail line is printed so it
// is obvious which one is currently authoring the file.
const hallmarkStamp = /\/\*\s*Hallmark[^*]*·\s*macrostructure:/.test(css);
const impeccableStamp = /\/\*\s*Impeccable\s*·\s*surface:/.test(css);
check('20 stamp', hallmarkStamp || impeccableStamp,
  !hallmarkStamp && !impeccableStamp
    ? 'no design-system stamp at the top of styles.css'
    : impeccableStamp
      ? 'Impeccable surface stamp present (Hallmark world preserved underneath)'
      : 'Hallmark macrostructure stamp present');

// --- 21: no Specimen fall-through ------------------------------------------
check('21 not specimen', !/macrostructure:\s*Specimen/.test(css), 'macrostructure is Narrative Workflow, not Specimen');

// --- 24: spacing on the named scale ----------------------------------------
// -1px is allowlisted: it is the clip artefact in the .visually-hidden utility,
// which pulls a 1px box off-screen so it paints nothing. It is not spacing.
const scale = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96, 128]);
const offScale = [...cssNoComments.matchAll(/(?:padding|margin|gap)[^:;]*:\s*([^;]+);/g)]
  .map((m) => m[1])
  .filter((v) => /px/.test(v) && !v.includes('var('))
  .filter((v) => v.trim() !== '-1px')
  .filter((v) => !scale.has(parseInt(v, 10)));
check('24 spacing scale', offScale.length === 0, offScale.length ? `off-scale: ${offScale.join(' | ')}` : 'all spacing on the 4pt scale (visually-hidden clip allowlisted)');

// --- 25: measure ------------------------------------------------------------
const measure = Number(/--measure:\s*(\d+)ch/.exec(tokens)?.[1] ?? 0);
check('25 measure', measure >= 45 && measure <= 75, `--measure is ${measure}ch`);

// --- 26 / 27: interaction + motion ------------------------------------------
const states = ['hover', 'focus-visible', 'active', 'disabled', 'is-loading', 'is-error', 'is-success'];
const missing = states.filter((s) => !css.includes(s));
check('26 eight states', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : 'default, hover, focus, active, disabled, loading, error, success');

const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css);
check('27 reduced motion', reduced, `${keyframes.length} keyframe set(s), reduced-motion block present`);

// --- 30: no emoji used as an icon -----------------------------------------
// Test for the glyphs the gate actually names, plus the blocks that carry
// Emoji_Presentation=Yes. A bare block range such as U+2600-U+27BF wrongly
// catches ordinary text dingbats, which is what the deck marks are.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2705}\u{2728}\u{26A1}\u{2B50}\u{274C}\u{2757}\u{2753}]/gu;
const emoji = copyText.match(EMOJI) ?? [];
check('30 no emoji', emoji.length === 0, emoji.length ? `found: ${emoji.join(' ')}` : 'deck marks are the app own text glyphs (U+25xx/26xx/27xx), not Emoji_Presentation');

// --- light mode -------------------------------------------------------------
// Four gates, because "there is a light mode" is four separate claims that can
// each be true while the others are false: the palette exists, the two copies of
// it agree, the scheme-dependent layers follow, and every page can reach it.

// 1. Both light blocks exist and declare the same tokens.
//
// The palette is written twice on purpose: CSS cannot apply one declaration set
// to two different matching conditions, and light mode must work both from the
// system preference (a media query) and from the toggle (an attribute). That
// makes drift a real risk, so it is checked rather than trusted: editing one
// block and not the other is a build failure, not a scheme that quietly
// disagrees with itself.
const lightMedia = /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme='dark'\]\) \{([\s\S]*?)\n {2}\}/.exec(tokens);
const lightAttr = /:root\[data-theme='light'\] \{([\s\S]*?)\n\}/.exec(tokens);
const lightProblems = [];
if (!lightMedia) lightProblems.push('no @media (prefers-color-scheme: light) block in tokens.css');
if (!lightAttr) lightProblems.push("no :root[data-theme='light'] block in tokens.css");
const grab = (block) => {
  const m = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) m[name] = value.trim();
  return m;
};
if (lightMedia && lightAttr) {
  const a = grab(lightMedia[1]);
  const b = grab(lightAttr[1]);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    if (a[k] === undefined) lightProblems.push(`${k} missing from the prefers-color-scheme block`);
    else if (b[k] === undefined) lightProblems.push(`${k} missing from the [data-theme=light] block`);
    else if (a[k] !== b[k]) lightProblems.push(`${k} differs: media "${a[k]}" vs attribute "${b[k]}"`);
  }
  // Every colour the dark block defines must be answered in light, or a token
  // silently keeps its dark value in one scheme.
  const darkBlock = /:root \{([\s\S]*?)\n\}/.exec(tokens);
  const darkColors = new Set([...(darkBlock?.[1] ?? '').matchAll(/(--color-[\w-]+):/g)].map((m) => m[1]));
  const unanswered = [...darkColors].filter((k) => a[k] === undefined);
  if (unanswered.length) lightProblems.push(`not overridden in light: ${unanswered.join(', ')}`);
}
check('light palette parity', lightProblems.length === 0,
  lightProblems.length ? lightProblems.slice(0, 4).join('; ') : `${lightAttr ? Object.keys(grab(lightAttr[1])).length : 0} token(s), identical in both blocks, every dark colour answered`);

// 2. Every light ink step must clear AA against every light surface.
//
// This imports the same oklch->sRGB->luminance path as tools/contrast-math.mjs
// rather than reimplementing it. The first version of this gate carried its own
// copy of the conversion and disagreed with the real tool by more than 2x,
// reporting a palette that measured clean as failing on every step. Two
// implementations of a colour conversion is one too many, and the gate that
// guards contrast is the last place to have an approximate one.
if (lightMedia) {
  const val = (name) => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(lightMedia[1]);
    return m ? m[1].trim() : null;
  };
  const surfaces = ['--color-paper', '--color-paper-raised', '--color-paper-card', '--color-paper-sunk']
    .map(val).filter(Boolean);
  const inks = ['--color-ink', '--color-ink-muted', '--color-ink-soft', '--color-ink-faint']
    .map((n) => [n, val(n)]).filter(([, v]) => v);
  const fails = [];
  let worstOverall = Infinity;
  for (const [name, ink] of inks) {
    let worst = Infinity, worstOn = '';
    for (const s of surfaces) {
      const r = contrast(ink, s);
      if (!Number.isFinite(r)) continue;
      if (r < worst) { worst = r; worstOn = s; }
    }
    worstOverall = Math.min(worstOverall, worst);
    if (worst < 4.5) fails.push(`${name} ${worst.toFixed(2)}:1 on ${worstOn}`);
  }
  check('light contrast AA', fails.length === 0,
    fails.length ? fails.join('; ') : `every light ink step clears 4.5:1 on all ${surfaces.length} light surfaces (worst ${worstOverall.toFixed(2)}:1)`);
}

// 3. The two blend-dependent layers must be scheme-aware. A grain left in
//    `overlay` on a near-white ground is grey mud, and a light catch left white
//    is invisible, so both are checked rather than eyeballed.
const grainUsesToken = /opacity:\s*var\(--grain-opacity\)/.test(cssNoComments) && /mix-blend-mode:\s*var\(--grain-blend\)/.test(cssNoComments);
const glowUsesToken = /\.glow \{[\s\S]*?opacity:\s*var\(--glow-opacity\)/.test(cssNoComments);
const lightCatchNotWhite = /--light-catch:\s*inset 0 1px 0 oklch\(3\d/.test(tokens);
const layerProblems = [];
if (!grainUsesToken) layerProblems.push('grain does not use --grain-opacity / --grain-blend');
if (!glowUsesToken) layerProblems.push('.glow does not use --glow-opacity');
if (!lightCatchNotWhite) layerProblems.push('--light-catch in light mode is not a tint (white is invisible on paper)');
check('scheme-aware layers', layerProblems.length === 0,
  layerProblems.length ? layerProblems.join('; ') : 'grain blend+opacity, glow opacity and light catch all follow the scheme');

// --- no sideways scroll regions ---------------------------------------------
// The catalogue sample was a horizontal scroll region. It scrolled correctly
// (programmatically verified) and was still a failure: a vertical mouse wheel
// does not scroll a horizontal container, so on a desktop it presented as a
// frozen band of text with nothing indicating it could move. Swapping unearned
// auto-motion for an undiscoverable gesture is the same mistake, quieter.
//
// This gate refuses the pattern rather than the one instance: a sideways
// scroller carrying prose a reader is meant to read. It excepts a scrolling
// data table, which is a different thing entirely. A table wider than a phone
// has to scroll sideways, it has a visible scrollbar, and the alternative
// (a clipped column) loses data. The policy page has exactly one such table.
const TABLE_SCROLL = /^[^{}]*\btable\b[^{}]*\{[^{}]*overflow-x:\s*(auto|scroll)/gms;
const cssNoTableScroll = cssNoComments.replace(TABLE_SCROLL, '');
const sideways = allPagesScrolling.filter((name) => {
  const src = read(`site/${name}.html`);
  return /class="[^"]*\bstrip__track\b/.test(src) || /overflow-x:\s*(auto|scroll)/.test(cssNoTableScroll);
});
check('no sideways scroll regions', sideways.length === 0,
  sideways.length
    ? `a horizontal scroll region carrying prose on: ${sideways.join(', ')}. Content that needs sideways scrolling to be read belongs in a static block.`
    : 'no sideways prose scrollers: every question is readable without an interaction');

// --- 34: root clipping ------------------------------------------------------
check('34 root clip', /html,\s*\nbody\s*\{[\s\S]*?overflow-x:\s*clip/.test(cssNoComments) || (/overflow-x:\s*clip/.test(cssNoComments) && !/overflow-x:\s*hidden/.test(cssNoComments)),
  'overflow-x: clip on html and body, never hidden');

// --- 37: font family ceiling ------------------------------------------------
const families = new Set([...tokens.matchAll(/--font-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].split(',')[0].replace(/['"]/g, '').trim()));
check('37 font ceiling', families.size <= 3, `${families.size} families: ${[...families].join(', ')}`);

// --- 38a: no italic headings ------------------------------------------------
const italicHead = /h1,\s*\n?h2,\s*\n?h3\s*\{[\s\S]*?font-style:\s*italic/.test(cssNoComments);
// The inner tempered dot keeps the match inside one heading, so an <em> further
// down the page is not misread as italic type in a headline.
const emInHeading = PAGES.filter((name) => /<h[1-6][^>]*>(?:(?!<\/?h[1-6])[\s\S])*?<em>/.test(pageHtml[name]));
check('38a roman headers', !italicHead && emInHeading.length === 0,
  !italicHead && emInHeading.length === 0 ? 'headings are roman, no em inside a heading' : `italic emphasis in a heading on: ${emInHeading.join(', ')}`);

// --- 44: hero padding ratio -------------------------------------------------
const heroPad = /^\.hero\s*\{[\s\S]*?padding-block:\s*([^;]+);/m.exec(css);
check('44 hero padding', !!heroPad, heroPad ? `.hero ${heroPad[1].trim()}` : 'no .hero padding-block found');

// --- 46 / 19: no invented claims --------------------------------------------
const BANNED = ['trusted by', '10,000', '100,000', 'million users', '10x', '10×', '99.9', 'Acme', 'Nexus', 'Seamless', 'Unleash', 'John Doe', 'Jane Doe'];
const hits = BANNED.filter((b) => copyText.toLowerCase().includes(b.toLowerCase()));
check('46 honest copy', hits.length === 0, hits.length ? `banned phrases: ${hits.join(', ')}` : 'no invented metrics, logos, or placeholder names');

// --- em-dash ban ------------------------------------------------------------
const emCount = (copyText.match(/—/g) ?? []).length;
const enCount = (copyText.match(/–/g) ?? []).length;
check('em-dash ban', emCount === 0 && enCount === 0, `${emCount} em-dash, ${enCount} en-dash in visible copy`);

// --- CTA intent consistency -------------------------------------------------
// The mobile menu toggle is a <summary>, and the store buttons are disabled
// placeholders. Neither is a call to action, so neither counts toward the set
// of verbs the reader is actually being asked to act on.
const ctaLabels = PAGES.flatMap((name) =>
  [...pageHtml[name].matchAll(/<a class="btn[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim()),
);
check('cta intent', new Set(ctaLabels).size <= 3, `labels: ${[...new Set(ctaLabels)].join(' | ')}`);

// --- dead links -------------------------------------------------------------
const allPages = [...PAGES, ...GENERATED];
const dead = [];
let linkCount = 0;
for (const name of allPages) {
  for (const [, href] of pageHtml[name].matchAll(/href="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/.test(href)) continue;
    const target = href.split('#')[0];
    if (target === '') continue;
    linkCount += 1;
    if (!fs.existsSync(path.join(ROOT, 'site', target.replace(/^\.\//, '')))) dead.push(`${name} -> ${href}`);
  }
}
check('no dead links', dead.length === 0, dead.length ? dead.join(', ') : `${linkCount} local link(s) across ${allPages.length} pages, all resolve`);

// --- every page carries the same shell --------------------------------------
const shellProblems = allPages.filter((name) => {
  const src = pageHtml[name];
  return !src.includes('class="nav__menu"') || !src.includes('class="foot__inner"') || !src.includes('./styles.css');
});
check('shared shell', shellProblems.length === 0,
  shellProblems.length ? `missing nav/footer/styles on: ${shellProblems.join(', ')}` : `nav, footer and stylesheet on all ${allPages.length} pages`);

// --- search plumbing --------------------------------------------------------
// Five gates over the generated SEO. tools/build-seo.mjs writes sitemap.xml,
// robots.txt and each page's canonical/OG/JSON-LD block, and these check the
// result rather than trusting the writer.
//
// The interesting one is 52. Structured data is where a marketing site most
// easily starts asserting things that are not true, because it is machine
// shaped and nobody reads it before shipping. A rating block, a price, or a
// Play Store URL are all trivially plausible and all currently false: there is
// no store listing, so there is nothing to quote a price from and nothing to
// have been reviewed. So those fields are forbidden outright, and the gate is
// coupled to the same evidence the rest of the site is: app.json. When a store
// listing and a real price exist, the gate is deleted in the same commit that
// adds them, and the reviewer sees that deletion.
const ORIGIN = 'https://example.invalid';
const sitemap = read('site/sitemap.xml');
const robots = read('site/robots.txt');
const allFiles = [...PAGES, ...GENERATED].map((n) => `${n}.html`);

// Every page in the site is in the sitemap, and the sitemap names nothing that
// does not exist. Both directions, because a sitemap that quietly falls behind
// is how pages stop being found.
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const locPaths = locs.map((u) => u.replace(ORIGIN, '') || '/');
const missingFromSitemap = allFiles.filter((f) => {
  const p = f === 'index.html' ? '/' : `/${f}`;
  return !locPaths.includes(p);
});
const phantomInSitemap = locPaths.filter((p) => p !== '/' && !allFiles.includes(p.replace(/^\//, '')));
check('sitemap covers every page', missingFromSitemap.length === 0 && phantomInSitemap.length === 0,
  missingFromSitemap.length || phantomInSitemap.length
    ? `missing: ${missingFromSitemap.join(', ') || 'none'}; phantom: ${phantomInSitemap.join(', ') || 'none'}`
    : `${locs.length} URL(s), all resolve to a real page, no page left out`);

// Absolute https URLs only. A relative or protocol-less loc is a parse error to
// a crawler, and it fails silently, which is the worst kind.
const badLocs = locs.filter((u) => !u.startsWith(ORIGIN + '/'));
const hasXmlns = /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap);
check('sitemap well formed', badLocs.length === 0 && hasXmlns && /<urlset[\s>]/.test(sitemap),
  badLocs.length ? `not absolute under ${ORIGIN}: ${badLocs.join(', ')}` : hasXmlns ? 'urlset with namespace, every loc absolute' : 'missing sitemap namespace');

check('robots points at the sitemap', robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
  robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`) ? `Sitemap: ${ORIGIN}/sitemap.xml` : 'no Sitemap: line matching the origin');

// One canonical per page, pointing at that page, and it must agree with the
// sitemap. A canonical that disagrees with the sitemap tells a crawler the two
// sources contradict each other, and it will believe whichever it read first.
const canonProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  const canons = [...src.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
  if (canons.length !== 1) { canonProblems.push(`${f}: ${canons.length} canonical link(s)`); continue; }
  const p = f === 'index.html' ? '/' : `/${f}`;
  if (canons[0] !== ORIGIN + p) canonProblems.push(`${f}: ${canons[0]}`);
}
check('canonical per page', canonProblems.length === 0,
  canonProblems.length ? canonProblems.join('; ') : `one canonical per page, all agreeing with the sitemap`);

// The JSON-LD has to parse, and it has to be SoftwareApplication on every page.
const ldProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  const blocks = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (blocks.length !== 1) { ldProblems.push(`${f}: ${blocks.length} ld+json block(s)`); continue; }
  try {
    const data = JSON.parse(blocks[0]);
    if (data['@type'] !== 'SoftwareApplication') ldProblems.push(`${f}: @type is ${data['@type']}`);
    if (data['@context'] !== 'https://schema.org') ldProblems.push(`${f}: bad @context`);
  } catch (err) {
    ldProblems.push(`${f}: does not parse (${err.message})`);
  }
}
check('json-ld valid', ldProblems.length === 0,
  ldProblems.length ? ldProblems.join('; ') : `SoftwareApplication parses on all ${allFiles.length} pages`);

// The fabrication gate. See the note above: these fields are all false today
// and are the standard way a site lies to a crawler.
const ldAll = allFiles.map((f) => read(`site/${f}`)).join('\n');
const ldJson = [...ldAll.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const FORBIDDEN_LD = [
  ['aggregateRating', /"aggregateRating"/],
  ['review', /"review"\s*:/],
  ['ratingValue', /"ratingValue"/],
  ['price', /"price"\s*:/],
  ['store url', /apps\.apple\.com|play\.google\.com/],
  ['downloadUrl', /"downloadUrl"\s*:/],
];
const ldFabrications = FORBIDDEN_LD.filter(([, re]) => re.test(ldJson)).map(([name]) => name);
// The store buttons on the page are disabled placeholders, so a store URL in
// the page body would be a claim too. Only the JSON-LD is scanned here because
// the visible copy already passes the cta intent gate.
check('no fabricated structured data', ldFabrications.length === 0,
  ldFabrications.length
    ? `asserts ${ldFabrications.join(', ')}, but app.json has no store listing to source them from`
    : 'no price, rating, review or store URL: nothing asserted that a store listing cannot back');

// Exactly one og:image per page, and it has to be absolute. Two tags is worse
// than one: a scraper reads the first og:image it finds, so a hand-written
// relative ./assets/icon.png sitting above the generated absolute URL wins, and
// the one that actually resolves is the one that gets ignored. This is the
// exact bug the generator had to be fixed for, so it is gated.
const ogProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  const ogs = [...src.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map((m) => m[1]);
  if (ogs.length !== 1) { ogProblems.push(`${f}: ${ogs.length} og:image tag(s)`); continue; }
  if (!ogs[0].startsWith(ORIGIN + '/')) ogProblems.push(`${f}: ${ogs[0]}`);
}
check('og:image absolute and singular', ogProblems.length === 0,
  ogProblems.length ? ogProblems.join('; ') : `one absolute og:image per page, all under ${ORIGIN}`);

// 4. Every page can reach the toggle, and the no-flash script is in every head.
//    A toggle on four of five pages is a support ticket.
const toggleProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  if (!/data-theme-toggle/.test(src)) toggleProblems.push(`${f}: no toggle button`);
  if (!/localStorage\.getItem\('deeper-theme'\)/.test(src)) toggleProblems.push(`${f}: no no-flash bootstrap`);
  // The no-flash script must come before the stylesheet link, or the page paints
  // in the default scheme first and the whole point is lost. The generated
  // policy page writes that link self-closing, so the probe must accept both
  // spellings or it will only ever check the hand-written pages.
  const bootIdx = src.indexOf("localStorage.getItem('deeper-theme')");
  const cssMatch = /<link rel="stylesheet" href="\.\/styles\.css"\s*\/?>/.exec(src);
  const cssIdx = cssMatch ? cssMatch.index : -1;
  if (bootIdx !== -1 && cssIdx !== -1 && bootIdx > cssIdx) toggleProblems.push(`${f}: theme bootstrap runs after the stylesheet`);
}
check('theme toggle on every page', toggleProblems.length === 0,
  toggleProblems.length ? toggleProblems.join('; ') : `button + no-flash bootstrap on all ${allFiles.length} pages, bootstrap ahead of the stylesheet`);

// Exactly one behaviour script and exactly one of each button instance per page.
//
// This gate exists because of a bug it would have caught immediately. The
// generator originally guarded its script with "if this exact text is not already
// on the page". Editing the script changed that text, so the next run no longer
// matched what it had written before and appended a second copy, then a third.
// The page ended up with three sets of click listeners and a theme state that
// depended on which one ran last. A generator that appends by content match is
// not idempotent, and nothing about the rendered page says so.
const dupeProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  const count = (re) => [...src.matchAll(re)].length;
  const behaviour = count(/<!-- theme-toggle:behaviour -->/g);
  const bar = count(/theme-toggle--bar/g);
  const menu = count(/theme-toggle--menu/g);
  if (behaviour !== 1) dupeProblems.push(`${f}: ${behaviour} behaviour script(s)`);
  if (bar !== 1) dupeProblems.push(`${f}: ${bar} bar button(s)`);
  if (menu !== 1) dupeProblems.push(`${f}: ${menu} menu button(s)`);
  // And only one of the two may be reachable at a time, which is a CSS concern
  // the browser check covers; here it is enough that both exist and the styles
  // switch between them.
  if (!/theme-toggle--bar \{ display: none/.test(cssNoComments)) dupeProblems.push(`${f}: no width-based switch between the two instances`);
}
check('one toggle per page, no duplicates', dupeProblems.length === 0,
  dupeProblems.length ? dupeProblems.join('; ') : 'exactly one behaviour script and one of each button instance per page, switched by width');

// The share images must exist, be the size every scraper crops to, and be a
// real PNG rather than an HTML error page saved with a .png name. Each page must
// point at its OWN card: a page whose og:image is another page's card unfurls
// with the wrong heading, which is worse than having no image at all because it
// looks correct in every preview that does not open the link.
const ogImageProblems = [];
for (const f of allFiles) {
  const src = read(`site/${f}`);
  const slug = f.replace(/\.html$/, '');
  const expected = `/assets/og/${slug}.png`;
  const m = /<meta property="og:image" content="([^"]+)"/.exec(src);
  if (!m) { ogImageProblems.push(`${f}: no og:image`); continue; }
  if (!m[1].endsWith(expected)) { ogImageProblems.push(`${f}: points at ${m[1]}, expected ...${expected}`); continue; }
  const rel = `site/assets/og/${slug}.png`;
  if (!fs.existsSync(path.join(ROOT, rel))) { ogImageProblems.push(`${f}: ${rel} does not exist`); continue; }
  const buf = fs.readFileSync(path.join(ROOT, rel));
  // PNG magic, then the real dimensions out of the IHDR. A file that is not a
  // PNG passes a size check and fails in every scraper.
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) { ogImageProblems.push(`${f}: ${rel} is not a PNG`); continue; }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== 1200 || h !== 630) ogImageProblems.push(`${f}: ${rel} is ${w}x${h}, expected 1200x630`);
  // Declared dimensions must match the file, or a scraper reserves the wrong box.
  const dw = /<meta property="og:image:width" content="(\d+)"/.exec(src);
  const dh = /<meta property="og:image:height" content="(\d+)"/.exec(src);
  if (!dw || !dh) ogImageProblems.push(`${f}: og:image:width/height not declared`);
  else if (Number(dw[1]) !== w || Number(dh[1]) !== h) ogImageProblems.push(`${f}: declared ${dw[1]}x${dh[1]} but file is ${w}x${h}`);
  // summary (not summary_large_image) throws away a 1200x630 composition.
  if (!/<meta name="twitter:card" content="summary_large_image">/.test(src)) ogImageProblems.push(`${f}: twitter:card is not summary_large_image`);
}
check('per-page share images', ogImageProblems.length === 0,
  ogImageProblems.length
    ? ogImageProblems.join('; ')
    : 'one 1200x630 PNG per page, each pointing at its own card, declared dimensions match');

// A card larger than about 5MB is rejected or transcoded by several scrapers,
// and these are flat-colour images that compress hard. A sudden jump means the
// grain or the glow stopped being applied.
const ogSizes = allFiles.map((f) => {
  const p = path.join(ROOT, `site/assets/og/${f.replace(/\.html$/, '')}.png`);
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
});
const biggest = Math.max(...ogSizes);
check('share image weight', biggest > 0 && biggest < 5 * 1024 * 1024,
  biggest === 0 ? 'no share images on disk' : `largest is ${Math.round(biggest / 1024)} KiB, under the 5 MB scraper ceiling`);

// --- no web-client claim unless there is a web client -----------------------
// This gate exists because the site once claimed guests could "play in their
// browser" and "install nothing to join". Both were false: the invite is a
// deeper:// custom-scheme link, which only resolves where the app is already
// installed, and the join flow runs over a live socket.
//
// The 46 honest-copy gate could not catch it, because that gate looks for
// invented *metrics* and this was an invented *capability*. So this one is
// coupled to the build config rather than to a phrase list: if a web target is
// ever added to app.json the claim becomes true and the gate relaxes by itself.
// If someone adds the claim without the target, CI fails.
const hasWebTarget = /"web"\s*:/.test(read('app.json'));
const WEB_CLAIMS = [
  /play in (?:their |your |a )?browser/i,
  /in (?:their|your|a) phone'?s browser/i,
  /without installing/i,
  /installs? nothing to join/i,
  /no install/i,
  /\b0\s*installs\b/i,
];
// A <summary> is the question, not the claim. 'Can guests play without
// installing the app?' is the honest way to raise it; only the answer asserts
// anything, so summary text is removed before scanning.
const claimText = Object.fromEntries(
  PAGES.map((name) => [name, pageHtml[name].replace(/<summary[\s\S]*?<\/summary>/g, ' ').replace(/<[^>]+>/g, ' ')]),
);
const webClaims = PAGES.filter((name) => WEB_CLAIMS.some((re) => re.test(claimText[name])));
check('no web-client claim', hasWebTarget || webClaims.length === 0,
  hasWebTarget
    ? 'app.json has a web target, so a browser claim is allowed'
    : webClaims.length
      ? `claims a browser client, but app.json has no web target: ${webClaims.join(', ')}`
      : 'no claim of playing without the app, and app.json has no web target');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? '  pass' : '  FAIL'}  [${r.id}] ${r.detail}`);
}
console.log(`\n${results.length - failed} / ${results.length} static gates pass`);
process.exit(failed > 0 ? 1 : 0);
