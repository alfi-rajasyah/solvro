// Fails when the entry chunk of a production build exceeds the budget.
// Run after `vite build`: `npm run check:bundle-size`.
// Route-level code splitting keeps the entry small
// (docs/archive/plans/application-review-2026-10-22.md, F-16); this guards
// against a heavy import creeping back into the shell.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Budget is 1 MB; the entry chunk is ~957 kB today, so ~43 kB of headroom.
const LIMIT_BYTES = 1_000_000; // 1 MB raw (what Vite prints as kB)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const html = readFileSync(path.join(dist, "index.html"), "utf8");
const match = html.match(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/);
if (!match) {
  console.error("check-bundle-size: no module <script> found in dist/index.html (run `vite build` first).");
  process.exit(2);
}

const entry = path.join(dist, match[1].replace(/^\//, ""));
const size = statSync(entry).size;
const kb = (size / 1000).toFixed(2);
if (size > LIMIT_BYTES) {
  console.error(`check-bundle-size: entry chunk ${match[1]} is ${kb} kB, over the ${LIMIT_BYTES / 1000} kB budget.`);
  process.exit(1);
}
console.log(`check-bundle-size: entry chunk ${match[1]} is ${kb} kB (budget ${LIMIT_BYTES / 1000} kB).`);
