/**
 * Per-page social share images.
 *
 * Every link to this site used to unfurl as the bare app icon, which is a 1024
 * square of a letter mark: no context, and the wrong shape for the card. A
 * preview is the first thing a reader sees when the link is shared in a chat or
 * a feed, so it has to say which page it is.
 *
 * 1200x630 is the size every major scraper expects and the one Facebook,
 * Slack, Discord and X all crop to without letterboxing.
 *
 * WHY A BROWSER DOES THE RENDERING. These cards are set in the real brand
 * faces (Bricolage Grotesque for display, Schibsted Grotesk for body) and
 * drawn from the real token block in site/tokens.css, so the type metrics, the
 * wrapping and the colour are the site's own rather than an approximation of
 * them. Rasterising text in Node means either shipping a font rasteriser and
 * reimplementing line breaking, or faking both. Chrome is already on the
 * machine, so the card is an HTML document and the browser is the renderer.
 *
 * It talks to Chrome over the DevTools protocol on a plain WebSocket. That is
 * deliberately not a puppeteer dependency: this project installs no browser
 * automation, and one HTTP upgrade plus a dozen CDP calls is the whole
 * requirement.
 *
 * The card is a data: URL, so the generator needs no temp server and cannot
 * race one. The fonts are linked from the same Google Fonts URL the pages use,
 * and rendering waits on document.fonts.ready, so a card is never captured
 * mid-swap in a fallback face.
 *
 * Run: node tools/build-og-images.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_DIR = path.join(ROOT, 'site', 'assets', 'og');

/** Where Chrome lives, most-preferred first. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error(
    'No Chrome or Edge found for rendering the share images.\n' +
      'Set CHROME_PATH to a browser binary, or run: npm run site:og -- --keep-stale\n' +
      '(the audit accepts committed images without regenerating them).',
  );
}

/**
 * The pages. The heading is the share image's job: it is the largest thing in
 * a small rectangle, and it is the only part most readers will read. The kicker
 * is the section the page is really about.
 *
 * These are the same titles the pages carry, not new copy, so a card can never
 * promise something the page it links to does not deliver.
 */
const CARDS = [
  {
    file: 'index',
    kicker: 'A party game for two to eight',
    heading: 'Better questions. Better conversations.',
    foot: 'Eight decks. 800 questions. A four character room code.',
  },
  {
    file: 'how-to-play',
    kicker: 'How to play',
    heading: 'Four steps, then you are deeper than you were.',
    foot: 'Answer in private. Reveal at the same moment.',
  },
  {
    file: 'decks',
    kicker: 'The catalogue',
    heading: 'Eight decks, and every question written out.',
    foot: 'Five free. Three with DEEPER+.',
  },
  {
    file: 'faq',
    kicker: 'Straight answers',
    heading: 'What it costs, and what happens to your answers.',
    foot: 'No invented answers. Read the real ones.',
  },
  {
    file: 'privacy-policy',
    kicker: 'Privacy',
    heading: 'What we keep, for how long, and why.',
    foot: 'Answers are never written to the database.',
  },
];

// --- a minimal CDP client over the WebSocket the browser hands us -----------

/**
 * Just enough of RFC 6455 to carry CDP traffic: an HTTP upgrade, then text
 * frames with a 4-byte length prefix. No fragmentation on send, and reassembly
 * on receive, which is all Chrome emits for these message sizes.
 */
class CdpSocket {
  constructor(wsUrl) {
    this.u = new URL(wsUrl);
    this.pending = new Map();
    this.nextId = 1;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
  }

  async open() {
    const key = crypto.randomBytes(16).toString('base64');
    this.sock = net.connect(Number(this.u.port), this.u.hostname);
    await new Promise((res, rej) => {
      this.sock.once('connect', res);
      this.sock.once('error', rej);
    });
    this.sock.write(
      `GET ${this.u.pathname}${this.u.search} HTTP/1.1\r\n` +
        `Host: ${this.u.host}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n\r\n',
    );
    // Wait for the 101 and consume the handshake so only frames remain.
    await new Promise((res, rej) => {
      const onData = (chunk) => {
        const s = chunk.toString('latin1');
        const at = s.indexOf('\r\n\r\n');
        if (at === -1) return;
        this.sock.off('data', onData);
        const rest = chunk.subarray(Buffer.byteLength(s.slice(0, at + 4), 'latin1'));
        this.buf = Buffer.concat([this.buf, rest]);
        if (!/^HTTP\/1\.1 101/.test(s)) return rej(new Error(`upgrade refused: ${s.split('\r\n')[0]}`));
        this.sock.on('data', (c) => this.#onData(c));
        res();
      };
      this.sock.on('data', onData);
    });
  }

  #onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const fin = (this.buf[0] & 0x80) !== 0;
      const opcode = this.buf[0] & 0x0f;
      const masked = (this.buf[1] & 0x80) !== 0;
      let len = this.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      let mask;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.subarray(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) return;
      let payload = Buffer.from(this.buf.subarray(off, off + len));
      this.buf = this.buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];

      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.#frame(0xa, payload); continue; } // ping -> pong
      if (opcode === 0x0 || opcode === 0x1 || opcode === 0x2) {
        this.fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragments);
          this.fragments = [];
          this.#onMessage(full);
        }
      }
    }
  }

  #onMessage(buf) {
    let msg;
    try { msg = JSON.parse(buf.toString('utf8')); } catch { return; }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else p.resolve(msg.result);
  }

  #frame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i & 3];
    this.sock.write(Buffer.concat([header, mask, masked]));
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const frame = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.#frame(0x1, Buffer.from(frame, 'utf8'));
    return p;
  }

  close() {
    try { this.sock.destroy(); } catch {}
    for (const { reject } of this.pending.values()) reject(new Error('socket closed'));
    this.pending.clear();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launch headless Chrome and return a connected client.
 *
 * The profile directory is unique per run and lives in the OS temp dir, never
 * in the repo: Chrome's single-instance lock is keyed on the profile, and
 * reusing a directory that a running browser already holds makes the new
 * process abort rather than start. A user-data-dir inside the project would
 * also leave a few hundred megabytes of browser state in the working tree.
 */
async function launch() {
  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), `deeper-og-${process.pid}-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const bin = findChrome();

  const proc = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // The card is a fixed-size document; nothing here should reach the net
      // except the font file, and blocking the rest keeps the render hermetic.
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let info = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) { info = await res.json(); break; }
    } catch {}
  }
  if (!info) {
    proc.kill();
    fs.rmSync(profile, { recursive: true, force: true });
    throw new Error('Chrome started but never exposed a debugging endpoint');
  }

  const cdp = new CdpSocket(info.webSocketDebuggerUrl);
  await cdp.open();
  return { cdp, proc, profile, port };
}

// --- the card ---------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The card document.
 *
 * The colour values are lifted from site/tokens.css rather than restated, and
 * `tokens` is verified against that file by the audit, so a palette change on
 * the site cannot leave the share images behind in an old one. Values are
 * resolved to hex here because oklch() in a background is fine in Chrome but
 * the generated PNG must not depend on a colour space the file format does not
 * carry; the audit checks the rendered pixel instead.
 */
function cardHtml(card, tokens) {
  const t = tokens;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: ${t.paper};
    color: ${t.ink};
    font-family: 'Schibsted Grotesk', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 80px 64px;
    position: relative;
  }

  /* The room light. A real radial wash in the accent hue, offset off the top
     right, which is where the site puts its glows. Kept as a gradient here
     because the grain overlay below supplies the dither an 8-bit gradient
     would otherwise band on. */
  .room {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(900px 620px at 88% -12%, ${t.accentWash} 0%, transparent 62%),
      radial-gradient(760px 540px at 4% 108%, ${t.violetWash} 0%, transparent 58%);
  }

  /* Grain, over everything and never interactive, same as the site. The site's
     own grain.png is inlined so the card needs no second request and cannot
     render before the texture arrives. */
  .grain {
    position: absolute;
    inset: 0;
    background-image: url(${t.grainDataUrl});
    background-repeat: repeat;
    opacity: 0.5;
    mix-blend-mode: overlay;
  }

  .inner { position: relative; display: flex; flex-direction: column; height: 100%; }

  .mark { display: flex; align-items: center; gap: 16px; }
  .mark img { width: 52px; height: 52px; border-radius: 12px; display: block; }
  .mark b {
    font-family: 'Bricolage Grotesque', Helvetica, Arial, sans-serif;
    font-size: 30px; font-weight: 700; letter-spacing: -0.015em;
  }
  .mark span {
    margin-left: auto;
    font-size: 21px; font-weight: 600; letter-spacing: 0.10em;
    text-transform: uppercase; color: ${t.inkFaint};
  }

  .body { margin-top: auto; margin-bottom: auto; padding: 40px 0; }

  .kicker {
    display: inline-flex; align-items: center; gap: 12px;
    font-size: 24px; font-weight: 600; letter-spacing: 0.055em;
    text-transform: uppercase; color: ${t.accentText};
  }
  /* A small lit dot, not a rule: the accent is light in a room, and a hairline
     above a heading is the one decoration this site has already retired. */
  .kicker::before {
    content: ''; width: 12px; height: 12px; border-radius: 50%;
    background: ${t.accent}; flex: none;
  }

  h1 {
    margin-top: 26px;
    font-family: 'Bricolage Grotesque', Helvetica, Arial, sans-serif;
    font-size: 76px; font-weight: 600; line-height: 1.04;
    letter-spacing: -0.028em; color: ${t.ink};
    max-width: 21ch;
    text-wrap: balance;
  }

  .foot {
    display: flex; align-items: baseline; gap: 20px;
    padding-top: 26px;
    border-top: 1px solid ${t.rule};
    font-size: 26px; font-weight: 500; color: ${t.inkSoft};
  }
  .foot .n { color: ${t.inkFaint}; font-size: 22px; margin-left: auto; }
</style></head>
<body>
  <div class="room"></div>
  <div class="grain"></div>
  <div class="inner">
    <div class="mark">
      <img src="${t.iconDataUrl}" alt="">
      <b>DEEPER</b>
      <span>example.invalid</span>
    </div>
    <div class="body">
      <div class="kicker">${esc(card.kicker)}</div>
      <h1>${esc(card.heading)}</h1>
    </div>
    <div class="foot">
      <div>${esc(card.foot)}</div>
      <div class="n">${esc(card.n ?? '')}</div>
    </div>
  </div>
</body></html>`;
}

/** Pull the tokens the card needs out of the real stylesheet, as hex. */
function loadTokens() {
  const css = read('site/tokens.css');
  const grab = (name) => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`token ${name} not found in site/tokens.css`);
    return m[1].trim();
  };
  // oklch -> hex, via a canvas in the browser would be a round trip per token;
  // this is a small, exact conversion of the two oklch forms in use.
  const oklchToHex = (raw) => {
    const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(raw);
    if (!m) return raw;
    const L = Number(m[1]) / 100;
    const C = Number(m[2]);
    const hDeg = Number(m[3]);
    const h = (hDeg * Math.PI) / 180;
    // oklch -> oklab -> linear sRGB -> sRGB
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const mm = m_ ** 3;
    const ss = s_ ** 3;
    const lin = [
      +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
    ];
    const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055);
    const to255 = (x) => Math.max(0, Math.min(255, Math.round(gamma(x) * 255)));
    return `#${lin.map((x) => to255(x).toString(16).padStart(2, '0')).join('')}`;
  };
  const alpha = (name, pct) => {
    const hex = oklchToHex(grab(name));
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${pct})`;
  };

  return {
    paper: oklchToHex(grab('--color-paper')),
    ink: oklchToHex(grab('--color-ink')),
    inkSoft: oklchToHex(grab('--color-ink-soft')),
    inkFaint: oklchToHex(grab('--color-ink-faint')),
    rule: oklchToHex(grab('--color-rule')),
    accent: oklchToHex(grab('--color-accent')),
    accentText: oklchToHex(grab('--color-accent-text')),
    accentWash: alpha('--color-accent', 0.16),
    violetWash: alpha('--color-violet', 0.13),
    iconDataUrl: `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'site/assets/icon.png')).toString('base64')}`,
    grainDataUrl: `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'site/assets/grain.png')).toString('base64')}`,
  };
}

// --- render -----------------------------------------------------------------

const keepStale = process.argv.includes('--keep-stale');
const verify = process.argv.includes('--verify');
let verifyFailed = false;
const missing = CARDS.filter((c) => !fs.existsSync(path.join(OUT_DIR, `${c.file}.png`)));
if (keepStale && missing.length === 0) {
  console.log(`${CARDS.length} share image(s) already present and --keep-stale was passed, nothing to do.`);
  process.exit(0);
}

const tokens = loadTokens();
const { cdp, proc, profile } = await launch();
let failed = false;

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const card of CARDS) {
    // A fresh target per card. Navigating a data: URL tears down the previous
    // document, and Chrome can detach the flattened session out from under the
    // next call ("Not attached to an active page"). A new target each time makes
    // each capture independent, and a card that fails costs one image rather
    // than the rest of the run.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    try {
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
      }, sessionId);

      const html = cardHtml(card, tokens);
      await cdp.send('Page.navigate', {
        url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      }, sessionId);

      // Wait for the faces, not just the load event. document.fonts.ready is the
      // only reliable signal that Bricolage has actually arrived; capturing
      // before it settles produces a card set in Helvetica, which looks almost
      // right and is not the brand.
      let ready = false;
      for (let i = 0; i < 60 && !ready; i += 1) {
        await sleep(150);
        try {
          const r = await cdp.send('Runtime.evaluate', {
            expression: `document.fonts.status === 'loaded' && document.readyState === 'complete'`,
            returnByValue: true,
          }, sessionId);
          ready = r.result?.value === true;
        } catch {
          // The document swapped under us; the next poll settles it.
        }
      }

      // A card typeset in a fallback still looks nearly right, so "a PNG came
      // out" is not evidence the brand face was used. Measure the heading in the
      // live document and compare it against the same string forced into
      // Helvetica: equal widths mean the webfont never arrived and the card is
      // set in the wrong face. The difference is reported and, with --verify,
      // made fatal.
      const faceCheck = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const h1 = document.querySelector('h1');
          if (!h1) return { ok: false, why: 'no h1' };
          const h1cs = getComputedStyle(h1);
          // Canvas text metrics, not a probe element: a probe inside this body
          // inherits overflow:hidden and width:100%, and reports 0, which looks
              // like a missing font but is a broken measurement.
          const cv = document.createElement('canvas').getContext('2d');
          const text = h1.textContent.trim();
          const font = (family) => (cv.font = h1cs.fontStyle + ' ' + h1cs.fontWeight + ' 76px ' + family, cv.measureText(text).width);
          const brand = font('"Bricolage Grotesque", sans-serif');
          const fallback = font('Helvetica, Arial, sans-serif');
          return {
            ok: true,
            fontsStatus: document.fonts.status,
            brandFaceLoaded: document.fonts.check('600 76px "Bricolage Grotesque"'),
            brand: Math.round(brand),
            fallback: Math.round(fallback),
          };
        })()`,
        returnByValue: true,
      }, sessionId).catch(() => ({ result: { value: { ok: false, why: 'session gone' } } }));
      const face = faceCheck.result?.value ?? { ok: false, why: 'no value' };
      // The brand face is genuinely present when the browser reports it loaded
      // AND it measurably differs from the fallback. Both must hold: the check
      // catches a font that failed silently and a probe that cannot tell faces
      // apart.
      const usedBrand = face.ok && face.brandFaceLoaded === true && Math.abs(face.brand - face.fallback) > 4;
      if (verify) {
        console.log(`  ${card.file}: fonts=${face.fontsStatus} brandLoaded=${face.brandFaceLoaded} brand=${face.brand}px fallback=${face.fallback}px -> ${usedBrand ? 'brand face' : 'NOT CONFIRMED'}`);
        if (!usedBrand) verifyFailed = true;
      }
      // Two frames so layout and the inlined grain are both painted.
      await cdp.send('Runtime.evaluate', {
        expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
        awaitPromise: true,
      }, sessionId).catch(() => {});

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
      }, sessionId);

      const out = path.join(OUT_DIR, `${card.file}.png`);
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      const kb = Math.round(fs.statSync(out).size / 1024);
      console.log(`  ${path.relative(ROOT, out).padEnd(30)} ${WIDTH}x${HEIGHT}  ${kb} KiB${ready ? '' : '  (fonts not confirmed)'}`);
    } finally {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }
} catch (err) {
  failed = true;
  process.stderr.write(`Share image render failed: ${err.message}\n`);
} finally {
  cdp.close();
  proc.kill();
  // Chrome keeps writing to its profile for a moment after the kill signal, so
  // an immediate rmdir races it and throws EBUSY on Windows. Wait for the
  // process to actually exit, then clear the directory; a profile left behind
  // in the OS temp dir is harmless if the very last attempt still fails, and
  // that must not fail the render.
  await new Promise((r) => {
    if (proc.exitCode !== null || proc.signalCode) return r();
    const t = setTimeout(r, 5000);
    proc.once('exit', () => { clearTimeout(t); r(); });
  });
  for (let i = 0; i < 5; i += 1) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break; }
    catch { await sleep(300); }
  }
}

if (failed) process.exit(1);
if (verifyFailed) {
  process.stderr.write('A card was typeset in a fallback face, not the brand. The webfont did not load.\n');
  process.exit(1);
}
console.log(`${CARDS.length} share image(s) written to site/assets/og/`);
