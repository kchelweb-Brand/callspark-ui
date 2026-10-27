// Generates the Dialer's CSV reader from the website's, so both read files identically.
// Run after changing src/lib/csv.ts:  node scripts/build-desktop-csv.mjs
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/csv.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

const out = `"use strict";
// GENERATED from src/lib/csv.ts by scripts/build-desktop-csv.mjs. Do not edit by hand.
window.KchelCsv = (function () {
  var exports = {};
${outputText}
  return exports;
})();
`;
writeFileSync(new URL("../desktop/src/renderer/csv-import.js", import.meta.url), out);
console.log("wrote desktop/src/renderer/csv-import.js");
