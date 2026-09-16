// Exports the Kchel Dialer logo as PNG/JPEG in every variant a brand needs.
//
// The wordmark is set in Plus Jakarta Sans 800 — the app's own display face —
// so this can't be done with the pure-Node rasteriser that makes the favicons
// (scripts/generate-icons.mjs); there's no font engine there. Instead this
// serves a one-page generator, lets a real browser draw it on a canvas, and
// writes back whatever the page POSTs.
//
//   node scripts/export-brand-assets.mjs      # then open the printed URL
//
// Colours are derived from the oklch tokens in src/styles.css rather than
// re-typed as hex, so the exports can't drift away from the running app.

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "brand");
const PORT = Number(process.env.BRAND_PORT ?? 4599);

mkdirSync(OUT, { recursive: true });

const written = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }

  if (req.method === "POST" && url.pathname === "/save") {
    const name = url.searchParams.get("name");
    if (!name || !/^[a-z0-9.@-]+$/i.test(name)) {
      res.writeHead(400).end("bad name");
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const data = Buffer.concat(chunks);
      writeFileSync(join(OUT, name), data);
      written.push([name, data.length]);
      res.writeHead(200).end("ok");
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/done") {
    res.writeHead(200).end("ok");
    const total = written.reduce((a, [, n]) => a + n, 0);
    for (const [name, size] of written) {
      console.log(`  ${name.padEnd(36)} ${(size / 1024).toFixed(1)} KB`);
    }
    console.log(`\n${written.length} files, ${(total / 1024 / 1024).toFixed(2)} MB -> brand/`);
    server.close(() => process.exit(0));
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`brand exporter: http://localhost:${PORT}/`);
});

// ---------------------------------------------------------------------------

const PAGE = String.raw`<!doctype html>
<meta charset="utf-8" />
<title>Kchel brand export</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@800&display=swap" rel="stylesheet" />
<style>
  body { font: 14px/1.6 system-ui, sans-serif; background:#101319; color:#e6e9f0; margin:0; padding:28px; }
  h1 { font-size:16px; margin:0 0 12px; }
  #log { font-family:ui-monospace,monospace; font-size:12px; white-space:pre-wrap; }
  .ok { color:#4ade80; } .err { color:#f87171; }
</style>
<h1>Kchel Dialer — brand asset export</h1>
<div id="log"></div>
<script type="module">
const logEl = document.getElementById("log");
const log = (m, cls) => {
  const s = document.createElement("span");
  s.textContent = m + "\n";
  if (cls) s.className = cls;
  logEl.append(s);
};

// --- oklch -> sRGB hex, so exports match the tokens in src/styles.css --------
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + lin
    .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055))
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0"))
    .join("");
}

const P = {
  green:  oklch(0.62, 0.16, 152),
  blue:   oklch(0.56, 0.17, 250),
  yellow: oklch(0.84, 0.16, 92),
  ink:    oklch(0.16, 0.012, 250),
  white:  "#ffffff",
};

// --- the mark ---------------------------------------------------------------
// Geometry is a straight copy of src/components/brand/Logo.tsx. The intrinsic
// size is 640 (10px per design unit) so source-rect crops stay whole numbers.
const UNIT = 10;

function markSvg(stem, c1, c2) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="640" height="640" fill="none">' +
    '<rect x="10" y="12" width="9" height="40" rx="4.5" fill="' + stem + '"/>' +
    '<path d="M25 15 L41 32 L25 49" stroke="' + c1 + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M43 22 L53 32 L43 42" stroke="' + c2 + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

const loadMark = (stem, c1, c2) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error("mark failed to load"));
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markSvg(stem, c1, c2));
});

// Ink covered by the mark, in design units: the stem starts at x=10, the yellow
// chevron ends at x=53 under an 8-wide stroke, the blue one spans y 10.5-53.5.
const BB = { x: 10, y: 10.5, w: 47, h: 43 };
const ASPECT = BB.w / BB.h;

/** Draws the mark cropped to its ink, "h" tall, top-left at (x, y). */
function drawMark(ctx, img, x, y, h) {
  ctx.drawImage(img, BB.x * UNIT, BB.y * UNIT, BB.w * UNIT, BB.h * UNIT, x, y, h * ASPECT, h);
}

const canvas2d = (w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext("2d")];
};

// --- wordmark ---------------------------------------------------------------
const WORDMARK = "Kchel Dialer";
const TRACKING = "-0.025em";

function setFont(ctx, px) {
  ctx.font = '800 ' + px + 'px "Plus Jakarta Sans"';
  ctx.letterSpacing = TRACKING;
  ctx.textBaseline = "alphabetic";
}

/** Tight ink box for the wordmark — not the font's line box, which is padded. */
function measure(px) {
  const ctx = document.createElement("canvas").getContext("2d");
  setFont(ctx, px);
  const m = ctx.measureText(WORDMARK);
  return {
    w: m.actualBoundingBoxRight + m.actualBoundingBoxLeft,
    left: m.actualBoundingBoxLeft,
    asc: m.actualBoundingBoxAscent,
    desc: m.actualBoundingBoxDescent,
  };
}

// --- compositions -----------------------------------------------------------

/** Mark alone on a square, transparent unless "bg" is given. */
function composeMark(img, size, bg) {
  const [c, ctx] = canvas2d(size, size);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const h = (size * 0.72) / ASPECT;
  drawMark(ctx, img, (size - h * ASPECT) / 2, (size - h) / 2, h);
  return c;
}

/** Mark inside a rounded tile, matching the favicon's proportions. */
function composeIcon(img, size, tileColor) {
  const [c, ctx] = canvas2d(size, size);
  ctx.fillStyle = tileColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * (14 / 64));
  ctx.fill();
  const d = size * 0.82;
  ctx.drawImage(img, (size - d) / 2, (size - d) / 2, d, d);
  return c;
}

/** Mark and wordmark side by side, optically centred on each other. */
function composeHorizontal(img, markH, textColor, bg) {
  const fs = markH * 0.56;
  const t = measure(fs);
  const gap = markH * 0.3;
  const pad = markH * 0.2;
  const markW = markH * ASPECT;

  const [c, ctx] = canvas2d(markW + gap + t.w + pad * 2, Math.max(markH, t.asc + t.desc) + pad * 2);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  const midY = c.height / 2;
  drawMark(ctx, img, pad, midY - markH / 2, markH);
  setFont(ctx, fs);
  ctx.fillStyle = textColor;
  // Centre the text on its own ink rather than its baseline, or it rides high.
  ctx.fillText(WORDMARK, pad + markW + gap + t.left, midY + (t.asc - t.desc) / 2);
  return c;
}

/** Mark above the wordmark, both centred. */
function composeStacked(img, markH, textColor, bg) {
  const fs = markH * 0.42;
  const t = measure(fs);
  const gap = markH * 0.24;
  const pad = markH * 0.18;
  const markW = markH * ASPECT;

  const [c, ctx] = canvas2d(Math.max(markW, t.w) + pad * 2, markH + gap + t.asc + t.desc + pad * 2);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  drawMark(ctx, img, (c.width - markW) / 2, pad, markH);
  setFont(ctx, fs);
  ctx.fillStyle = textColor;
  ctx.fillText(WORDMARK, (c.width - t.w) / 2 + t.left, pad + markH + gap + t.asc);
  return c;
}

/** 1200x630 social card: the horizontal lockup centred on brand ink. */
function composeSocial(img) {
  const [c, ctx] = canvas2d(1200, 630);
  ctx.fillStyle = P.ink;
  ctx.fillRect(0, 0, 1200, 630);
  const lock = composeHorizontal(img, 150, P.white, null);
  ctx.drawImage(lock, (1200 - lock.width) / 2, (630 - lock.height) / 2);
  return c;
}

// --- output -----------------------------------------------------------------
function scaleTo(c, width) {
  const [d, ctx] = canvas2d(width, (c.height / c.width) * width);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, d.width, d.height);
  return d;
}

async function save(name, canvas) {
  const jpeg = name.endsWith(".jpg");
  const blob = await new Promise((r) => canvas.toBlob(r, jpeg ? "image/jpeg" : "image/png", 0.94));
  const res = await fetch("/save?name=" + encodeURIComponent(name), { method: "POST", body: blob });
  if (!res.ok) throw new Error("save failed: " + name);
  log("  " + name.padEnd(36) + canvas.width + "x" + canvas.height + "  " + (blob.size / 1024).toFixed(1) + " KB", "ok");
}

/** JPEG has no alpha, so anything exported as one is flattened deliberately. */
async function saveBoth(base, canvas, bgColor) {
  await save(base + ".png", canvas);
  const [flat, ctx] = canvas2d(canvas.width, canvas.height);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  await save(base + ".jpg", flat);
}

try {
  await document.fonts.load('800 100px "Plus Jakarta Sans"');
  await document.fonts.ready;
  if (!document.fonts.check('800 100px "Plus Jakarta Sans"')) {
    throw new Error("Plus Jakarta Sans did not load");
  }
  log("font ready — Plus Jakarta Sans 800");
  log("palette  green " + P.green + "  blue " + P.blue + "  yellow " + P.yellow + "  ink " + P.ink);

  const color = await loadMark(P.green, P.blue, P.yellow);
  const white = await loadMark(P.white, P.white, P.white);
  const black = await loadMark(P.ink, P.ink, P.ink);

  log("\napp icon");
  await saveBoth("kchel-icon-dark", composeIcon(color, 1024, P.ink), P.ink);
  await save("kchel-icon-dark-512.png", composeIcon(color, 512, P.ink));
  await save("kchel-icon-dark-256.png", composeIcon(color, 256, P.ink));
  await saveBoth("kchel-icon-light", composeIcon(color, 1024, P.white), P.white);
  await save("kchel-icon-light-512.png", composeIcon(color, 512, P.white));

  log("\nmark only");
  await save("kchel-mark-color.png", composeMark(color, 1024));
  await save("kchel-mark-color-512.png", composeMark(color, 512));
  await save("kchel-mark-white.png", composeMark(white, 1024));
  await save("kchel-mark-black.png", composeMark(black, 1024));
  await save("kchel-mark-color-on-white.jpg", composeMark(color, 1024, P.white));

  log("\nhorizontal lockup");
  const hDark = composeHorizontal(color, 320, P.ink, null);
  await save("kchel-logo-horizontal.png", hDark);
  await save("kchel-logo-horizontal-800.png", scaleTo(hDark, 800));
  await save("kchel-logo-horizontal-on-white.jpg", composeHorizontal(color, 320, P.ink, P.white));
  const hLight = composeHorizontal(color, 320, P.white, null);
  await save("kchel-logo-horizontal-white.png", hLight);
  await save("kchel-logo-horizontal-white-800.png", scaleTo(hLight, 800));
  await save("kchel-logo-horizontal-on-ink.jpg", composeHorizontal(color, 320, P.white, P.ink));

  log("\nstacked lockup");
  await save("kchel-logo-stacked.png", composeStacked(color, 360, P.ink, null));
  await save("kchel-logo-stacked-on-white.jpg", composeStacked(color, 360, P.ink, P.white));
  await save("kchel-logo-stacked-white.png", composeStacked(color, 360, P.white, null));
  await save("kchel-logo-stacked-on-ink.jpg", composeStacked(color, 360, P.white, P.ink));

  log("\nsingle colour");
  await save("kchel-logo-mono-black.png", composeHorizontal(black, 320, P.ink, null));
  await save("kchel-logo-mono-white.png", composeHorizontal(white, 320, P.white, null));

  log("\nsocial");
  await saveBoth("kchel-social-1200x630", composeSocial(color), P.ink);

  log("\nDONE", "ok");
  await fetch("/done", { method: "POST" });
} catch (e) {
  log("FAILED: " + (e && e.message ? e.message : e), "err");
}
</script>`;
