// capture-fx-ratio-log — writes the fixture scripts/verify/fixtures/fx-ratio-log.json
// that verify-threshold-at-block.ts reads offline (rails-ops ui-jobs 328 step 8):
// each f(x) pool's ratio setter logs (/api/chain/fx/ratio-log), and for each
// position below its timeline's event blocks and times and the two ratios the
// /api/chain/fx/event-state read gives at the last event of each day.
//
//   BASE=http://localhost:3048 node scripts/verify/capture-fx-ratio-log.mjs
//
// Needs a dev server with the RPC env and RAILS_API_URL set.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3048";
const POSITIONS = [
  { name: "wsteth-249", pool: "wsteth", id: "249" },
  { name: "wbtc-78", pool: "wbtc", id: "78" },
  { name: "wsteth-110", pool: "wsteth", id: "110" },
];
const DAY_S = 86_400;
const MAX_BLOCKS = 60;

async function json(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const logs = {};
for (const pool of ["wsteth", "wbtc"]) logs[pool] = await json(`/api/chain/fx/ratio-log?pool=${pool}`);

const positions = [];
for (const p of POSITIONS) {
  const t = await json(`/api/fx/position/${p.pool}/${p.id}/timeline`);
  if (t.events.length < t.totalEvents) throw new Error(`${p.name}: the timeline is not whole`);
  const events = t.events.map((e) => ({ block: e.blockNumber, ts: e.timestamp })).sort((a, b) => a.block - b.block);
  const lastByDay = new Map();
  for (const e of events)
    lastByDay.set(Math.floor(e.ts / DAY_S), Math.max(lastByDay.get(Math.floor(e.ts / DAY_S)) ?? 0, e.block));
  const picks = [...lastByDay.values()].sort((a, b) => a - b);
  const reads = {};
  for (let i = 0; i < picks.length; i += MAX_BLOCKS) {
    const part = picks.slice(i, i + MAX_BLOCKS);
    const s = await json(`/api/chain/fx/event-state?pool=${p.pool}&id=${p.id}&blocks=${part.join(",")}`);
    for (const b of part) {
      const r = s.reads[String(b)];
      reads[String(b)] = { block: b, liquidateLine: r?.liquidateLine ?? null, rebalanceLine: r?.rebalanceLine ?? null };
    }
  }
  positions.push({ ...p, events, reads });
  console.log(`${p.name}: ${events.length} events, ${picks.length} event days`);
}

const out = join(import.meta.dirname, "fixtures", "fx-ratio-log.json");
writeFileSync(
  out,
  `${JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), logs, positions }, null, 1)}\n`,
);
console.log(`wrote ${out}`);
