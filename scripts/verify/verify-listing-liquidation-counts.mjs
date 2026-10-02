// The listing's activity counters agree with the timeline where a liquidation
// is in play (rails-ops standards/detail-page-anatomy.md §2: the arrows count
// the position's transactions, the red triangle its liquidations).
//
//   node scripts/verify/verify-listing-liquidation-counts.mjs
//   BASE=http://localhost:3000 node scripts/verify/verify-listing-liquidation-counts.mjs
//
// LlamaLend: `txCount` on /api/llamalend/positions is the number of distinct
// transactions the position's timeline holds, hard liquidations included
// (rails-server mig 374). Checked on 0xa920…9635 / 0x1d73…3a3c (4) and on the
// first SAMPLE positions the "has liquidations" listing returns.
//
// f(x): `liquidationCount` on /api/fx/positions is the timeline's liquidation
// rows that moved something: every pool-wide Liquidate row, and each
// LiquidatePosition row that took collateral or repaid at least 0.000001
// fxUSD (rails-web lib/fx/row-figures.ts, fxLiquidationMoved; rails-server
// services/fx-liquidation-counts.ts). Checked on the twelve positions the
// pool-wide Liquidate reached, and the "Liquidated" filter lists all twelve.
//
// Wire only, no browser. Timeline reads carry `recent` so the Vercel Firewall's
// timeline rule does not apply (lib/host.mjs).

import { BASE, hostFetch } from "./lib/host.mjs";

const SAMPLE = Number(process.env.SAMPLE ?? 25);
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function json(path) {
  const r = await hostFetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// ── LlamaLend ───────────────────────────────────────────────────────────────
async function llamalendTimelineTxs(controller, user) {
  const tl = await json(`/api/llamalend/timeline?controller=${controller}&user=${user}&recent=500`);
  if (tl.cutoffBlock != null) return null; // windowed: the page does not hold the whole history
  // A row id is `kind:txhash:logIndex:leg`; a liquidator-leg row is the
  // subject acting on another position, not a row of this one.
  const own = tl.events.map((e) => String(e.id ?? "").split(":")).filter((p) => p[3] !== "liquidator");
  return new Set(own.map((p) => p[1]).filter(Boolean)).size;
}

{
  const FIX = {
    controller: "0xa920de414ea4ab66b97da1bfe9e6eca7d4219635",
    user: "0x1d737e0122c270c5fa476dab9038d05363ad3a3c",
  };
  const l = await json(`/api/llamalend/positions?controller=${FIX.controller}&user=${FIX.user}`);
  const row = l.data[0];
  check(
    "LlamaLend 0xa920…9635 / 0x1d73…3a3c: 4 transactions, 4 events",
    row?.txCount === 4 && row?.eventCount === 4,
    `txCount ${row?.txCount}, eventCount ${row?.eventCount}`,
  );

  const page = await json(`/api/llamalend/positions?hasLiquidations=true&limit=${SAMPLE}`);
  let agree = 0;
  const off = [];
  let skipped = 0;
  for (const r of page.data) {
    const txs = await llamalendTimelineTxs(r.controller, r.user);
    if (txs == null) {
      skipped++;
      continue;
    }
    if (txs === r.txCount) agree++;
    else off.push(`${r.controller.slice(0, 6)}/${r.user.slice(0, 6)} listing ${r.txCount} timeline ${txs}`);
  }
  check(
    `LlamaLend: txCount equals the timeline's transactions on ${page.data.length - skipped} liquidated positions`,
    off.length === 0 && agree > 0,
    off.slice(0, 3).join("; ") || `${agree} agree, ${skipped} windowed`,
  );
}

// ── f(x) ────────────────────────────────────────────────────────────────────
const MOVED_FLOOR = 1e-6;
function fxCounted(d) {
  if (d.eventType !== "liquidation") return false;
  if (d.poolWide) return true;
  const colls = Number(d.liqColls ?? "0") || 0;
  const repaid = (Number(d.liqFxusdDebts ?? "0") || 0) + (Number(d.liqStableDebts ?? "0") || 0);
  return colls > 0 || repaid >= MOVED_FLOOR;
}

{
  const named = [154, 308, 302, 215, 116, 294, 159, 143, 174, 169, 209, 136];
  const liquidated = await json(`/api/fx/positions?pools=wsteth&status=liquidated&limit=500`);
  const listed = new Map(liquidated.data.map((r) => [Number(r.positionId), r]));
  const missing = named.filter((id) => !listed.has(id));
  check(
    "f(x): the Liquidated filter lists all twelve positions the pool-wide Liquidate reached",
    missing.length === 0,
    missing.join(","),
  );

  const off = [];
  for (const id of named) {
    const row = (await json(`/api/fx/positions?pools=wsteth&positionId=${id}`)).data[0];
    const tl = await json(`/api/fx/position/wsteth/${id}/timeline?recent=500`);
    const counted = tl.events.filter((e) => fxCounted(e.context.data)).length;
    if (row?.liquidationCount !== counted || row?.everLiquidated !== true || tl.position.liquidationCount !== counted)
      off.push(`#${id} listing ${row?.liquidationCount} card ${tl.position.liquidationCount} timeline ${counted}`);
  }
  check(
    "f(x): listing and card liquidation counts equal the timeline's on the twelve",
    off.length === 0,
    off.slice(0, 4).join("; "),
  );

  const p154 = (await json(`/api/fx/positions?pools=wsteth&positionId=154`)).data[0];
  check(
    "f(x) wsteth-154: 3 liquidations (two LiquidatePosition, one pool-wide; the 2,477-wei call is not counted)",
    p154?.liquidationCount === 3,
    `${p154?.liquidationCount}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed  (${BASE})`);
process.exit(fail ? 1 : 0);
