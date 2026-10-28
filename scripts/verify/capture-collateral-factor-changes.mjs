// capture-collateral-factor-changes — writes the fixture
// scripts/verify/fixtures/collateral-factor-changes.json that
// verify-threshold-at-block.ts reads offline (rails-ops ui-jobs 328 step 8):
// for each Compound V2, Moonwell and Compound V3 position below, every factor
// read its page made (the picks and the change blocks, each answer as the
// route gave it, with the block's time), the markers it drew, and the setter
// log answer of each Comptroller and Comet the positions use.
//
//   BASE=http://localhost:3043 node scripts/verify/capture-collateral-factor-changes.mjs
//   ONLY=cv3-arb-0x6ed2,…  re-captures those and keeps the rest of the file.
//
// Needs a dev server with the RPC env set; reads block times through it.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3043";
export const POSITIONS = [
  // Compound V3 on Ethereum: open, two wstETH upgrades between its events;
  // no change in the life; closed after the first of the two.
  {
    name: "cv3-eth-0x072f",
    family: "comet",
    deployment: "ethereum",
    market: "usdc",
    wallet: "0x072fc633b8546af8e2a242b36697267835734076",
  },
  {
    name: "cv3-eth-0xc5cd",
    family: "comet",
    deployment: "ethereum",
    market: "usdc",
    wallet: "0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46",
  },
  {
    name: "cv3-eth-0x7829",
    family: "comet",
    deployment: "ethereum",
    market: "usdc",
    wallet: "0x782949470ddd695ce5cf506a2faff476ffdf6799",
  },
  // Compound V3 on Base and Arbitrum.
  {
    name: "cv3-base-0xefc0",
    family: "comet",
    deployment: "base",
    market: "weth",
    wallet: "0xefc0fb279858c1f77373f13b36adb5b1171ddea1",
  },
  {
    name: "cv3-base-0xb4f7",
    family: "comet",
    deployment: "base",
    market: "usdbc",
    wallet: "0xb4f73453748396bf3a1c99b860d9932477807fa4",
  },
  {
    name: "cv3-base-0x2f42",
    family: "comet",
    deployment: "base",
    market: "usdc",
    wallet: "0x2f42b066069945a71100aef832afdbe14d954e4b",
  },
  {
    name: "cv3-arb-0x6ed2",
    family: "comet",
    deployment: "arbitrum",
    market: "usdc",
    wallet: "0x6ed20ad6824302825bc92573f65c286f27e75a4e",
  },
  {
    name: "cv3-arb-0x13ad",
    family: "comet",
    deployment: "arbitrum",
    market: "usdc",
    wallet: "0x13adb56198ea3e0789c28a5528c07b4d5d674ce3",
  },
  // Compound V2: open, many changes; liquidated; a life after the last change.
  {
    name: "cv2-0x6217",
    family: "ctoken",
    protocol: "compound-v2",
    wallet: "0x6217c008da6ea46b6db500695287d77d03f79a42",
  },
  {
    name: "cv2-0xb074",
    family: "ctoken",
    protocol: "compound-v2",
    wallet: "0xb07421eecdb730794b3a7e76e54e7683c3687d8b",
  },
  {
    name: "cv2-0x0f8e",
    family: "ctoken",
    protocol: "compound-v2",
    wallet: "0x0f8e3711c5be6f91fb86e54d148b0efffc82b0e0",
  },
  // Moonwell: Ethereum (no factor has moved since listing); Base open with
  // one day of changes, underwater with many, closed.
  {
    name: "mw-eth-0x33a7",
    family: "ctoken",
    protocol: "moonwell",
    wallet: "0x33a7ec1055edd4cc35ef289156c7a7a078043474",
  },
  {
    name: "mw-base-0x98b8",
    family: "ctoken",
    protocol: "moonwell-base",
    wallet: "0x98b8d0621c1a79dcfc5a65d01abf9cfdd46aeb7a",
  },
  {
    name: "mw-base-0x2d7a",
    family: "ctoken",
    protocol: "moonwell-base",
    wallet: "0x2d7a6b617f11b6755bfd3ab79f1d7cb963ff9e9c",
  },
  {
    name: "mw-base-0x54ec",
    family: "ctoken",
    protocol: "moonwell-base",
    wallet: "0x54ecb3397b0bf31cb0b81eb2444e2a7b32507d8b",
  },
];

export const pathOf = (p) =>
  p.family === "comet"
    ? `/${p.deployment}/compound-v3/${p.market}/${p.wallet}`
    : p.protocol === "compound-v2"
      ? `/ethereum/compound-v2/${p.wallet}`
      : p.protocol === "moonwell"
        ? `/ethereum/moonwell/${p.wallet}`
        : `/base/moonwell/${p.wallet}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const FILE = join(import.meta.dirname, "fixtures", "collateral-factor-changes.json");
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  const out = only
    ? JSON.parse(readFileSync(FILE, "utf8"))
    : { capturedAt: new Date().toISOString().slice(0, 10), logs: {}, positions: [] };
  if (only) out.positions = out.positions.filter((x) => !only.has(x.name) && POSITIONS.some((p) => p.name === x.name));
  const browser = await chromium.launch();
  for (const p of POSITIONS.filter((x) => !only || only.has(x.name))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("rails-flows-view-v1", "full");
      } catch {}
    });
    const page = await ctx.newPage();
    const reads = {};
    let readUrl = null;
    page.on("response", async (r) => {
      const u = new URL(r.url());
      const isRead =
        u.pathname === "/api/chain/compound/factors-at-block" ||
        (u.pathname === "/api/chain/ctoken-liquidity-at" && u.searchParams.get("factors"));
      if (isRead && r.ok()) {
        const block = u.searchParams.get("block");
        u.searchParams.delete("block");
        readUrl = u.pathname + u.search;
        try {
          reads[block] = await r.json();
        } catch {}
      }
      if (
        (u.pathname === "/api/chain/compound/factor-log" || u.pathname === "/api/chain/ctoken-factor-log") &&
        r.ok()
      ) {
        const key = p.family === "comet" ? `${p.deployment}:${p.market}` : p.protocol;
        try {
          out.logs[key] = await r.json();
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
    await page.waitForTimeout(6000);
    const drawn = await page.evaluate(() => ({
      life: (document.querySelector("[data-flows-combined] [data-flow-pips]")?.getAttribute("data-flow-life") ?? "")
        .split("-")
        .map(Number),
      markers: [...document.querySelectorAll("[data-flows-combined] [data-flow-change]")].map((m) => ({
        days: (m.getAttribute("data-flow-change-days") ?? "").split(",").map(Number),
        label: m.querySelector("button")?.getAttribute("aria-label") ?? "",
      })),
    }));
    // Each read block's time, through the dev server's chain reads.
    const blocks = Object.keys(reads)
      .map(Number)
      .sort((a, b) => a - b);
    const chain =
      p.family === "comet"
        ? { ethereum: 1, base: 8453, arbitrum: 42161 }[p.deployment]
        : p.protocol === "moonwell-base"
          ? 8453
          : 1;
    const times = await blockTimes(chain, blocks);
    out.positions.push({
      ...p,
      path: pathOf(p),
      readUrl,
      reads: blocks.map((b) => ({ block: b, ts: times[b], answer: reads[String(b)] })),
      ...drawn,
    });
    console.log(p.name, blocks.length, "reads", drawn.markers.length, "markers", drawn.life.join("-"));
    await ctx.close();
  }
  await browser.close();
  out.positions.sort(
    (a, b) => POSITIONS.findIndex((p) => p.name === a.name) - POSITIONS.findIndex((p) => p.name === b.name),
  );
  writeFileSync(FILE, JSON.stringify(out) + "\n");
}

async function blockTimes(chainId, blocks) {
  const env = await import("node:fs").then((fs) =>
    fs.readFileSync(join(import.meta.dirname, "..", "..", ".env.local"), "utf8"),
  );
  const v = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "");
  const url = v(chainId === 1 ? "ALCHEMY_URL" : chainId === 8453 ? "BASE_RPC_URL" : "ARBITRUM_RPC_URL");
  const out = {};
  for (let i = 0; i < blocks.length; i += 50) {
    const batch = blocks.slice(i, i + 50).map((b, j) => ({
      jsonrpc: "2.0",
      id: j,
      method: "eth_getBlockByNumber",
      params: [`0x${b.toString(16)}`, false],
    }));
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    }).then((r) => r.json());
    for (const r of res) out[blocks[i + r.id]] = Number(r.result.timestamp);
  }
  return out;
}
