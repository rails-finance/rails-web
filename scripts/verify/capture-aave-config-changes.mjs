// capture-aave-config-changes — writes the fixture
// scripts/verify/fixtures/aave-config-changes.json that
// verify-threshold-at-block.ts reads offline (rails-ops ui-jobs 328 step 8):
// for each Aave V3 Ethereum, SparkLend, Aave V3 Base and Seamless position
// below, every position-state read its health view made (the picks and the
// change blocks, each answer cut to its thresholds), the account's e-mode
// switches, the markers it drew, and each market's configurator log answer
// (/api/chain/aave-v3/config-log).
//
//   BASE=http://localhost:3046 node scripts/verify/capture-aave-config-changes.mjs
//   ONLY=spark-0xc277,…  re-captures those and keeps the rest of the file.
//   PROBE=spark:0xc277…,core:0xfb93…  prints what those pages draw and writes nothing.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3046";
const pos = (name, market, wallet) => ({ name, market, wallet });
export const POSITIONS = [
  // Aave V3 Ethereum: Core open with five reserve changes; liquidated, a
  // change today; an e-mode life across twelve category changes (closed);
  // Prime in e-mode and EtherFi with none.
  pos("core-0xfb93", "core", "0xfb9395e0b216823c9a60d5dfcb8c6ef458232a71"),
  pos("core-0xfb45", "core", "0xfb45f0e612424104753f2e2fc9507b3d082e750a"),
  pos("core-0xbc67", "core", "0xbc67df7a724e076a26e25e37648974dd99659be1"),
  pos("prime-0xb8a4", "prime", "0xb8a451107a9f87fde481d4d686247d6e43ed715e"),
  pos("etherfi-0x0f2a", "etherfi", "0x0f2a32f4f54ec9d52a193e9e3493fb5fea86cbbe"),
  // SparkLend: open, closed and liquidated across 25 Aug 2025; in e-mode
  // (the reserve change moves nothing); two changes; no debt; none.
  pos("spark-0x79af", "spark", "0x79afe1676d49833ebe34302ac4a9f399454f17aa"),
  pos("spark-0xd914", "spark", "0xd9147bd9e9466036bc2897747bce3c9e13463090"),
  pos("spark-0xc277", "spark", "0xc277fb4f5a255baa4bdde06cac209c0df02dad14"),
  pos("spark-0xb3ca", "spark", "0xb3ca090080db699aaf8f1b9a9a50de5d9e6c4cc1"),
  pos("spark-0x070b", "spark", "0x070b8d1f8b63eba95db31c8e85ba536b3474b113"),
  pos("spark-0x1601", "spark", "0x1601843c5e9bc251a3272907010afa41fa18347e"),
  pos("spark-0xd540", "spark", "0xd540381d0fe111f0c4e9afd9afc3e8027c9fd037"),
  // Aave V3 on Base: closed across 1 Oct 2024; liquidated across two USDC
  // changes; none.
  pos("base-0x0768", "base", "0x0768d604c7df2571a83402e39a1cabbe25d89cc9"),
  pos("base-0x12a2", "base", "0x12a2c0158ab1687e2fc1d6ded61a12456fdaf24e"),
  pos("base-0xe883", "base", "0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8"),
  // Seamless: open, closed and liquidated across 5 Dec 2024; none.
  pos("seamless-0x8182", "seamless", "0x818214d3494fbc4be4f450c50677e55987804206"),
  pos("seamless-0x004e", "seamless", "0x004ec6d1aee69c292e2598be595d7e71005975d4"),
  pos("seamless-0x014b", "seamless", "0x014bee08fc25a334c5f1a94d42ad077c9020d557"),
  pos("seamless-0xcdeb", "seamless", "0xcdeb3461dce9b17a5d28893f44141c4e695b68d1"),
];

export const pathOf = (p) =>
  p.market === "spark"
    ? `/ethereum/spark/${p.wallet}`
    : p.market === "base"
      ? `/base/aave-v3/${p.wallet}`
      : p.market === "seamless"
        ? `/base/seamless/${p.wallet}`
        : `/ethereum/aave-v3/${p.wallet}?market=${p.market}`;

const READ_PATHS = new Set([
  "/api/aave-v3/position-state",
  "/api/chain/aave-v3/position-state",
  "/api/chain/spark/position-state",
  "/api/chain/aave-v3-base/position-state",
  "/api/chain/seamless/position-state",
]);

/** A position-state answer cut to what the health view takes from it. */
const cut = (s) => ({
  block: s.block,
  ts: s.blockTimestamp,
  txHash: s.txHash,
  emode: s.emode?.after ?? 0,
  categories: Object.fromEntries(
    Object.entries(s.emode?.categories ?? {}).map(([k, c]) => [k, { label: c.label, lt: c.liquidationThresholdBps }]),
  ),
  reserves: (s.reserves ?? []).map((r) => ({
    reserve: r.reserve,
    symbol: r.symbol,
    lt: r.liquidationThresholdBps,
    inEmode: r.inEmode,
    collateral: !!r.collateral?.after,
    supplied: r.supply?.after !== "0",
    owed: r.debt?.after !== "0",
  })),
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const FILE = join(import.meta.dirname, "fixtures", "aave-config-changes.json");
  const probe = process.env.PROBE
    ? process.env.PROBE.split(",").map((x) => {
        const [market, wallet] = x.split(":");
        return { name: `${market}-${wallet.slice(0, 6)}`, market, wallet: wallet.toLowerCase() };
      })
    : null;
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  const out = only
    ? JSON.parse(readFileSync(FILE, "utf8"))
    : { capturedAt: new Date().toISOString().slice(0, 10), logs: {}, positions: [] };
  if (only) out.positions = out.positions.filter((x) => !only.has(x.name) && POSITIONS.some((p) => p.name === x.name));
  const browser = await chromium.launch();
  for (const p of probe ?? POSITIONS.filter((x) => !only || only.has(x.name))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("rails-flows-view-v1", "full");
      } catch {}
    });
    const page = await ctx.newPage();
    const reads = {};
    let switches = null;
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (READ_PATHS.has(u.pathname) && r.ok()) {
        try {
          const s = await r.json();
          reads[`${s.block}:${s.txHash}`] = { route: u.pathname, ...cut(s) };
        } catch {}
      }
      if (u.pathname.endsWith("/account-switches") && r.ok()) {
        try {
          switches = (await r.json()).emode;
        } catch {}
      }
      if (u.pathname === "/api/chain/aave-v3/config-log" && r.ok()) {
        try {
          out.logs[p.market] = await r.json();
        } catch {}
      }
    });
    await page.goto(BASE + pathOf(p), { waitUntil: "domcontentloaded", timeout: 240000 });
    await page
      .waitForFunction(
        () =>
          document
            .querySelector("[data-price-heading] [data-price-picker]")
            ?.getAttribute("aria-label")
            ?.includes("Health factor"),
        null,
        { timeout: 180000 },
      )
      .catch(() => {});
    // The change reads land after the picks' view.
    await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 15000));
    const drawn = await page.evaluate(() => ({
      life: (document.querySelector("[data-flows-combined] [data-flow-pips]")?.getAttribute("data-flow-life") ?? "")
        .split("-")
        .map(Number),
      markers: [...document.querySelectorAll("[data-flows-combined] [data-flow-change]")].map((m) => ({
        days: (m.getAttribute("data-flow-change-days") ?? "").split(",").map(Number),
        blocks: (m.getAttribute("data-flow-change-blocks") ?? "").split(",").filter(Boolean).map(Number),
        label: m.querySelector("button")?.getAttribute("aria-label") ?? "",
      })),
    }));
    out.positions.push({
      ...p,
      path: pathOf(p),
      switches: switches ?? [],
      reads: Object.values(reads).sort((a, b) => a.block - b.block),
      ...drawn,
    });
    console.log(p.name, Object.keys(reads).length, "reads", drawn.markers.length, "markers", drawn.life.join("-"));
    for (const m of drawn.markers) console.log("   ", m.blocks.join(","), m.label.slice(0, 160));
    if (probe)
      for (const r of Object.values(reads).sort((a, b) => a.block - b.block))
        console.log(
          "    read",
          r.block,
          new Date(r.ts * 1000).toISOString().slice(0, 10),
          r.route.split("/").slice(-2, -1)[0],
          `emode ${r.emode}`,
          r.reserves
            .filter((x) => x.collateral || x.owed)
            .map((x) => `${x.symbol}${x.collateral ? `:${x.inEmode ? "E" : ""}${x.lt}` : ""}${x.owed ? ":debt" : ""}`)
            .join(" "),
        );
    await ctx.close();
  }
  await browser.close();
  if (probe) process.exit(0);
  out.positions.sort(
    (a, b) => POSITIONS.findIndex((p) => p.name === a.name) - POSITIONS.findIndex((p) => p.name === b.name),
  );
  writeFileSync(FILE, JSON.stringify(out) + "\n");
}
