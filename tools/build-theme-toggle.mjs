/**
 * The light/dark toggle, injected into all five pages.
 *
 * Generated rather than pasted, for the same reason the SEO head block is: five
 * hand-maintained copies of a control with a script and two icon states is five
 * chances to have one page that behaves differently, and a nav is the last place
 * to discover that. This writes the button, the behaviour, and the styles between
 * markers, so `node tools/build-theme-toggle.mjs` restores every page to the same
 * control and the audit can insist all five carry it.
 *
 * THE CONTROL. One button that toggles, rather than a two- or three-way switch.
 * A switch implies a persistent state the reader sets and can see; here the
 * useful state is "the opposite of what I am looking at", which is a button. The
 * accessible name states the ACTION ("Switch to light theme") and updates, so a
 * screen reader user is told what will happen rather than only what is true.
 *
 * NO JAVASCRIPT. The page is a static bundle and must not break without a
 * script. Without JS the button is hidden by a rule that is removed only once
 * the behaviour script has run, so a reader is never offered a control that
 * does nothing. Light mode itself does not need JS at all: prefers-color-scheme
 * covers it, and only the manual override needs the script.
 *
 * The icons are authored SVG in the same 24x24 / 1.5 stroke / currentColor
 * idiom as the deck marks, for the reason the deck marks were redrawn: a Unicode
 * glyph as an icon renders differently per platform and per font.
 *
 * Run: node tools/build-theme-toggle.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'how-to-play.html', 'decks.html', 'faq.html', 'privacy-policy.html'];

const MARK = 'theme-toggle';

/** The button. Both icons are in the DOM; CSS shows one per scheme. */
const button = (extraClass, withText) => `<button class="theme-toggle${extraClass ? ' ' + extraClass : ''}" type="button" data-theme-toggle aria-label="Switch to light theme" title="Switch to light theme">
  <svg class="theme-toggle__icon theme-toggle__icon--sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
  </svg>
  <svg class="theme-toggle__icon theme-toggle__icon--moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
  </svg>${withText ? '\n  <span class="theme-toggle__text" aria-hidden="true">Theme</span>' : ''}
</button>`;

/**
 * TWO instances, not one, and this is forced by the layout rather than chosen.
 *
 * Measured at a 375px viewport (332px of content): the brand is 75px, the "Get
 * the app" button 127px and the Menu disclosure 88px, which is 314px of a 332px
 * row. A 44px control plus its 12px gap needs 56px more, and there is no 56px.
 * The only options were to shorten the primary call to action, which is a
 * content change made for a layout reason, or to put the control somewhere the
 * nav has room.
 *
 * So the control lives in the top bar on desktop, where there is room, and
 * inside the menu disclosure on small screens, which is where a phone puts a
 * settings control. CSS shows exactly one at any width; the script drives both,
 * so there is one behaviour and one piece of state, not two controls that can
 * disagree about which theme is active.
 */
const BUTTON_BAR = `<!-- ${MARK} -->\n${button('theme-toggle--bar', false)}\n<!-- /${MARK} -->`;
const BUTTON_MENU = `<!-- ${MARK}:menu -->\n${button('theme-toggle--menu', true)}\n<!-- /${MARK}:menu -->`;

/* The wordmark, wrapped so the smallest screens can drop it. See the note in the
   page loop: it is a bare text node in the markup, and a responsive rule cannot
   target a text node without collapsing the link that contains it. */
const SCRIPT = `<!-- ${MARK}:behaviour -->\n<script>
/* Applies a stored theme choice before first paint, and wires the toggle.
   Generated: see tools/build-theme-toggle.mjs */
(function () {
  var KEY = 'deeper-theme';
  var root = document.documentElement;
  /* Both instances, not one. The bar copy is shown on desktop and the menu copy
     on small screens, where the nav row has no room for a third control. One
     behaviour drives both, so the two can never disagree about the theme. */
  var btns = document.querySelectorAll('[data-theme-toggle]');

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  /* What is actually on screen right now, which is not always the stored
     choice: with nothing stored, the system preference decides, and this has to
     be read live so it stays correct if the OS flips at sunset. */
  function isLight() {
    var t = stored();
    if (t === 'light' || t === 'dark') return t === 'light';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function paint() {
    var light = isLight();
    /* The label states the action, not the state. "Switch to dark theme" is
       useful before the press; "Dark theme" is only useful after it. */
    var label = light ? 'Switch to dark theme' : 'Switch to light theme';
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', label);
      btns[i].setAttribute('title', label);
    }
    root.style.colorScheme = light ? 'light' : 'dark';
  }

  if (btns.length) {
    /* Now that the control works, let it be seen. The hiding rule is scoped to
       html:not([data-theme-ready]) so it only applies pre-script. */
    root.setAttribute('data-theme-ready', '');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        var next = isLight() ? 'dark' : 'light';
        try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still flips for this page */ }
        /* Written as an attribute rather than a class so the CSS in tokens.css can
           key off it, and so the same attribute the no-flash script sets is the
           single source of truth for which scheme is active. */
        root.setAttribute('data-theme', next);
        paint();
      });
    }
  }

  /* Follow the system while the reader has expressed no preference. Once they
     have chosen, their choice stands and this listener is a no-op. */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { if (!stored()) paint(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  paint();
})();
</script>\n<!-- /${MARK}:behaviour -->`;

const STYLE = `/* ${MARK} ------------------------------------------------------------------
 * One button, two states. The sun is the target when the page is dark (press it
 * to get light) and the moon is the target when the page is light, so the icon
 * always shows what the press will do rather than what is currently true.
 *
 * The rule above is what makes this safe without JavaScript: the control is
 * hidden until the script sets data-theme-ready on the root, so a reader is
 * never shown a button that does nothing. Light mode itself does not depend on
 * the script at all.
 *
 * min-height is 44px, not 40: this is a small target at the top of a page, and
 * the site audit holds every control to the same floor. */
html:not([data-theme-ready]) .theme-toggle { display: none; }

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: var(--color-paper-raised);
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: color var(--dur-short) var(--ease-out),
              border-color var(--dur-short) var(--ease-out),
              background-color var(--dur-short) var(--ease-out);
}

/* One control, two homes, and exactly one visible at any width. See the note on
   BUTTON_BAR in tools/build-theme-toggle.mjs for the measurement that forces
   this: at 375px the nav row is already 314px of a 332px viewport before the
   control is added.

   The text label lives in the markup on the menu instance only. It was
   originally a CSS ::after reading attr(data-label), and the attribute was never
   set, so the row rendered as a bare 22px icon with no label at all. Real text
   in the DOM is also what a screen reader gets before the script has run. */
.theme-toggle--menu,
.theme-toggle__text { display: none; }

@media (max-width: 40rem) {
  .theme-toggle--bar { display: none; }
  .theme-toggle--menu {
    display: inline-flex;
    /* Inside the disclosure it is a full-width row, not a 44px square, so it
       matches the menu's own links rather than floating in a corner. */
    width: 100%;
    justify-content: flex-start;
    gap: var(--space-2xs);
    background: transparent;
    border-color: transparent;
  }
  .theme-toggle--menu .theme-toggle__text {
    display: inline;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--color-ink);
  }
}

.theme-toggle:hover {
  color: var(--color-ink);
  border-color: var(--color-rule-strong);
  background: var(--color-paper-card);
}

.theme-toggle:active {
  background: var(--color-paper-sunk);
}

.theme-toggle__icon {
  width: 20px;
  height: 20px;
  flex: none;
}

/* Which icon is showing is decided by the same two conditions the tokens use:
   the system preference, and an explicit attribute that overrides it. */
.theme-toggle__icon--sun { display: block; }
.theme-toggle__icon--moon { display: none; }

@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) .theme-toggle__icon--sun { display: none; }
  :root:not([data-theme='dark']) .theme-toggle__icon--moon { display: block; }
}

:root[data-theme='light'] .theme-toggle__icon--sun { display: none; }
:root[data-theme='light'] .theme-toggle__icon--moon { display: block; }`;

/**
 * Indent every line of `block` by `pad`. The caller supplies the anchor line's
 * own leading whitespace, so a block lands at the indentation of the thing it
 * sits next to rather than at a hard-coded guess.
 */
const indented = (block, pad) => pad + block.split('\n').join('\n' + pad);

/**
 * Insert a block on its own line(s) immediately before `at`, reusing the
 * indentation already on that line.
 *
 * Idempotence lives here. The first version stripped only the marker's own
 * characters, which left the whitespace that preceded it on the line, and then
 * re-inserted behind that leftover. Every run therefore re-indented the markers
 * two spaces further right: the pages still rendered, the audit still passed,
 * and the drift was invisible until you diffed two builds. The rule is that a
 * block and the whitespace on its line are one unit, and `strip` below takes
 * both.
 */
const insertBlock = (html, at, block, rel) => {
  const lineStart = html.lastIndexOf('\n', at - 1) + 1;
  const lead = html.slice(lineStart, at);
  if (!/^[ \t]*$/.test(lead)) {
    throw new Error(`${rel}: insertion point is mid-line (${JSON.stringify(lead)})`);
  }
  return html.slice(0, lineStart) + indented(block, lead) + '\n' + html.slice(lineStart);
};

/** Remove a marker pair and the whole line each end of it sits on. */
const stripBlock = (html, mark, rel) => {
  const b = `<!-- ${mark} -->`;
  const e = `<!-- /${mark} -->`;
  const from = html.indexOf(b);
  if (from === -1) return html;
  const to = html.indexOf(e);
  if (to === -1) throw new Error(`${rel}: found ${b} with no closing marker`);
  const lineStart = html.lastIndexOf('\n', from) + 1;
  const tail = html.indexOf('\n', to);
  return html.slice(0, lineStart) + html.slice(tail === -1 ? html.length : tail + 1);
};

let touched = 0;
for (const page of PAGES) {
  const rel = `site/${page}`;
  let html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // The desktop instance goes in the nav row, after the primary call to action.
  // Both button blocks are also removed and re-inserted, for the same reason the
  // behaviour script is: a content check cannot survive an edit to the payload.
  html = stripBlock(html, `${MARK}`, rel);
  const navEnd = '</nav>';
  const navAt = html.indexOf(navEnd);
  if (navAt === -1) throw new Error(`${rel}: no ${navEnd}`);
  html = insertBlock(html, navAt, BUTTON_BAR, rel);

  html = stripBlock(html, `${MARK}:menu`, rel);
  const menuAt = html.indexOf('class="nav__menu"');
  if (menuAt === -1) throw new Error(`${rel}: no .nav__menu`);
  const menuClose = html.indexOf('</div>', menuAt);
  if (menuClose === -1) throw new Error(`${rel}: unterminated .nav__menu`);
  html = insertBlock(html, menuClose, BUTTON_MENU, rel);

  // Wrap the brand wordmark in an element.
  //
  // The nav row does not fit at 320px (measured: 362px of content in a 282px
  // viewport) and the wordmark is the one piece of it that can go, because the
  // 28px mark beside it is still a link home. But the wordmark is a bare text
  // node in the markup, and CSS cannot hide a text node without collapsing the
  // link that contains it, which would take the link home with it. Wrapping it
  // gives the responsive rule something to target and leaves the accessible name
  // intact.
  if (!html.includes('brand__name')) {
    // The pattern runs over the WHOLE anchor, opening tag included. Two earlier
    // versions got this wrong in instructive ways: one matched only the inner
    // content, so the `</a>` it anchors on was not in the subject; the next
    // captured the opening tag separately and then tried to match it again at the
    // start of a string that began with a newline. Matching the whole element
    // once, with no separate groups to disagree about, is the version that works.
    const brand = /<a class="brand"[^>]*>[\s\S]*?<\/a>/.exec(html);
    if (!brand) throw new Error(`${rel}: no .brand anchor to wrap`);
    const inner = brand[0].replace(
      /(<img[^>]*>)\s*([A-Za-z][A-Za-z0-9 .&'-]*?)\s*(<\/a>)/,
      (m, img, word, close) => `${img}\n      <span class="brand__name">${word.trim()}</span>\n    ${close}`,
    );
    if (inner === brand[0]) throw new Error(`${rel}: could not find the brand wordmark text node`);
    html = html.slice(0, brand.index) + inner + html.slice(brand.index + brand[0].length);
  }

  // The behaviour goes at the end of the body, so the no-flash inline script in
  // the head has already set the attribute and this only wires up the control.
  //
  // Removed and re-inserted on every run, NEVER appended when absent. The first
  // version guarded with `if (html.indexOf(SCRIPT) === -1)`, comparing against
  // the script text itself, and that quietly accumulated three copies: editing
  // the script changed the string, so the next run no longer matched the text it
  // had written before and appended a second copy, and then a third. Three
  // copies meant three sets of listeners, and the page's theme state depended on
  // which one ran last. Matching on the MARKER rather than the payload is what
  // makes the edit-safe.
  html = stripBlock(html, `${MARK}:behaviour`, rel);
  const bodyAt = html.lastIndexOf('</body>');
  if (bodyAt === -1) throw new Error(`${rel}: no </body>`);
  html = insertBlock(html, bodyAt, SCRIPT, rel);

  // The styles are appended to the end of the marker block in styles.css.
  fs.writeFileSync(path.join(ROOT, rel), html);
  touched += 1;
}

// --- stylesheet -------------------------------------------------------------
const cssPath = path.join(ROOT, 'site/styles.css');
let css = fs.readFileSync(cssPath, 'utf8');
const styleBegin = `/* ${MARK} ---`;
const styleIdx = css.indexOf(styleBegin);
if (styleIdx === -1) {
  css = css.trimEnd() + '\n\n' + STYLE + '\n';
} else {
  // Replace to the end of the file: the block is written last on purpose, so it
  // can rely on source order for the icon visibility rules.
  css = css.slice(0, styleIdx).trimEnd() + '\n\n' + STYLE + '\n';
}
fs.writeFileSync(cssPath, css);

console.log(`theme toggle  ${touched} page(s): button, behaviour script, styles`);
console.log(`storage key   deeper-theme  (values: light | dark; absent means follow the system)`);
