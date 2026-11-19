/**
 * The tokens a protocol population reads that have no asset page (ui-jobs 490).
 *
 * A token has a page where the price roster prices it (GET /api/prices/assets)
 * or where an explorer's list names its symbol (the unpriced page,
 * lib/api/asset-explorer-chips.ts). This lists the rest: every token in an
 * explorer's static list (the catalogs and censuses `catalogTokens` reads)
 * that is neither priced nor named, less Morpho's tokens in a market with $1M
 * or more of supply (erc20-meta names those at runtime), and the tokens of
 * Pendle's live markets the same way.
 *
 *   npx tsx --import ./scripts/verify/lib/server-only-hook.mjs scripts/asset-page-gaps.mjs
 *
 * Reads RAILS_API_URL and API_BEARER_TOKEN from the environment (.env.local).
 * Prints a line per explorer: how many tokens it reads, how many have no page,
 * and those tokens; JSON=1 prints them as JSON.
 */

import { readFileSync, existsSync } from "node:fs";
import { catalogTokens } from "../lib/api/asset-explorer-chips.ts";
import { MORPHO_SUPPLY_TOKENS } from "../lib/morpho/supply-tokens.ts";

if (existsSync(".env.local"))
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
const base = process.env.RAILS_API_URL;
if (!base) {
  console.error("RAILS_API_URL is not set.");
  process.exit(2);
}
const get = async (path) => {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${process.env.API_BEARER_TOKEN ?? ""}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const roster = await get("/api/prices/assets");
const priced = new Set(roster.assets.map((a) => `${a.chain}:${a.token.toLowerCase()}`));
const tokens = catalogTokens();
const named = new Set(tokens.filter((t) => t.symbol).map((t) => `${t.chain}:${t.token}`));
for (const [chain, list] of Object.entries(MORPHO_SUPPLY_TOKENS)) for (const t of list) named.add(`${chain}:${t}`);

const pendle = await get("/api/pendle/markets").catch(() => null);
if (pendle)
  for (const m of pendle.markets)
    if (m.expired !== true)
      for (const t of new Set([m.tokens.yieldToken, m.tokens.asset]))
        if (!/^0x0{40}$/.test(t.address))
          tokens.push({
            explorer: "pendle",
            chain: 1,
            token: t.address.toLowerCase(),
            symbol: t.symbol ?? null,
            live: true,
          });

const out = new Map();
for (const t of tokens) {
  const id = `${t.chain}:${t.token}`;
  const e = out.get(t.explorer) ?? { reads: new Set(), gaps: new Map() };
  e.reads.add(id);
  if (!priced.has(id) && !named.has(id) && !/^0x0{40}$/.test(t.token)) e.gaps.set(id, t.symbol);
  out.set(t.explorer, e);
}
if (process.env.JSON)
  console.log(JSON.stringify(Object.fromEntries([...out].map(([k, v]) => [k, Object.fromEntries(v.gaps)])), null, 2));
else
  for (const [explorer, e] of [...out].sort()) {
    console.log(`${explorer}: reads ${e.reads.size}, no page ${e.gaps.size}`);
    for (const [id, symbol] of e.gaps) console.log(`  ${id}${symbol ? ` ${symbol}` : ""}`);
  }
