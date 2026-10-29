// capture-maker-feed-log — writes the fixture
// scripts/verify/fixtures/maker-feed-log.json that verify-threshold-at-block.ts
// reads offline (rails-ops ui-jobs 328 step 8): each ilk's price feed log
// (/api/chain/makerdao/feed-log), and for each vault below its rows' blocks
// and times, and the daily store's close of `maker:<ILK>` over its life
// (/api/prices/daily), the price the chart draws the collateral ratio from.
//
//   BASE=http://localhost:3050 node scripts/verify/capture-maker-feed-log.mjs
//
// Needs a dev server with RAILS_API_URL set.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3050";
const VAULTS = [
  // ETH-A, open since 2019: the ETH OSM's source Median ETHUSD → Chronicle ETH/USD (24 Mar 2025).
  { name: "2028", vault: "2028" },
  // WBTC-A, liquidated 5 Jun 2026: the WBTC OSM's source Median BTCUSD → Chronicle BTC/USD (14 Jan 2025).
  { name: "31489", vault: "31489" },
  // LSEV2-SKY-A: PIP_SKY → LOCKSTAKE_ORACLE capped at $0.04 (8 Oct 2025), the cap to $0.025 (15 Dec 2025).
  { name: "0x6a01", vault: "0x6a010b5eae917d9e1d3b21e8129f8846f39c8c41" },
  // UNIV2USDCETH-A: the LP oracle replaced (12,503,924, 25 May 2021), the same chainlog key.
  { name: "23227", vault: "23227" },
  // ETH-A, a 2025 life after the source change: none.
  { name: "31951", vault: "31951" },
  // LSEV2-SKY-A, opened after the last cap set: none.
  { name: "0x365f", vault: "0x365f19fdce38310e2b20ee977eafaa3b02a65e83" },
];
const DAY_S = 86_400;

async function json(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const vaults = [];
const logs = {};
for (const v of VAULTS) {
  const t = await json(`/api/makerdao/vault/${v.vault}/timeline`);
  if (t.events.length < t.totalEvents) throw new Error(`${v.name}: the timeline is not whole`);
  const rows = t.events.map((e) => ({ block: e.blockNumber, ts: e.timestamp })).sort((a, b) => a.block - b.block);
  logs[t.ilk] ??= await json(`/api/chain/makerdao/feed-log?ilk=${t.ilk}`);
  const from = Math.floor(rows[0].ts / DAY_S);
  const daily = await json(`/api/prices/daily?chain=1&series=maker:${t.ilk}&from=${from}`);
  const s = daily.series?.[`maker:${t.ilk}`];
  const closes = (s?.obs ?? []).map(([day, raw, , unit, scale]) => [day, Number(raw) / 10 ** (scale ?? s.scale)]);
  const last = [...t.events].sort((a, b) => a.blockNumber - b.blockNumber).at(-1);
  const d = last?.context?.data ?? {};
  const open = Number(d.inkAfter ?? 0) > 0 || Number(d.artAfter ?? 0) > 0;
  vaults.push({ ...v, ilk: t.ilk, open, rows, closes });
  console.log(`${v.name} ${t.ilk} (${open ? "open" : "closed"}): ${rows.length} rows, ${closes.length} closes`);
}

const out = join(import.meta.dirname, "fixtures", "maker-feed-log.json");
writeFileSync(out, `${JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), logs, vaults })}\n`);
console.log(`wrote ${out}`);
