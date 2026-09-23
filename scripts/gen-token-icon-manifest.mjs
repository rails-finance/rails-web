#!/usr/bin/env node
// Regenerates lib/shared/local-token-icons.ts from public/icons/tokens/*.png.
// Run from the repo root: `node scripts/gen-token-icon-manifest.mjs`.
//
// Each PNG is named either by lowercased token address (`0x….png`) or by a
// lowercased symbol (`usdc.png`). The manifest maps a lowercased lookup key to
// the actual on-disk filename so the chip component can resolve a local icon by
// address or by symbol before falling back to the CDNs.

import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "public/icons/tokens");
const out = resolve(root, "lib/shared/local-token-icons.ts");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .sort();

const seen = new Map();
for (const f of files) {
  const key = f.slice(0, -4).toLowerCase();
  if (seen.has(key) && seen.get(key) !== f) {
    console.warn(`WARN duplicate key ${key}: ${seen.get(key)} vs ${f}`);
  }
  seen.set(key, f);
}

const entries = [...seen.entries()].map(([key, f]) => `  ${JSON.stringify(key)}: ${JSON.stringify(f)},`).join("\n");

const body = `// AUTO-GENERATED — do not edit the map by hand.
// Source: public/icons/tokens/*.png
//
// Regenerate after adding/removing token PNGs (filenames are either a
// lowercased token address \`0x….png\` or a lowercased symbol \`usdc.png\`):
//
//   node scripts/gen-token-icon-manifest.mjs
//
// Maps a lowercased lookup key (token address, or lowercased symbol) to the
// actual on-disk filename — case preserved for case-sensitive hosts (Vercel).
export const LOCAL_TOKEN_ICONS: Record<string, string> = {
${entries}
};

/** Resolve a local /public icon path for an address or symbol, or null. */
export function getLocalTokenIcon(key: string): string | null {
  const file = LOCAL_TOKEN_ICONS[key.toLowerCase()];
  return file ? \`/icons/tokens/\${file}\` : null;
}
`;

writeFileSync(out, body);
console.log(`wrote ${out} with ${seen.size} entries`);
