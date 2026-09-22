// Builds the icon files electron-builder needs from the brand mark, so the
// desktop app's icon is the same source of truth as the favicons and the
// exported brand assets rather than a fourth copy someone has to remember to
// update.
//
//   npm run icons   (from desktop/)

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, "icon-source.png")); // 1024x1024, from brand/

const ico = png2icons.createICO(source, png2icons.BILINEAR, 0, false, true);
if (!ico) throw new Error("ICO generation failed");
writeFileSync(join(HERE, "icon.ico"), ico);

const icns = png2icons.createICNS(source, png2icons.BILINEAR, 0);
if (!icns) throw new Error("ICNS generation failed");
writeFileSync(join(HERE, "icon.icns"), icns);

// Linux AppImage wants a plain PNG, and the tray icon in main.js reuses it.
copyFileSync(join(HERE, "icon-source.png"), join(HERE, "icon.png"));

console.log("wrote icon.ico, icon.icns, icon.png");
