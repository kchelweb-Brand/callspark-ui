// Rasterises the Kchel "Forward K" mark into PNG and ICO favicons.
//
// Safari ignores SVG favicons, so a raster set is the only way to get the mark
// into its tab. Rather than add an image dependency for a handful of rounded
// rectangles and two chevrons, this draws them directly: each shape is an
// inside/outside test, sampled 4x4 per pixel for antialiasing.
//
// The geometry below mirrors public/favicon.svg exactly. Change one and change
// the other, or the tab icon stops matching the app.
//
//   node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---------------------------------------------------------------------------
// Geometry — a 64x64 design grid, matching public/favicon.svg
// ---------------------------------------------------------------------------

const TILE = { x: 0, y: 0, w: 64, h: 64, r: 14, color: [0x16, 0x18, 0x1d] };
/** The mark is scaled about the centre so it sits inside the tile's padding. */
const MARK_SCALE = 0.82;

const BAR = { x: 10, y: 12, w: 9, h: 40, r: 4.5, color: [0x14, 0xb2, 0x6a] };
const CHEVRONS = [
  { pts: [[25, 15], [41, 32], [25, 49]], half: 4.5, color: [0x3d, 0x79, 0xee] },
  { pts: [[43, 22], [53, 32], [43, 42]], half: 4.0, color: [0xf0, 0xc0, 0x20] },
];

/** Distance from a point to a rounded rectangle's surface; negative inside. */
function roundRectInside(px, py, { x, y, w, h, r }) {
  // Fold into the nearest corner's quadrant, then it's a simple circle test.
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const dx = px - cx;
  const dy = py - cy;
  // Inside the cross-shaped core, no corner rounding applies.
  if (px >= x + r && px <= x + w - r) return true;
  if (py >= y + r && py <= y + h - r) return true;
  return dx * dx + dy * dy <= r * r;
}

/** Distance from a point to a line segment — round caps come for free. */
function segDistance(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

function polylineHit(px, py, pts, half) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segDistance(px, py, pts[i], pts[i + 1]) <= half) return true;
  }
  return false;
}

/**
 * Colour at one point in tile space, or null outside the tile.
 * Painter's order: tile, stem, then each chevron.
 *
 * Below ~24px the two chevrons close up into an unreadable smudge, so small
 * sizes drop the second one and scale the rest up. This is the usual favicon
 * compromise: a mark that reads at tab size beats a faithful one that doesn't.
 */
function shade(x, y, simplified) {
  if (!roundRectInside(x, y, TILE)) return null;

  const scale = simplified ? 0.94 : MARK_SCALE;
  const mx = (x - 32) / scale + 32;
  const my = (y - 32) / scale + 32;

  const chevrons = simplified ? CHEVRONS.slice(0, 1) : CHEVRONS;

  let color = TILE.color;
  if (roundRectInside(mx, my, BAR)) color = BAR.color;
  for (const c of chevrons) {
    if (polylineHit(mx, my, c.pts, c.half)) color = c.color;
  }
  return color;
}

/** Where the full mark stops being legible. */
const SIMPLIFY_BELOW = 24;

const SUBSAMPLES = 6;

/** Renders the mark at `size` px as a raw RGBA buffer. */
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const step = 64 / size;
  const simplified = size < SIMPLIFY_BELOW;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const c = shade(
            (x + (sx + 0.5) / SUBSAMPLES) * step,
            (y + (sy + 0.5) / SUBSAMPLES) * step,
            simplified,
          );
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }

      const n = SUBSAMPLES * SUBSAMPLES;
      const covered = a / 255;
      const i = (y * size + x) * 4;
      // Averaging only over covered samples keeps edge pixels the shape's own
      // colour instead of dragging them toward black.
      px[i] = covered ? Math.round(r / covered) : 0;
      px[i + 1] = covered ? Math.round(g / covered) : 0;
      px[i + 2] = covered ? Math.round(b / covered) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // compression, filter, interlace all default to 0.

  // Every scanline uses filter 0 (none) — these images are tiny and the
  // filter choice would save bytes that don't matter here.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// ICO — a container of PNGs, which every browser since IE11 accepts
// ---------------------------------------------------------------------------

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;

  images.forEach((img, i) => {
    const e = i * 16;
    dir[e] = img.size >= 256 ? 0 : img.size; // 0 means 256
    dir[e + 1] = img.size >= 256 ? 0 : img.size;
    dir[e + 2] = 0; // palette size
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

// ---------------------------------------------------------------------------

const png = (size) => ({ size, data: encodePng(size, render(size)) });

const targets = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

for (const [name, size] of targets) {
  const { data } = png(size);
  writeFileSync(join(OUT, name), data);
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(data.length / 1024).toFixed(1)} KB`);
}

const ico = encodeIco([png(16), png(32), png(48)]);
writeFileSync(join(OUT, "favicon.ico"), ico);
console.log(`${"favicon.ico".padEnd(22)} 16/32/48  ${(ico.length / 1024).toFixed(1)} KB`);
