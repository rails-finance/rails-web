// Builds scripts/verify/fixtures/fx-flows.json for verify-fx-flows.ts: each
// position's /api/fx/position/:pool/:id/timeline answer (off victoria, through
// `victoria-ops.sh fetch`), the page's /api/chain/fx/event-state reads at the
// blocks the replay needs (a local dev server, BASE), and the pool's settled
// read with the anchor price at its block.
//
//   BASE=http://localhost:3951 npx tsx scripts/verify/build-fx-flows-fixture.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildFxTimeline, type RawFxTimelineResponse } from "@/lib/sources/api/fx-timeline";
import { fxFlowReadBlocks, fxFlowRows } from "@/lib/fx/flows";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";

const BASE = process.env.BASE ?? "http://localhost:3951";
const POSITIONS: { name: string; pool: "wsteth" | "wbtc"; id: string }[] = [
  { name: "closed-withdrawn", pool: "wbtc", id: "760" },
  { name: "open-funding", pool: "wsteth", id: "249" },
  { name: "liquidated-closed", pool: "wsteth", id: "137" },
  { name: "liquidated-many", pool: "wsteth", id: "120" },
  { name: "redemptions", pool: "wsteth", id: "243" },
  { name: "pool-rebalances", pool: "wbtc", id: "484" },
  { name: "pool-liquidation", pool: "wsteth", id: "209" },
  { name: "busiest", pool: "wsteth", id: "348" },
];

async function reads(pool: string, id: string, blocks: number[], prices: boolean): Promise<Record<string, FxStateAt>> {
  const out: Record<string, FxStateAt> = {};
  for (let i = 0; i < blocks.length; i += 60) {
    const q = new URLSearchParams({
      pool,
      id,
      blocks: blocks.slice(i, i + 60).join(","),
      ...(prices ? { prices: "1" } : {}),
    });
    const r = await fetch(`${BASE}/api/chain/fx/event-state?${q}`);
    if (!r.ok) throw new Error(`event-state ${r.status}`);
    Object.assign(out, ((await r.json()) as { reads: Record<string, FxStateAt> }).reads);
  }
  return out;
}

async function main() {
  const fixtures = [];
  for (const p of POSITIONS) {
    const raw = execFileSync(
      join(homedir(), ".claude/bin/victoria-ops.sh"),
      ["fetch", `/api/fx/position/${p.pool}/${p.id}/timeline`],
      {
        encoding: "utf8",
        maxBuffer: 64 << 20,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const resp = JSON.parse(raw) as RawFxTimelineResponse;
    const t = buildFxTimeline(resp);
    const rows = fxFlowRows(t.events);
    const need = fxFlowReadBlocks(rows);
    const r = { ...(await reads(p.pool, p.id, need.own, false)), ...(await reads(p.pool, p.id, need.social, true)) };
    const pos = t.position!;
    let live: { price: number | null; coll: number | null; debt: number | null } | null = null;
    if (pos.status === "open" && pos.settled.block != null) {
      const at = await reads(p.pool, p.id, [pos.settled.block], true);
      const a = at[String(pos.settled.block)];
      live = {
        price: a?.anchorPrice != null ? Number(a.anchorPrice) / 1e18 : null,
        coll: pos.settled.colls,
        debt: pos.settled.debts,
      };
    }
    fixtures.push({ ...p, status: pos.status, now: Math.floor(Date.now() / 1000), resp, reads: r, live });
    console.log(p.name, t.events.length, "rows", need.own.length, "+", need.social.length, "blocks");
  }
  writeFileSync(
    join(__dirname, "fixtures", "fx-flows.json"),
    JSON.stringify({ read: new Date().toISOString(), fixtures }),
  );
}
main();
