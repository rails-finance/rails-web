#!/usr/bin/env node
// The explorer chooser's ranking (rails-ops TO-DO-ui-jobs 503), written to
// lib/shared/explorer-rank.json from the home page's value-held rows
// (`GET /api/stats/value-held`).
//
// A snapshot, not a read at render: the route prices every open position and
// takes tens of seconds, and the chooser is on every page. Run it when the
// ranking should move (a launch, a quarter's drift) and commit the file:
//
//   pnpm explorer-rank
//
// The file keeps each chain's COUNTED rows, largest value first, as the
// server names them (route slug and chain id). No dollar figure is kept: the
// chooser needs the order alone.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("lib/shared/explorer-rank.json", ROOT);

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = new URL(".env.local", ROOT);
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^"|"$/g, "");
}

const api = env("RAILS_API_URL");
const token = env("API_BEARER_TOKEN");
if (!api || !token) {
  console.error("explorer-rank: RAILS_API_URL and API_BEARER_TOKEN are needed (.env.local or the env)");
  process.exit(1);
}

const res = await fetch(`${api}/api/stats/value-held`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(180_000),
});
if (!res.ok) {
  console.error(`explorer-rank: /api/stats/value-held -> ${res.status}`);
  process.exit(1);
}
const { data } = await res.json();
if (!data || !Array.isArray(data.explorers)) {
  console.error("explorer-rank: no explorers in the answer");
  process.exit(1);
}

/** A chain id -> the counted route slugs, largest value first. One explorer
 *  with two surfaces (a market and its vaults) is ranked by their sum. */
const byChain = {};
const sums = new Map();
for (const e of data.explorers) {
  if (!e.counted || typeof e.usd !== "number" || !Number.isFinite(e.usd)) continue;
  const key = `${e.chainId}:${e.protocol}`;
  sums.set(key, (sums.get(key) ?? 0) + e.usd);
}
for (const [key] of [...sums].sort((a, b) => b[1] - a[1])) {
  const [chainId, slug] = key.split(":");
  (byChain[chainId] ??= []).push(slug);
}

writeFileSync(OUT, JSON.stringify({ computedAt: data.computedAt, byChain }, null, 2) + "\n");
execFileSync("npx", ["prettier", "--write", fileURLToPath(OUT)], { stdio: "ignore" });
console.log(`explorer-rank: ${sums.size} counted explorers, as of ${data.computedAt}`);
for (const [chainId, slugs] of Object.entries(byChain)) console.log(`  ${chainId}: ${slugs.join(", ")}`);
