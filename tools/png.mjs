/**
 * A dependency-free PNG codec.
 *
 * This repo has no sharp, no ImageMagick and no Pillow available, and pulling in
 * a native image library just to draw four flat shapes would be a poor trade. So
 * the artwork is generated and verified through this module instead.
 *
 * Scope is deliberately narrow: it reads and writes exactly the 8-bit RGB and
 * RGBA, non-interlaced files that tools/generate-assets.mjs produces. It is not a
 * general-purpose decoder.
 */

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// --------------------------------------------------------------- crc32 ---
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// ---------------------------------------------------------------- write ---
/**
 * Encode RGBA pixels as a PNG.
 *
 * `withAlpha: false` writes colour type 2 (RGB) rather than 6 (RGBA). App Store
 * Connect rejects an app icon that carries an alpha channel even when every pixel
 * is opaque, so the main icon is written without one.
 */
export function encodePng(width, height, rgba, withAlpha) {
  const channels = withAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = y * (stride + 1) + 1 + x * channels;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      if (withAlpha) raw[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = withAlpha ? 6 : 2;    // colour type
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- read ---
/** Read dimensions and colour type straight out of the IHDR chunk. */
export function readPngHeader(buf) {
  if (buf.subarray(0, 8).compare(SIGNATURE) !== 0) throw new Error('not a PNG');
  // 0-7 signature, 8-11 length, 12-15 "IHDR", 16-19 width, 20-23 height,
  // 24 bit depth, 25 colour type. Colour type 6 is RGBA, 2 is RGB.
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colourType: buf[25],
    hasAlpha: buf[25] === 6,
  };
}

/** Reverse the per-scanline PNG filters (None/Sub/Up/Average/Paeth). */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = value & 0xff;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return out;
}

/** Decode to `{ width, height, hasAlpha, pixels }` with 4 bytes per pixel. */
export function decodePng(buf) {
  const header = readPngHeader(buf);
  const channels = header.hasAlpha ? 4 : 3;
  const parts = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (type === 'IDAT') parts.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = unfilter(zlib.inflateSync(Buffer.concat(parts)), header.width, header.height, channels);
  const pixels = Buffer.alloc(header.width * header.height * 4);
  for (let i = 0, n = header.width * header.height; i < n; i += 1) {
    pixels[i * 4] = raw[i * channels];
    pixels[i * 4 + 1] = raw[i * channels + 1];
    pixels[i * 4 + 2] = raw[i * channels + 2];
    pixels[i * 4 + 3] = channels === 4 ? raw[i * channels + 3] : 255;
  }
  return { ...header, pixels };
}

/**
 * Fraction of the image that the mark occupies.
 *
 * For a transparent asset that is the share of pixels with any alpha. For an
 * opaque one it is the share of pixels differing from the leftmost pixel of the
 * same row — a per-row reference, because the app icon's background is a vertical
 * gradient and a single global sample would score the whole gradient as "mark".
 *
 * This is the check that catches a geometry tweak which silently renders the mark
 * off-canvas or at zero size, which a dimension or file-size check sails past.
 */
export function coverageRatio(image) {
  const { width, height, hasAlpha, pixels } = image;
  const total = width * height;
  let covered = 0;
  for (let y = 0; y < height; y += 1) {
    const edge = y * width * 4; // pixel (0, y)
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (hasAlpha) {
        if (pixels[o + 3] > 8) covered += 1;
      } else if (
        Math.abs(pixels[o] - pixels[edge]) +
          Math.abs(pixels[o + 1] - pixels[edge + 1]) +
          Math.abs(pixels[o + 2] - pixels[edge + 2]) > 24
      ) {
        covered += 1;
      }
    }
  }
  return covered / total;
}
