/**
 * Search plumbing for the static documentation site.
 *
 * Three things are generated here, all from one table, so they cannot drift
 * apart:
 *
 *   - og:site_name, twitter:* and the SoftwareSourceCode JSON-LD block,
 *     injected into every page head between markers, so re-running is
 *     idempotent. canonical, og:url and absolute URL fields are emitted only
 *     when SITE_ORIGIN is set; see below.
 *   - sitemap.xml
 *   - robots.txt
 *
 * WHAT IS DELIBERATELY ABSENT, and why. This site is built on the rule that no
 * page may claim something the repository does not contain, and the audit
 * enforces it (gates 46 honest copy, no launch-era claims, no web-client claim).
 * Structured data is the easiest place to smuggle a lie past a human reviewer,
 * because it is machine-shaped and nobody reads it, so every field below has to
 * be traceable:
 *
 *   - No canonical, og:url, sitemap <loc> or robots Sitemap directive in the
 *     committed build. There is no deployed origin; asserting one would describe
 *     a site that does not exist. A deployer opts in with SITE_ORIGIN.
 *   - No applicationCategory, operatingSystem, offers, availability, price or
 *     downloadUrl. Those describe a shipped app in a store. DEEPER was never
 *     launched, has no store listing and has nothing to download.
 *   - No aggregateRating or review. Nothing has been reviewed anywhere.
 *   - The @type is SoftwareSourceCode, not SoftwareApplication. What is being
 *     published is a repository, so codeRepository and license are the honest
 *     identifying fields and the audit now requires both.
 *   - No featureList entry that the README, the source or the decks page do not
 *     already state.
 *
 * Adding a page means adding a row to PAGES and re-running. In deploy mode the
 * audit fails if a page is missing from the sitemap, so the table cannot quietly
 * fall behind.
 *
 * Run: node tools/build-seo.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => {
  fs.writeFileSync(path.join(ROOT, p), s);
  return s.length;
};

/**
 * The deployment origin, and there deliberately is not one in the committed
 * build. DEEPER has no site, no domain and no hosting: these five HTML files are
 * source documentation. Emitting canonical tags, og:url, absolute share image
 * URLs or sitemap <loc> entries would assert a live origin that does not exist,
 * which is exactly the kind of claim the rest of this site refuses to make.
 *
 * A deployer supplies the origin at build time:
 *
 *   SITE_ORIGIN=https://your-host.example npm run site:build
 *
 * tools/audit-site.mjs reads the same variable, so the writer and the audit
 * cannot disagree about which mode the site was built in. When it is unset the
 * share images use page-relative paths, which resolve for a human reading the
 * file but are ignored by scrapers until a real origin is configured.
 */
const SITE_ORIGIN = (process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
/** Where the source actually lives. Used by the JSON-LD, never by a CTA. */
const REPO = 'https://github.com/thesaveddev/deeper';

const app = JSON.parse(read('app.json')).expo;

/**
 * The pages, in sitemap priority order.
 *
 * lastmod is a real date, not a build stamp. A sitemap whose lastmod changes on
 * every deploy tells crawlers every page changed every deploy, which is a lie
 * they can measure, and it trains them to ignore the field. These are the dates
 * the content actually last changed.
 *
 * changefreq is yearly across the board. The project is closed and explicitly
 * unmaintained; promising weekly or monthly updates to a crawler would be the
 * same kind of quiet fiction the rest of the site refuses to make.
 */
const RELEASED = '2026-11-09';
const PAGES = [
  {
    file: 'index.html',
    loc: '/',
    lastmod: RELEASED,
    changefreq: 'yearly',
    priority: '1.0',
    name: 'DEEPER. Better questions. Better conversations.',
    description:
      'An open source, never-launched multiplayer conversation game. Expo and React Native client, an authoritative Socket.IO server, Postgres and Redis. Released under MIT with a written postmortem.',
    imageAlt: 'DEEPER. Better questions. Better conversations.',
  },
  {
    file: 'how-to-play.html',
    loc: '/how-to-play.html',
    lastmod: RELEASED,
    changefreq: 'yearly',
    priority: '0.8',
    name: 'How to play — DEEPER',
    description:
      'The whole DEEPER loop in six steps: create a room, share the code, answer in private, reveal together, react, repeat. Both game modes, every rule the code enforces, and what happens when a connection drops.',
    imageAlt: 'How to play: four steps, then you are deeper than you were.',
  },
  {
    file: 'decks.html',
    loc: '/decks.html',
    lastmod: RELEASED,
    changefreq: 'yearly',
    priority: '0.8',
    name: 'The eight decks — DEEPER',
    description:
      'All eight DEEPER decks with real sample questions: 20 hand-written prompts each, expanded into 100 IDs by five suffix variants. All of it in the repository.',
    imageAlt: 'The catalogue: eight decks, and every base prompt written out.',
  },
  {
    file: 'faq.html',
    loc: '/faq.html',
    lastmod: RELEASED,
    changefreq: 'yearly',
    priority: '0.6',
    name: 'Questions — DEEPER',
    description:
      'Straight answers about DEEPER: why it was never launched, what the code does, what it stores, and what you can do with the source.',
    imageAlt: 'Straight answers: why it stopped, and what the code does.',
  },
  {
    file: 'privacy-policy.html',
    loc: '/privacy-policy.html',
    lastmod: RELEASED,
    changefreq: 'yearly',
    priority: '0.3',
    name: 'Data handling: DEEPER',
    description:
      'What the DEEPER code stores, for how long, and why. No service is operated; this describes a self-hosted deployment.',
    imageAlt: 'Data handling: what the code keeps, for how long, and why.',
  },
];

const MARKER = 'seo:head';

/**
 * The no-flash theme bootstrap, inlined into every head.
 *
 * A theme toggle that runs after the stylesheet paints a dark page and then
 * repaints it light, which is a white flash on a dark site and a dark flash on a
 * light one. The only fix is to set the attribute before the first paint, which
 * means an inline script in the head, ahead of the stylesheet's paint.
 *
 * It lives here, in the generator that already injects into all five heads,
 * rather than being pasted into five files where it would drift.
 *
 * Three things it deliberately does:
 *   - Wraps storage in try/catch. localStorage throws outright in Safari
 *     private browsing and wherever cookies are blocked, and an uncaught throw
 *     here would take the whole page down before it rendered.
 *   - Leaves the attribute unset when there is no stored choice, so
 *     prefers-color-scheme governs. Reading the system preference in script
 *     would hard-code today's answer into the page and freeze it.
 *   - Adds nothing to the DOM and no class, only one attribute, so there is no
 *     flash of unstyled content and no selector to keep in sync.
 */
const NO_FLASH = `<script>
/* Applies a stored theme choice before first paint. Generated: see tools/build-seo.mjs */
(function () {
  try {
    var t = localStorage.getItem('deeper-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall through to the system preference */ }
})();
</script>`;

/**
 * The SoftwareSourceCode block.
 *
 * DEEPER was never submitted to a store, so describing it as a
 * SoftwareApplication would assert an installable product that does not exist.
 * What is published is a repository under MIT, and codeRepository plus license
 * are the fields that identify it. softwareVersion is read from app.json rather
 * than typed here, so it cannot rot.
 *
 * Deliberately no offers block: there is no price, no availability and nothing
 * to buy. The audit rejects those fields outright now.
 */
function jsonLd(page) {
  const slug = page.file.replace(/\.html$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'DEEPER',
    alternateName: 'DEEPER. Better questions. Better conversations.',
    ...(SITE_ORIGIN ? { url: SITE_ORIGIN + page.loc } : {}),
    description: page.description,
    codeRepository: REPO,
    license: `${REPO}/blob/main/LICENSE`,
    programmingLanguage: ['TypeScript', 'JavaScript'],
    runtimePlatform: 'Expo / React Native, Node.js',
    softwareVersion: app.version,
    inLanguage: 'en',
    ...(SITE_ORIGIN ? { image: `${SITE_ORIGIN}/assets/og/${slug}.png` } : {}),
    isAccessibleForFree: true,
  };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The block injected into each head. The markers are HTML comments, so the audit
 * can see them, and they are also the replacement boundary, which makes repeated
 * runs idempotent.
 */
function headBlock(page) {
  const slug = page.file.replace(/\.html$/, '');
  // One share image per page, 1200x630, generated by tools/build-og-images.mjs.
  // The bare app icon was a 1024 square of a letter mark: no context about which
  // page was shared, and the wrong shape for the card every scraper crops to.
  // The file name is derived from the page's own source file, so a page cannot
  // point at another page's card. Absolute only when a real origin is deployed;
  // otherwise page-relative, which is honest and resolves for a local reader.
  const image = SITE_ORIGIN
    ? `${SITE_ORIGIN}/assets/og/${slug}.png`
    : `./assets/og/${slug}.png`;
  // A canonical and an og:url are claims about where a live page lives. With no
  // origin there is no such page, so both are omitted rather than pointed at a
  // placeholder host. The comment keeps the omission legible in the source.
  const originTags = SITE_ORIGIN
    ? [
        `<link rel="canonical" href="${SITE_ORIGIN + page.loc}">`,
        `<meta property="og:url" content="${SITE_ORIGIN + page.loc}">`,
      ]
    : ['<!-- No canonical or og:url: no deployment origin is configured. Set SITE_ORIGIN when deploying. -->'];
  return [
    `<!-- ${MARKER} — generated by tools/build-seo.mjs, do not edit by hand -->`,
    ...originTags,
    `<meta property="og:site_name" content="DEEPER">`,
    // Width and height are declared because a scraper that fetches the image
    // and gets no dimensions reserves no space for it and the card arrives after
    // the text has already been laid out.
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(page.imageAlt)}">`,
    // summary_large_image, not summary: the card is 1200x630 and is meant to be
    // shown large. summary renders it as a small square thumbnail and throws the
    // composition away.
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(page.name)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${esc(page.imageAlt)}">`,
    `<script type="application/ld+json">`,
    JSON.stringify(jsonLd(page), null, 2),
    `</script>`,
    `<!-- /${MARKER} -->`,
    '',
  ].join('\n');
}

let injected = 0;
for (const page of PAGES) {
  const rel = `site/${page.file}`;
  let html = read(rel);
  const block = headBlock(page);
  // Exact markers, not the `<!-- seo:head` PREFIX. The no-flash block is marked
  // `<!-- seo:head:no-flash -->`, so a prefix match finds that one first and the
  // metadata replacement then swallows the bootstrap AND the stylesheet link
  // between them, which is how index.html ended up with no stylesheet at all.
  // The trailing space is what makes these unambiguous.
  const begin = `<!-- ${MARKER} `;
  const end = `<!-- /${MARKER} -->`;
  const from = html.indexOf(begin);
  if (from !== -1) {
    const to = html.indexOf(end);
    if (to === -1) throw new Error(`${rel}: found ${begin} with no closing marker`);
    html = html.slice(0, from) + block + html.slice(to + end.length + 1);
  } else {
    const close = html.indexOf('</head>');
    if (close === -1) throw new Error(`${rel}: no </head> to inject into`);
    html = html.slice(0, close) + block + html.slice(close);
  }

  // The no-flash bootstrap is placed SEPARATELY from the metadata block, and
  // unconditionally on every run, because it has a hard ordering requirement the
  // block does not: it must sit ahead of the stylesheet link so the chosen
  // scheme is set before the first paint. Keeping it inside the metadata block
  // meant it inherited that block's "inject once, then replace" lifecycle, and a
  // page that already had the block never received the script at all.
  //
  // The block is REMOVED and re-inserted every run, never updated in place. A
  // block that was placed wrongly once (behind the stylesheet, by an earlier
  // version of this file) would otherwise keep its wrong position forever,
  // because an in-place update preserves position by definition. The whole
  // value of this script is that it runs before the first paint, so its position
  // is not something to leave to chance.
  const nfBegin = `<!-- ${MARKER}:no-flash -->`;
  const nfEnd = `<!-- /${MARKER}:no-flash -->`;
  const nfWrapped = `${nfBegin}\n${NO_FLASH}\n${nfEnd}`;
  const nfFrom = html.indexOf(nfBegin);
  if (nfFrom !== -1) {
    const nfTo = html.indexOf(nfEnd);
    if (nfTo === -1) throw new Error(`${rel}: found ${nfBegin} with no closing marker`);
    // Take the block out, and the newline that followed it.
    html = html.slice(0, nfFrom) + html.slice(nfTo + nfEnd.length).replace(/^[ \t]*\r?\n/, '');
  }
  // Both spellings of the stylesheet link: the hand-written pages emit
  // `<link ...>` and the generated policy page emits `<link ... />`, and a regex
  // that only matched one of them silently placed the bootstrap at the end of
  // the head on the other, which is the flash this exists to prevent.
  const cssLink = /^[ \t]*<link rel="stylesheet" href="\.\/styles\.css"\s*\/?>[ \t]*\r?\n?/m.exec(html);
  if (cssLink) {
    const at = cssLink.index;
    html = html.slice(0, at) + nfWrapped + '\n' + html.slice(at);
  } else {
    const close = html.indexOf('</head>');
    if (close === -1) throw new Error(`${rel}: no </head> to inject into`);
    html = html.slice(0, close) + nfWrapped + '\n' + html.slice(close);
  }

  // The pages each carried a hand-written relative og:image from before this
  // generator existed. Leaving it in place put a second og:image above the
  // absolute one, and a scraper reads the first tag it finds, so the absolute
  // URL that actually resolves was being ignored. The generated block owns the
  // tag now, so any hand-written copy outside the block is removed rather than
  // left to shadow it.
  //
  // The block is located by its markers in the already-replaced string, and the
  // split is done with indexOf on that same string so the two halves cannot
  // disagree about where the block ends.
  const bStart = html.indexOf(begin);
  const bEnd = html.indexOf(end) + end.length;
  if (bStart === -1 || bEnd < bStart) throw new Error(`${rel}: injected block markers not found after write`);
  const before = html.slice(0, bStart);
  const generated = html.slice(bStart, bEnd);
  const after = html.slice(bEnd);
  const RELATIVE_OG = /^[ \t]*<meta property="og:image"[^>]*\.\/assets[^>]*>\r?\n?/gm;
  html = before.replace(RELATIVE_OG, '') + generated + after.replace(RELATIVE_OG, '');

  write(rel, html);
  injected++;
}

// --- sitemap ----------------------------------------------------------------

// An empty urlset is the honest output for a site with no deployment origin:
// there is no absolute URL that resolves to anything. The audit requires this
// exact shape, so nobody can "fix" it by inventing a placeholder host.
const today = PAGES.reduce((a, p) => (p.lastmod > a ? p.lastmod : a), '1970-01-01');
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generated by tools/build-seo.mjs. Edit PAGES there, not here. -->',
  ...(SITE_ORIGIN ? [] : [
    '<!-- No deployment origin is configured, so this build cannot emit absolute',
    '     URLs. Set SITE_ORIGIN and re-run site:build after deploying the site. -->',
  ]),
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...(SITE_ORIGIN
    ? PAGES.map(
        (p) =>
          `  <url>\n    <loc>${SITE_ORIGIN}${p.loc}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
      )
    : []),
  '</urlset>',
  '',
].join('\n');
const sitemapBytes = write('site/sitemap.xml', xml);

// --- robots -----------------------------------------------------------------

/**
 * Nothing is disallowed. These five pages are static documentation of a
 * repository, and there is no service, account area or user data here. The one
 * thing that must not be indexed is the preview scaffolding that lives next to
 * the site during design work. A Sitemap: directive is an absolute URL, so it is
 * emitted only in deploy mode.
 */
const robots = [
  '# Generated by tools/build-seo.mjs.',
  '#',
  '# Everything here is static documentation and is meant to be found.',
  '# No service runs here: no accounts, no dashboard, no user data.',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  '# Design-time preview files. Not content, and not linked from anywhere.',
  'Disallow: /_',
  'Disallow: /preview-',
  '',
  ...(SITE_ORIGIN
    ? [`Sitemap: ${SITE_ORIGIN}/sitemap.xml`, '']
    : [
        '# No Sitemap: line. A sitemap directive is an absolute URL, and there is',
        '# no deployed origin to point it at. Set SITE_ORIGIN when you deploy.',
        '',
      ]),
].join('\n');
const robotsBytes = write('site/robots.txt', robots);

console.log(`origin    ${SITE_ORIGIN || '(none - origin-free build; set SITE_ORIGIN when deploying)'}`);
console.log(`injected  ${injected} page head(s) (${PAGES.map((p) => p.file).join(', ')})`);
console.log(`sitemap   site/sitemap.xml (${sitemapBytes} bytes, newest lastmod ${today}, ${SITE_ORIGIN ? 'absolute URLs' : 'empty urlset'})`);
console.log(`robots    site/robots.txt (${robotsBytes} bytes, ${SITE_ORIGIN ? 'Sitemap directive' : 'no Sitemap directive'})`);
console.log('omitted   offers, price, availability, store URLs, aggregateRating, review: no store listing exists');
console.log('json-ld   SoftwareSourceCode, with codeRepository and license');
