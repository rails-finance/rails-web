// capture-llamalend-config-log — writes the fixture
// scripts/verify/fixtures/llamalend-config-log.json that verify-threshold-at-block.ts
// reads offline (rails-ops ui-jobs 328 step 8): each market's Controller
// setter logs (/api/chain/llamalend/config-log), and for each position below
// its rows (block, time, the discount its UserState stored), the event-state
// read's stored discount and health at the last event of each day, and the
// same read at each liquidation discount change inside the life.
//
//   BASE=http://localhost:3049 node scripts/verify/capture-llamalend-config-log.mjs
//
// Needs a dev server with the RPC env and RAILS_API_URL set.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3049";
const POSITIONS = [
  // crvUSD WETH mint market: 6 % → 9.21 % on 11 Dec 2025, taken at a later borrow.
  {
    name: "0x6bda",
    controller: "0xa920de414ea4ab66b97da1bfe9e6eca7d4219635",
    user: "0x6bda04643f10782308515650dcfb05c672266332",
  },
  // CRV lend market: 8 % → 12 % on 23 Nov 2025, taken at the next borrow.
  {
    name: "0x3722",
    controller: "0xeda215b7666936ded834f76f3fbc6f323295110a",
    user: "0x37223d079dedc6a96d6415ee4850748d226ee5bf",
  },
  // The same market: kept 8 % to its close.
  {
    name: "0x37b1",
    controller: "0xeda215b7666936ded834f76f3fbc6f323295110a",
    user: "0x37b1884205cc47c2bf5cf5a0248946c4c0c85724",
  },
  // crvUSD sfrxETH (the first mint market): no setter log in its life.
  {
    name: "0x1109",
    controller: "0x8472a9a7632b173c8cf3a86d3afec50c35548e76",
    user: "0x1109297e392d92c1613fdbdf30579a0215c20da9",
  },
];
const DAY_S = 86_400;
const MAX_DAYS = 60;

async function json(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const logs = {};
for (const c of new Set(POSITIONS.map((p) => p.controller)))
  logs[c] = await json(`/api/chain/llamalend/config-log?controller=${c}`);

const readAt = async (p, block) => {
  const s = await json(`/api/chain/llamalend/event-state?controller=${p.controller}&user=${p.user}&block=${block}`);
  const a = s.after;
  return { block, hasLoan: a.hasLoan, discountRaw: a.liquidationDiscountRaw, healthRaw: a.healthRaw };
};

const positions = [];
for (const p of POSITIONS) {
  const t = await json(`/api/llamalend/timeline?controller=${p.controller}&user=${p.user}`);
  if (t.events.length < t.totalEvents) throw new Error(`${p.name}: the timeline is not whole`);
  const rows = t.events
    .filter((e) => e.context?.data?.role !== "liquidator")
    .map((e) => ({
      block: e.blockNumber,
      ts: e.timestamp,
      discountRaw: e.context?.data?.raw?.liquidationDiscount ?? null,
    }))
    .sort((a, b) => a.block - b.block);
  const lastByDay = new Map();
  for (const r of rows)
    lastByDay.set(Math.floor(r.ts / DAY_S), Math.max(lastByDay.get(Math.floor(r.ts / DAY_S)) ?? 0, r.block));
  const picks = [...lastByDay.values()].sort((a, b) => a - b).slice(-MAX_DAYS);
  const reads = {};
  for (const b of picks) reads[String(b)] = await readAt(p, b);
  // The stored discount at each liquidation discount change inside the life.
  const log = logs[p.controller];
  const atChanges = {};
  for (const s of log.sets ?? [])
    if (s.kind === "discounts" && s.block > rows[0].block) atChanges[String(s.block)] = await readAt(p, s.block);
  positions.push({ ...p, rows, reads, atChanges });
  console.log(`${p.name}: ${rows.length} rows, ${picks.length} reads, ${Object.keys(atChanges).length} change reads`);
}

const out = join(import.meta.dirname, "fixtures", "llamalend-config-log.json");
writeFileSync(
  out,
  `${JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), logs, positions }, null, 1)}\n`,
);
console.log(`wrote ${out}`);
