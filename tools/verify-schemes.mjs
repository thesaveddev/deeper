/**
 * Contrast + layout sweep for both colour schemes, run in the browser.
 *
 * Run with the preview open on any site page:
 *   node tools/verify-schemes.mjs            (prints the probe source)
 *
 * The probe is also pasted into the preview panel's evaluate tool. It lives in a
 * file so the OKLCH maths is written once and can be re-run identically after any
 * palette change.
 *
 * THE MATHS. OKLCH's inverse matrices already output LINEAR sRGB, and WCAG
 * relative luminance is defined on linear light. So the luminance must be taken
 * from the matrix output directly. An earlier version of this probe applied the
 * sRGB transfer function first and then computed luminance, which double-encodes
 * and reported a palette that measured 7.1:1 as 2.7:1, turning a passing light
 * theme into 39 phantom failures. tools/contrast-math.mjs is the reference and
 * does it the correct way.
 */
export const PROBE = `(() => {
  const conv = (css) => {
    if (!css) return null;
    let m = /oklch\\(\\s*([\\d.]+)(%?)\\s+([\\d.]+)\\s+([\\d.]+)\\s*(?:\\/\\s*([\\d.]+))?\\s*\\)/.exec(css);
    if (m) {
      const L = (m[2] === '%' ? +m[1] : +m[1] * 100) / 100, C = +m[3], h = +m[4] * Math.PI / 180;
      const al = m[5] !== undefined ? +m[5] : 1;
      const a = C * Math.cos(h), b = C * Math.sin(h);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      const cl = (x) => Math.min(1, Math.max(0, x));
      return { lin: [cl(4.0767416621*l - 3.3077115913*mm + 0.2309699292*s),
                     cl(-1.2684380046*l + 2.6097574011*mm - 0.3413193965*s),
                     cl(-0.0041960863*l - 0.7034186147*mm + 1.707614701*s)], a: al };
    }
    m = /rgba?\\(([^)]+)\\)/.exec(css);
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(parseFloat);
      const g = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return { lin: [g(p[0]), g(p[1]), g(p[2])], a: p[3] !== undefined ? p[3] : 1 };
    }
    if (css === 'transparent') return { lin: [0, 0, 0], a: 0 };
    return null;
  };
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const over = (f, b) => [0, 1, 2].map((i) => f.lin[i] * f.a + b[i] * (1 - f.a));
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = conv(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
    }
    let b = [1, 1, 1];
    for (let i = stack.length - 1; i >= 0; i--) b = over(stack[i], { lin: b, a: 1 });
    return b;
  };
  const de = document.documentElement;
  const fails = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fgc = conv(cs.color);
    if (!fgc) continue;
    const bg = bgOf(el);
    const fg = fgc.a < 1 ? over(fgc, { lin: bg, a: 1 }) : fgc.lin;
    const l1 = lum(fg), l2 = lum(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    checked++;
    if (ratio < need) fails.push({ t: el.textContent.trim().slice(0, 24), ratio: +ratio.toFixed(2), need, size });
  }
  const vis = (el) => { const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0; };
  return {
    page: location.pathname,
    scheme: de.getAttribute('data-theme') || '(system)',
    viewport: de.clientWidth,
    pageOverflowX: de.scrollWidth - de.clientWidth,
    contrastChecked: checked,
    contrastFails: fails.length,
    worst: fails.slice(0, 6),
    controlsVisible: [...document.querySelectorAll('[data-theme-toggle]')].filter(vis).length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
})()`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  console.log(PROBE);
}
