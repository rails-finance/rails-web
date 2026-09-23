#!/usr/bin/env node
// Aave V4 — the price a timeline row states is the feed's row AT THE EVENT'S
// BLOCK, read by key, and the closed cards' peaks are valued the same way.
// ----------------------------------------------------------------------------
// Server migration 207 removed
// the three price joins from mv_aave_v4_events (40–75 min a refresh, and a
// source precedence that handed the closed-card peaks a May 2026 weETH row);
// every V4 price now comes from ONE read — the newest in-window row of
// aave_v4_historic_prices for (asset, block), on-chain sources only — and the
// wire names the block of the row it came from (`price.block`).
//
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN READ. For each fixture row the
// script reads the Aave V4 oracle ITSELF — the spoke AaveOracle's
// getReservePrice(reserveId), pinned to the row's block — and compares the
// wire's `usd` and its source `iaave-oracle` (Miles, 2026-09-22: Rails states
// the protocol's oracle price, server migration 314). The (oracle, reserve id)
// pairs below are copied by hand from
// rails-server-onboarding/api/src/services/aave-v4-oracle-registry.json and
// are a fixture of this script: if the registry ever changes one, this script
// goes red rather than following it. The peak check replays the server's
// stated rule over the timeline JSON without importing it.
//
// Fail-first (recorded in the plan's §9): against production BEFORE the server
// change, P1's `block` field is absent (red) and P5 reads 21,344.52 against
// 25,122.55 (red). After the change every line is green or a stated SKIP.
//
//   BASE=https://rails-web-onboarding.vercel.app node scripts/verify/verify-aave-v4-price-stamp.mjs
//
// Needs ALCHEMY_URL in .env.local (archive reads at blocks days old). Prints
// lane NAMES only, never a URL.

import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3801";
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });
console.log(`\n── aave v4 price stamp · ${BASE} ──`);
console.log(`   lane: ALCHEMY_URL present (name only; no URL is printed)\n`);

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3, timeout: 90_000 }),
});
const V4_ORACLE_ABI = parseAbi(["function getReservePrice(uint256 reserveId) view returns (uint256)"]);

// ── The V4 oracle reads — a FIXTURE of this script (hand-copied from the registry) ──
// Each spoke has its own AaveOracle (Spoke.ORACLE()); the source per asset is
// the same on every spoke that lists it, so one spoke's oracle answers.
const MAIN = "0x99B2B6CEa9C3D2fd8F4d90f86741C44B212a6127";
const ETHENA_CORR = "0x9b91a0943CADf554742E8Fb358B1cC4ae4F85F01";
const KELP = "0x37C316996C714Bf906743071e04E62220b3271ac";
const LOMBARD = "0x198Cac7f54FFc7d709Ac0FEc4B6454CE73e21D3D";
const GOLD = "0x0083421fd178749af2201ddA5A7C3feB5790B80c";
const USDG_PENDLE = "0x692cD2F7653680aFf316Ac309ce825FCF573B7Ee";
const v4 = (oracle, reserveId) => ({ source: "iaave-oracle", oracle, reserveId });
const FEEDS = {
  WETH: v4(MAIN, 0),
  wstETH: v4(MAIN, 1),
  weETH: v4(MAIN, 2),
  WBTC: v4(MAIN, 3),
  cbBTC: v4(MAIN, 4),
  AAVE: v4(MAIN, 5),
  LINK: v4(MAIN, 6),
  USDC: v4(MAIN, 7),
  USDT: v4(MAIN, 8),
  EURC: v4(MAIN, 9),
  RLUSD: v4(MAIN, 10),
  USDG: v4(MAIN, 11),
  frxUSD: v4(MAIN, 12),
  GHO: v4(MAIN, 13),
  "PT-USDe-7MAY2026": v4(ETHENA_CORR, 0),
  "PT-sUSDE-7MAY2026": v4(ETHENA_CORR, 1),
  sUSDe: v4(ETHENA_CORR, 2),
  USDe: v4(ETHENA_CORR, 3),
  rsETH: v4(KELP, 0),
  LBTC: v4(LOMBARD, 0),
  XAUt: v4(GOLD, 0),
  "PT-USDG-24SEP2026": v4(USDG_PENDLE, 0),
};
/** The registry names PT-sUSDE by its short symbol on the wire in one spoke
 *  and the dated one in another; both map to the same market. */
const SYMBOL_ALIAS = { "PT-sUSDE": "PT-sUSDE-7MAY2026" };

// ── Fixtures (pinned from mv_aave_v4_events on 2026-09-09) ──
const F = {
  F1: {
    wallet: "0x142a1690671db35337b3ed8007aa9c6e90b5f439",
    block: 25_938_775,
    eventType: "supply",
    symbol: "weETH",
    why: "weETH supply — a ratio adapter behind the oracle; the row the old view priced at May's 2,331.56",
  },
  F2: {
    wallet: "0xa86ea08229bf4330f6483d5011f53a820c174f01",
    block: 25_938_003,
    eventType: undefined,
    symbol: "wstETH",
    why: "wstETH — a ratio adapter behind the oracle",
  },
  F3: {
    wallet: "0xe0e486c557191407245e84a529975dbda7cac47b",
    block: 25_896_670,
    eventType: undefined,
    symbol: undefined,
    why: "a Pendle PT in the usdg_pendle spoke — the oracle's linear discount",
  },
  F4: {
    wallet: "0x6488e012775e028d28ec865b4b8775d6fb6592d3",
    block: 25_923_138,
    eventType: "liquidation",
    txHash: "0x215b68691934b0a720cf07e20a90ab84908f7787cdd4b7032b42a10c2cdf996f",
    why: "a liquidation — both legs",
  },
  F5: {
    wallet: "0x838fd3923d6461bcde22e3d4907db3ddef7a6032",
    spokeName: "EtherFi",
    peakBlock: 25_929_791,
    peakSymbol: "weETH",
    why: "a closed weETH position — the peak the old view under-valued",
  },
  RLUSD: {
    wallet: "0x3d6991085ab1ae3926cb96f25684c40a364b6856",
    block: 25_931_117,
    why: "an RLUSD supply in the main spoke — in the registry since 2026-09-22 (server 7bf56da), priced at its block",
  },
};
const FRESHNESS_BLOCKS = 14_400;

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};
const n = (v) => Number(v).toLocaleString("en-US");

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.replace(BASE, "")}`);
  return res.json();
}
const timelines = new Map();
async function timeline(wallet) {
  if (!timelines.has(wallet)) {
    const json = await getJson(`${BASE}/api/aave-v4/timeline?wallet=${wallet}`);
    const events = (json.events ?? []).filter((e) => e.context?.protocol?.startsWith("aave-v4"));
    timelines.set(wallet, events);
  }
  return timelines.get(wallet);
}
const ctxOf = (e) => e.context?.data ?? {};

/** This script's OWN price for `symbol` at `block`: the V4 oracle's answer,
 *  8 decimals, as the lane stores it. */
async function ownPrice(symbolRaw, block) {
  const symbol = SYMBOL_ALIAS[symbolRaw] ?? symbolRaw;
  const f = FEEDS[symbol];
  if (!f) return null;
  const raw = await client.readContract({
    address: f.oracle,
    abi: V4_ORACLE_ABI,
    functionName: "getReservePrice",
    args: [BigInt(f.reserveId)],
    blockNumber: BigInt(block),
  });
  return { usd: Number(raw) / 1e8, source: f.source, symbol };
}
const close = (a, b, rel = 1e-8) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);

// ── P1: four fixture rows, price at the event's block == own read ──
async function p1(id, fx) {
  const events = await timeline(fx.wallet);
  let row = events.find(
    (e) =>
      e.blockNumber === fx.block &&
      (!fx.txHash || e.txHash.toLowerCase() === fx.txHash) &&
      (!fx.eventType || ctxOf(e).eventType === fx.eventType) &&
      (!fx.symbol || ctxOf(e).reserveSymbol === fx.symbol),
  );
  if (!row)
    return check(
      `${id} the fixture row is on the timeline`,
      false,
      `no row at block ${n(fx.block)} for ${fx.wallet} (${fx.why})`,
    );
  const ctx = ctxOf(row);
  if (ctx.eventType === "liquidation") {
    for (const [leg, sym, p] of [
      ["collateral", ctx.collateralSymbol, ctx.collateralPrice],
      ["debt", ctx.reserveSymbol, ctx.debtPrice],
    ]) {
      check(
        `${id}${leg[0]} ${leg} leg ${sym} carries a price with its row's block`,
        !!p && p.block === fx.block,
        p ? `usd ${p.usd} · source ${p.source} · block ${p.block ?? "absent"}` : "no price",
      );
      const own = p ? await ownPrice(sym, fx.block) : null;
      if (!own) skip(`${id}${leg[0]} own read for ${sym}`, "no feed pinned for this symbol");
      else
        check(
          `${id}${leg[0]} ${sym} at ${n(fx.block)} equals this script's read (${own.source})`,
          !!p && close(p.usd, own.usd) && p.source === own.source,
          `wire ${p?.usd} vs own ${own.usd}`,
        );
    }
    return;
  }
  const p = ctx.price;
  const sym = ctx.reserveSymbol;
  check(
    `${id}a ${sym} ${ctx.eventType} at ${n(fx.block)} carries a price with its row's block`,
    !!p && p.block === fx.block,
    p ? `usd ${p.usd} · source ${p.source} · block ${p.block ?? "absent"}` : "no price",
  );
  const own = await ownPrice(sym, fx.block);
  if (!own) return skip(`${id}b own read for ${sym}`, "no feed pinned for this symbol");
  check(
    `${id}b ${sym} at ${n(fx.block)} equals this script's read (${own.source})`,
    !!p && close(p.usd, own.usd) && p.source === own.source,
    `wire ${p?.usd} vs own ${own.usd}`,
  );
}

// ── P2: window + source discipline over every fixture timeline ──
async function p2() {
  let rows = 0,
    priced = 0,
    outOfWindow = 0,
    badSource = 0,
    future = 0,
    noBlock = 0;
  for (const fx of [F.F1, F.F2, F.F3, F.F4, F.F5, F.RLUSD]) {
    for (const e of await timeline(fx.wallet)) {
      const ctx = ctxOf(e);
      rows++;
      const prices = [
        ctx.price,
        ctx.collateralPrice,
        ctx.debtPrice,
        ...(ctx.allSupplies ?? []).map((i) => i.price),
        ...(ctx.allDebts ?? []).map((i) => i.price),
      ].filter(Boolean);
      for (const p of prices) {
        priced++;
        if (p.source === "stablecoin" || p.source === "defillama") badSource++;
        if (p.block == null) noBlock++;
        else if (p.block > e.blockNumber) future++;
        else if (e.blockNumber - p.block > FRESHNESS_BLOCKS) outOfWindow++;
      }
    }
  }
  check(
    "P2a every stated price names the block of its feed row",
    priced > 0 && noBlock === 0,
    `${n(priced)} prices on ${n(rows)} rows, ${n(noBlock)} without a block`,
  );
  check(
    "P2b no price is from after its event, or more than 14,400 blocks before it",
    future === 0 && outOfWindow === 0,
    `${future} after, ${outOfWindow} beyond the window`,
  );
  check("P2c no stablecoin pin or off-chain aggregate reaches the wire", badSource === 0, `${badSource} such prices`);
}

// ── P3: an RLUSD row states the oracle's price at its own block ──
// Until 2026-09-22 RLUSD was outside the registry and this check asserted the
// row stated NO price.
async function p3() {
  if (!F.RLUSD.wallet) return skip("P3 an RLUSD row is priced", "no RLUSD fixture pinned");
  const events = await timeline(F.RLUSD.wallet);
  const row = events.find((e) => e.blockNumber === F.RLUSD.block && ctxOf(e).reserveSymbol === "RLUSD");
  if (!row) return check("P3 the RLUSD fixture row is on the timeline", false, `none at ${n(F.RLUSD.block)}`);
  const p = ctxOf(row).price;
  check(
    `P3a the RLUSD row at ${n(F.RLUSD.block)} carries a price with its row's block`,
    !!p && p.block === F.RLUSD.block,
    p ? `usd ${p.usd} · source ${p.source} · block ${p.block ?? "absent"}` : "no price",
  );
  const own = await ownPrice("RLUSD", F.RLUSD.block);
  check(
    `P3b RLUSD at ${n(F.RLUSD.block)} equals this script's read (${own.source})`,
    !!p && close(p.usd, own.usd) && p.source === own.source,
    `wire ${p?.usd} vs own ${own.usd}`,
  );
}

// ── P4 + P5: the closed weETH position — snapshot items and the peaks ──
async function p45() {
  const events = await timeline(F.F5.wallet);
  const listing = await getJson(`${BASE}/api/aave-v4/spoke-positions?wallet=${F.F5.wallet}&status=closed`);
  const rowL = (listing.rows ?? []).find((r) => r.spokeName === F.F5.spokeName);
  if (!rowL)
    return check(
      "P4/P5 the closed fixture row is on the listing",
      false,
      `no closed ${F.F5.spokeName} row for ${F.F5.wallet}`,
    );
  const spokeEvents = events.filter((e) => ctxOf(e).spokeName === F.F5.spokeName);
  check(
    "P4a the closed position's spoke rows are on the timeline",
    spokeEvents.length >= 5,
    `${spokeEvents.length} rows in ${F.F5.spokeName}`,
  );
  // newest row: every snapshot item priced at the row's own block
  const newest = [...spokeEvents].sort((a, b) => b.blockNumber - a.blockNumber)[0];
  const items = [...(ctxOf(newest)?.allSupplies ?? []), ...(ctxOf(newest)?.allDebts ?? [])];
  const withPrice = items.filter((i) => i.price);
  if (!withPrice.length)
    skip(
      "P4b snapshot items on the newest row carry the row's block",
      "the newest row (a close) holds no non-zero item",
    );
  else
    check(
      "P4b every snapshot item on the newest row is priced at the row's own block",
      withPrice.every((i) => i.price.block === newest.blockNumber),
      `${withPrice.length} items at ${n(newest.blockNumber)}`,
    );

  // own read at the peak block for the peak asset
  const peakRow = spokeEvents.find(
    (e) =>
      e.blockNumber === F.F5.peakBlock && ctxOf(e).reserveSymbol === F.F5.peakSymbol && ctxOf(e).eventType === "supply",
  );
  const own = await ownPrice(F.F5.peakSymbol, F.F5.peakBlock);
  check(
    `P5a the ${F.F5.peakSymbol} supply at ${n(F.F5.peakBlock)} states this script's own price`,
    !!peakRow && !!ctxOf(peakRow).price && close(ctxOf(peakRow).price.usd, own.usd),
    `wire ${ctxOf(peakRow ?? {})?.price?.usd ?? "absent"} vs own ${own.usd}`,
  );

  // THE RULE (plan §2.2 + §3.2): replay the spoke's rows oldest-first; on every
  // row the moved reserve's running supply and debt are set from the row's
  // supplyAfter / debtAfter (a liquidation's supply side is the collateral
  // reserve, its debt side the debt reserve); a reserve's price is the row's
  // own price where the row states one, else the price at its last balance
  // change; the instant portfolio sums after each row; the peak is the max.
  // No live-price fallback: an unpriced reserve contributes 0.
  const asc = [...spokeEvents].sort((a, b) => a.blockNumber - b.blockNumber || 0);
  // Within a block the API serves rows in log order newest-first; reverse a
  // descending feed so same-block rows replay in the order they happened.
  const served = spokeEvents;
  if (served.length > 1 && served[0].blockNumber > served[served.length - 1].blockNumber) {
    asc.sort((a, b) => a.blockNumber - b.blockNumber || served.indexOf(b) - served.indexOf(a));
  }
  const runS = new Map(),
    runD = new Map(),
    price = new Map();
  let peakS = 0,
    peakD = 0;
  for (const e of asc) {
    const c = ctxOf(e);
    const liq = c.eventType === "liquidation";
    const sSym = liq ? c.collateralSymbol : c.reserveSymbol;
    const dSym = c.reserveSymbol;
    const sP = liq ? c.collateralPrice : c.price;
    const dP = liq ? c.debtPrice : c.price;
    if (sSym && c.supplyAfter != null) {
      if (sP?.usd > 0) price.set(sSym, sP.usd);
      runS.set(sSym, Number(c.supplyAfter));
    }
    if (dSym && c.debtAfter != null) {
      if (dP?.usd > 0) price.set(dSym, dP.usd);
      runD.set(dSym, Number(c.debtAfter));
    }
    let s = 0;
    for (const [sym, t] of runS) s += t * (price.get(sym) ?? 0);
    let d = 0;
    for (const [sym, t] of runD) d += t * (price.get(sym) ?? 0);
    if (s > peakS) peakS = s;
    if (d > peakD) peakD = d;
  }
  check(
    "P5b the listing's peakSupplyUsd is the rule's replay over the rows' own prices",
    Math.abs(rowL.peakSupplyUsd - peakS) <= 0.01,
    `listing ${rowL.peakSupplyUsd} vs replay ${peakS.toFixed(2)}`,
  );
  check(
    "P5c the listing's peakDebtUsd is the rule's replay over the rows' own prices",
    Math.abs(rowL.peakDebtUsd - peakD) <= 0.01,
    `listing ${rowL.peakDebtUsd} vs replay ${peakD.toFixed(2)}`,
  );
  // 25,134.99 = the peak balance (25,122.55 / 2,744.25657624, the composed
  // weETH/ETH × ETH/USD the lane stored until migration 314) × the V4
  // oracle's weETH at the block, 2,745.61521913.
  check(
    "P5d the peak supply is the oracle's weETH at the peak block × the peak balance",
    Math.abs(peakS - 25_134.99) <= 0.5,
    `replay ${peakS.toFixed(2)} (the old view stated 21,344.52; the Chainlink composition 25,122.55)`,
  );
}

await p1("P1.1", F.F1);
await p1("P1.2", F.F2);
await p1("P1.3", F.F3);
await p1("P1.4", F.F4);
await p2();
await p3();
await p45();
skip(
  "P6 /health/freshness aave-v4 gap ≤ 300 s and mv_aave_v4_events refresh < 300 s",
  "box-only reads; recorded in the plan's build log",
);

console.log(`\n${passes} PASS · ${failures} FAIL · ${skipped} SKIP`);
process.exit(failures ? 1 : 0);
