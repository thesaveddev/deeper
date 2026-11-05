/**
 * Renders docs/privacy-policy.md into site/privacy-policy.html.
 *
 * The markdown is the single source of truth: the repo links it, the store
 * listing needs a hosted URL, and the site needs a page. Maintaining three
 * copies of a legal document is how they drift out of agreement with the code.
 *
 * This is a deliberately small markdown subset (headings, paragraphs, lists,
 * rules, bold, inline code, links). It is not a general converter and does not
 * try to be.
 *
 * Run: npm run site:policy
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'docs', 'privacy-policy.md');
const DEST = path.join(ROOT, 'site', 'privacy-policy.html');

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Inline formatting. Bold and code only.
 *
 * Note the deliberately absent em-dash rule: the policy text is the product's
 * own copy and is not rewritten to satisfy a page-level style constraint. The
 * ban applies to marketing copy written for the page, not to a legal document.
 */
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function render(markdown) {
  const lines = markdown.split('\n');
  const html = [];
  let listType = null;
  let inCode = false;
  let codeBuf = [];
  let tableRows = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (line === '') {
      closeList();
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeList();
      html.push('<hr />');
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      // The document's own H1 is the page title, which the shell now renders in
      // the page header. Drop it here, so the page keeps exactly one H1 and does
      // not repeat its own title immediately underneath it.
      if (level === 1) continue;
      const tag = `h${Math.min(level, 4)}`;
      html.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (listType !== want) {
        closeList();
        html.push(`<${want}>`);
        listType = want;
      }
      html.push(`<li>${inline((bullet ?? numbered)[1])}</li>`);
      continue;
    }

    // A table row. Rows are buffered until the table ends so the header row can
    // be emitted as <thead> rather than guessed at inline.
    if (line.startsWith('|')) {
      closeList();
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      tableRows.push(cells);
      continue;
    }
    if (tableRows.length > 0) {
      closeList();
      html.push(renderTable(tableRows));
      tableRows = [];
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (tableRows.length > 0) {
    html.push(renderTable(tableRows));
    tableRows = [];
  }
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return html.join('\n');
}

/** A pipe table becomes a real <table>: header row in <thead>, body in <tbody>. */
function renderTable(rows) {
  const [head, ...body] = rows;
  const out = ['<table>', '<thead><tr>'];
  for (const cell of head) out.push(`<th scope="col">${inline(cell)}</th>`);
  out.push('</tr></thead>', '<tbody>');
  for (const row of body) {
    out.push('<tr>');
    for (const cell of row) out.push(`<td>${inline(cell)}</td>`);
    out.push('</tr>');
  }
  out.push('</tbody>', '</table>');
  return out.join('');
}

const markdown = fs.readFileSync(SOURCE, 'utf8');
const body = render(markdown);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Privacy Policy: DEEPER</title>
<meta name="description" content="What DEEPER stores, what it never stores, and how long it keeps it." />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#0D0D12" />
<meta property="og:title" content="Privacy Policy: DEEPER" />
<meta property="og:description" content="What DEEPER stores, what it never stores, and how long it keeps it." />
<meta property="og:image" content="./assets/icon.png" />
<link rel="icon" href="./assets/favicon.png" sizes="48x48" />
<link rel="apple-touch-icon" href="./assets/icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
/>
<link rel="stylesheet" href="./styles.css" />
</head>
<body>

<header class="shell">
  <nav class="nav" aria-label="Primary">
    <a class="brand" href="./index.html">
      <img src="./assets/icon.png" alt="" width="28" height="28" />
      DEEPER
    </a>
    <div class="nav__links">
      <a href="./how-to-play.html">How to play</a>
      <a href="./decks.html">Decks</a>
      <a href="./faq.html">Questions</a>
      <a href="./privacy-policy.html" aria-current="page">Privacy</a>
    </div>
    <span class="nav__slot"></span>
    <a class="btn" href="./index.html#get-it">Get the app</a>
    <details class="nav__toggle">
      <summary class="btn btn--ghost" aria-label="Open menu">Menu</summary>
      <div class="nav__menu">
        <a href="./how-to-play.html">How to play</a>
        <a href="./decks.html">Decks</a>
        <a href="./faq.html">Questions</a>
        <a href="./privacy-policy.html">Privacy</a>
      </div>
    </details>
  </nav>
</header>

<main id="main">
  <section class="pagehead">
    <div class="glow glow--violet" aria-hidden="true"></div>
    <div class="shell pagehead__inner">
      <span class="eyebrow">Privacy</span>
      <h1>What DEEPER stores, what it never stores, and how long it keeps it.</h1>
      <p>Written to match the code in this repository, not to match what a policy usually says.</p>
    </div>
  </section>

  <article class="shell policy">
${body}
  </article>
</main>

<footer class="shell foot">
  <div class="foot__inner">
    <span class="foot__mark">DEEPER</span>
    <span class="foot__tag">Better questions. Better conversations.</span>
    <nav class="foot__links" aria-label="Footer">
      <a href="./how-to-play.html">How to play</a>
      <a href="./decks.html">Decks</a>
      <a href="./faq.html">Questions</a>
      <a href="./privacy-policy.html">Privacy</a>
    </nav>
    <p class="foot__legal">A game for people who would rather ask than guess. Made for iOS and Android.</p>
  </div>
</footer>

</body>
</html>
`;

fs.writeFileSync(DEST, page);
console.log(`Wrote ${path.relative(ROOT, DEST)} (${(page.length / 1024).toFixed(1)} KiB)`);
