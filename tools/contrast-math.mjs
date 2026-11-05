/**
 * OKLCH contrast maths, for checking the token palette numerically.
 *
 * Run: node tools/contrast-math.mjs
 *
 * Chromium's canvas refuses an oklch() fillStyle in some builds, which makes a
 * browser-based contrast check silently report every pair as 1:1. Converting in
 * JS avoids depending on that, and it also lets a token be validated here rather
 * than only after it has shipped.
 */

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function parseOklch(css) {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/.exec(String(css).trim());
  if (!m) throw new Error(`not an oklch() colour: ${css}`);
  const L = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]);
  const C = Number(m[3]);
  const H = (Number(m[4]) * Math.PI) / 180;
  const alpha = m[5] === undefined ? 1 : m[6] === '%' ? Number(m[5]) / 100 : Number(m[5]);
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: clamp01(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    g: clamp01(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    b: clamp01(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
    alpha,
  };
}

export const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function contrast(fgCss, bgCss) {
  const fg = parseOklch(fgCss);
  const bg = parseOklch(bgCss);
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Self-check when run directly.
if (process.argv[1] && process.argv[1].endsWith('contrast-math.mjs')) {
  const paper = 'oklch(13% 0.016 305)';
  const raised = 'oklch(18% 0.018 305)';
  const card = 'oklch(21% 0.02 305)';
  const accent = 'oklch(66% 0.215 8)';

  console.log('Candidate --color-ink-faint values (need >= 4.5 on paper, raised and card):');
  for (const pct of [56, 58, 60, 62, 64]) {
    const c = `oklch(${pct}% 0.018 305)`;
    console.log(
      `  ${String(pct).padStart(2)}%  paper ${contrast(c, paper).toFixed(2)}  raised ${contrast(c, raised).toFixed(2)}  card ${contrast(c, card).toFixed(2)}`,
    );
  }

  console.log('\nCurrent ink tokens:');
  for (const [name, c] of Object.entries({
    '--color-ink': 'oklch(97% 0.008 305)',
    '--color-ink-muted': 'oklch(80% 0.014 305)',
    '--color-ink-soft': 'oklch(68% 0.016 305)',
    '--color-ink-faint': 'oklch(56% 0.018 305)',
    '--color-accent-text': 'oklch(81% 0.125 10)',
    '--color-accent-lit': 'oklch(73% 0.185 14)',
  })) {
    console.log(
      `  ${name.padEnd(20)} paper ${contrast(c, paper).toFixed(2)}  raised ${contrast(c, raised).toFixed(2)}  card ${contrast(c, card).toFixed(2)}  onAccentFill ${contrast(c, accent).toFixed(2)}`,
    );
  }

  console.log(`\n  --color-accent-ink on the accent fill: ${contrast('oklch(16% 0.022 8)', accent).toFixed(2)}`);
}
