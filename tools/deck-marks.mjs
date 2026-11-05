/**
 * Deck marks.
 *
 * The eight decks carry a Unicode glyph each in packages/content
 * (`icon: '♡'`, `'✦'`, …). Those are the product's mark language and they stay
 * in the app, which is a React Native surface where a text glyph is the right
 * size of tool.
 *
 * On the web they are a different problem. A Unicode glyph standing in for an
 * icon is the most common shortcut in generated interface work: it arrives with
 * whatever weight and optical size the font decided on, so eight of them in a
 * row are never quite the same size, and on Windows several of them fall back to
 * a different symbol entirely. This file draws them instead: one 24x24 viewBox,
 * one stroke weight, round joins and caps, `currentColor` throughout.
 *
 * The shapes follow the product's own mark language — heart, four-point
 * sparkle, concentric target, smile, interlocking rings, five-petal flower,
 * crescent, half-lit disc — so the site and the app icon still read as the same
 * object.
 *
 * Run: node tools/deck-marks.mjs   (prints the <svg> markup)
 */

const VIEWBOX = '0 0 24 24';
const STROKE = 1.5;

const svg = (body) =>
  `<svg class="deck__mark" viewBox="${VIEWBOX}" width="28" height="28" fill="none" ` +
  `stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/**
 * Four-point sparkle: two mirrored concave quadratics. The pinch at the centre
 * is what separates a sparkle from a plain four-pointed star, which reads as a
 * compass or a rating icon.
 */
const sparkle = (cx, cy, r) => {
  const k = r * 0.16;
  return `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}` +
    `Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
};

/** Five-petal flower, built from a centre point and five radius arcs. */
function flower(cx, cy, r, petals = 5) {
  const petal = r * 0.52;
  let d = '';
  for (let i = 0; i < petals; i += 1) {
    const a = (Math.PI * 2 * i) / petals - Math.PI / 2;
    const px = cx + Math.cos(a) * petal;
    const py = cy + Math.sin(a) * petal;
    const nx = Math.cos(a + Math.PI / 2) * petal * 0.72;
    const ny = Math.sin(a + Math.PI / 2) * petal * 0.72;
    d += i === 0 ? `M${cx} ${cy}Q${px + nx} ${py + ny} ${px} ${py}` : `Q${px + nx} ${py + ny} ${px} ${py}`;
    d += `Q${px - nx} ${py - ny} ${cx} ${cy}`;
  }
  return d;
}

export const DECK_MARKS = {
  // Couples — a heart, drawn as one closed path rather than a glyph.
  couples: svg(
    '<path d="M12 20.5 4.2 12.9a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5Z"/>',
  ),
  // Deep Conversations — the four-point sparkle.
  deep: svg(`<path d="${sparkle(12, 12, 9)}"/>`),
  // How Well Do You Know Me — a target: two rings and a centre dot.
  'know-me': svg(
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.25"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  ),
  // Funny & Random — a face, open arc for the mouth.
  funny: svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M8.4 14.4a4.6 4.6 0 0 0 7.2 0"/><circle cx="9.2" cy="9.8" r="0.9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.8" r="0.9" fill="currentColor" stroke="none"/>',
  ),
  // Friends — two interlocking rings.
  friends: svg('<circle cx="9.2" cy="12" r="6"/><circle cx="14.8" cy="12" r="6"/>'),
  // First Date — a five-petal flower.
  'first-date': svg(`<path d="${flower(12, 12, 9.2)}"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>`),
  // Midnight Conversations — a crescent, cut by a second arc.
  'late-night': svg(
    '<path d="M15.4 3.4a8.6 8.6 0 1 0 5.2 12.4A9.4 9.4 0 0 1 15.4 3.4Z"/>',
  ),
  // After Dark — a disc half lit. The fill is drawn on a second path so the
  // stroke stays one weight and the shape still reads at 16px.
  'after-dark': svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
  ),
};

/** In document order, so the catalogue can be generated from one list. */
export const DECKS = [
  { id: 'couples', title: 'Couples' },
  { id: 'deep', title: 'Deep Conversations' },
  { id: 'know-me', title: 'How Well Do You Know Me?' },
  { id: 'funny', title: 'Funny & Random' },
  { id: 'friends', title: 'Friends' },
  { id: 'first-date', title: 'First Date' },
  { id: 'late-night', title: 'Midnight Conversations' },
  { id: 'after-dark', title: 'After Dark' },
];

export const mark = (id) => DECK_MARKS[id];

if (process.argv[1] && process.argv[1].endsWith('deck-marks.mjs')) {
  for (const deck of DECKS) {
    console.log(`${deck.id}\n${mark(deck.id)}\n`);
  }
}
