// Builds scripts/verify/fixtures/polaris-flows.json for verify-polaris-flows.ts:
// each CDP's rails-server /api/polaris/timeline rows (off victoria, through
// `victoria-ops.sh fetch`) and the page's live read of it
// (/api/chain/polaris/position on a local dev server, BASE).
//
//   BASE=http://localhost:3931 npx tsx scripts/verify/build-polaris-flows-fixture.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3931";
export const POLARIS_FLOW_POSITIONS: { name: string; market: "usdp" | "goldp"; id: string }[] = [
  { name: "closed-repaid", market: "usdp", id: "27376" },
  { name: "closed-settled", market: "usdp", id: "2736" },
  { name: "open-interest", market: "usdp", id: "2420" },
  { name: "liquidated", market: "usdp", id: "31477" },
  { name: "liquidated-settled", market: "usdp", id: "2266" },
  { name: "settled-often", market: "usdp", id: "6051" },
  { name: "goldp-open", market: "goldp", id: "1763" },
  { name: "goldp-liquidated", market: "goldp", id: "29" },
  { name: "busiest", market: "usdp", id: "8" },
];

async function main() {
  const fixtures = [];
  for (const p of POLARIS_FLOW_POSITIONS) {
    const raw = execFileSync(
      join(homedir(), ".claude/bin/victoria-ops.sh"),
      ["fetch", `/api/polaris/timeline?market=${p.market}&id=${p.id}`],
      { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] },
    );
    // The fetch prints the body, then the status and the time on a last line.
    const body = raw.slice(0, raw.lastIndexOf("}") + 1);
    const resp = JSON.parse(body) as { rows: unknown[]; totalEvents: number };
    const r = await fetch(`${BASE}/api/chain/polaris/position?market=${p.market}&id=${p.id}`);
    if (!r.ok) throw new Error(`chain ${r.status}`);
    const chain = await r.json();
    if (chain.chainStale) throw new Error(`${p.name}: the live read is stale`);
    fixtures.push({ ...p, now: Math.floor(Date.now() / 1000), rows: resp.rows, totalEvents: resp.totalEvents, chain });
    console.log(p.name, resp.rows.length, "rows", chain.isOpen ? "open" : "closed");
  }
  writeFileSync(
    join(__dirname, "fixtures", "polaris-flows.json"),
    JSON.stringify({ read: new Date().toISOString(), fixtures }),
  );
}
main();
