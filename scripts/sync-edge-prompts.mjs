#!/usr/bin/env node
// Regenerates the .ts string modules that mirror the .md source-of-truth files
// for edge functions. Supabase's managed deploy pipeline does not bundle
// sidecar .md files, so we inline them as TS modules. The .md is canonical;
// the .ts is generated. Run after editing any .md listed in PAIRS.
//
// Usage:
//   node scripts/sync-edge-prompts.mjs          # write
//   node scripts/sync-edge-prompts.mjs --check  # exit 1 if any .ts is stale

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PAIRS = [
  "supabase/functions/analyze-msa/system-prompt.md",
  "supabase/functions/analyze-msa/vapi-rev-rec-policy.md",
  "supabase/functions/monthly-close/system-prompt.md",
  "supabase/functions/monthly-close/vapi-rev-rec-policy.md",
];

function render(mdPath, md) {
  const header = `// Auto-generated from ${basename(mdPath)}. Do not edit directly; edit the .md and run \`npm run prompts:sync\`.\n`;
  return `${header}export default ${JSON.stringify(md)};\n`;
}

const check = process.argv.includes("--check");
let stale = [];

for (const rel of PAIRS) {
  const mdAbs = resolve(ROOT, rel);
  const tsAbs = mdAbs.replace(/\.md$/, ".ts");
  if (!existsSync(mdAbs)) {
    console.error(`missing source: ${rel}`);
    process.exit(2);
  }
  const md = readFileSync(mdAbs, "utf8");
  const expected = render(mdAbs, md);
  const actual = existsSync(tsAbs) ? readFileSync(tsAbs, "utf8") : "";
  if (actual !== expected) {
    if (check) {
      stale.push(rel);
    } else {
      writeFileSync(tsAbs, expected);
      console.log(`synced ${rel.replace(/\.md$/, ".ts")}`);
    }
  }
}

if (check && stale.length) {
  console.error(
    `\nEdge-function .ts modules are out of sync with their .md sources:\n  - ${stale.join("\n  - ")}\n\nRun: npm run prompts:sync\n`,
  );
  process.exit(1);
}
