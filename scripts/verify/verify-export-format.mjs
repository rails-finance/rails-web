#!/usr/bin/env node
// The CSV export's format on the five queued families (rails-ops decision
// 0029): the small file the browser builds and the large file the download
// proxy formats are one format, written by one formatter.
// ---------------------------------------------------------------------------
// For one position of each family (under the 5,000-event queued threshold) the
// served history is read ONCE from the box, through the page's own fetch client
// and the web's own timeline route (run in this process, its box call
// recorded). Then:
//
//   F1  SAME BYTES — the in-browser file (BOM + eventsToCsv of the client's
//       events, the family's columns) and the proxy's file (the recorded rows
//       written as the box writes its queued file, gzipped, then run through
//       lib/sources/api/queued-export-format.ts) are identical, byte for byte.
//   F2  EVERY ROW — the proxy's file has one data line per served row, and its
//       header is the family's fixed header.
//   F3  USD — on every row whose served row carries a price, the file's USD
//       cell is amount × price computed here from the raw served fields; on a
//       row with no price the cell is empty (never 0). Liquidation legs are
//       checked the same way. Comet's is the row's own usdValue ÷ 1e8.
//   F4  BALANCES — the file's balance-after cells equal the served row's
//       *_after fields scaled here from raw.
//   F5  REFUSAL — with the chain reader unreachable, the proxy refuses the
//       file (EXPORT_TOKEN_META) and the in-browser serializer throws, rather
//       than writing a stand-in's 18 decimals (Aave V3 and SparkLend fixtures).
//   F6  OTHER FAMILIES — eventsToCsv without a family keeps the core columns
//       and its protocol blocks.
//
// Token metadata is read from chain (one multicall per family, cached); no
// queued export is requested. The box URL and bearer token come from
// .env.local and are never printed.
//
//   node scripts/verify/verify-export-format.mjs
//   FILE=<a box export .csv.gz> FAMILY=spark node … also formats a real box
//     file and checks it against the served history (F1 on the box's bytes).
//   FORMAT_ONLY=<a box export .csv.gz> FAMILY=spark node … prints the proxy's
//     file for it and does nothing else.
// BREAK=bytes|count|usd|balance|meta turns one check's input wrong; the run
// must go red on that check.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// TypeScript with `@/` aliases: re-exec once with type stripping and a
// resolver, as verify-aave-v3-lifetime-bigint.mjs does.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const hook = `
    import { existsSync } from "node:fs";
    const ROOT = ${JSON.stringify(new URL("file://" + ROOT + "/").href)};
    const EXT = [".ts", ".tsx", "/index.ts", "/index.tsx", ".mjs", ".js"];
    export async function resolve(spec, ctx, next) {
      let s = spec;
      if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
      if (s.startsWith(".") || s.startsWith("file:")) {
        const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
        if (!/\\.(ts|tsx|mjs|js|json)$/.test(base)) {
          for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
        }
        return next(base, ctx);
      }
      if (s === "next/server") return next("next/server.js", ctx);
      return next(spec, ctx);
    }`;
  const register = `import{register}from'node:module';register(${JSON.stringify(
    "data:text/javascript," + encodeURIComponent(hook),
  )},import.meta.url);`;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "data:text/javascript," + encodeURIComponent(register),
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: process.env },
  );
  process.exit(r.status ?? 1);
}

try {
  process.loadEnvFile(resolvePath(ROOT, ".env.local"));
} catch {
  /* the env must already carry RAILS_API_URL, API_BEARER_TOKEN and ALCHEMY_URL */
}
const API = process.env.RAILS_API_URL;
if (!API || !process.env.API_BEARER_TOKEN || !process.env.ALCHEMY_URL) {
  console.error("needs RAILS_API_URL, API_BEARER_TOKEN and ALCHEMY_URL (from .env.local)");
  process.exit(2);
}
const BREAK = process.env.BREAK ?? "";

// ── the refusal arm runs in a child with the chain reader unreachable ────────
if (process.env.VERIFY_EXPORT_REFUSAL_ARM) {
  if (process.env.VERIFY_RPC_OVERRIDE) process.env.ALCHEMY_URL = process.env.VERIFY_RPC_OVERRIDE;
  const { formatQueuedExport } = await import("../../lib/sources/api/queued-export-format.ts");
  const { eventsToCsv, TokenMetaUnresolvedError } = await import("../../lib/shared/events-to-csv.ts");
  const { buildAaveV3Timeline } = await import("../../lib/sources/api/aave-v3-timeline.ts");
  const { buildSparkTimeline } = await import("../../lib/sources/api/spark-timeline.ts");
  const input = JSON.parse(readFileSync(0, "utf8"));
  const out = [];
  for (const { family, gz, rows, wallet } of input) {
    const f = await formatQueuedExport(new Uint8Array(Buffer.from(gz, "base64")), family);
    const build = family === "aave-v3" ? buildAaveV3Timeline : buildSparkTimeline;
    let threw = false;
    try {
      eventsToCsv((await build(rows, wallet)).events, family);
    } catch (e) {
      threw = e instanceof TokenMetaUnresolvedError;
    }
    out.push({ family, proxy: f.ok ? "wrote the file" : f.code, instantThrew: threw });
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// FORMAT_ONLY=<box .csv.gz> FAMILY=<family>: write the proxy's formatted file
// to stdout and stop (verify-queued-export.mjs W3 compares the live download
// against it).
if (process.env.FORMAT_ONLY) {
  const { formatQueuedExport } = await import("../../lib/sources/api/queued-export-format.ts");
  const f = await formatQueuedExport(new Uint8Array(readFileSync(process.env.FORMAT_ONLY)), process.env.FAMILY);
  if (!f.ok) {
    console.error(f.code);
    process.exit(1);
  }
  const reader = f.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    process.stdout.write(value);
  }
  process.exit(0);
}

const { NextRequest } = await import("next/server");
const { eventsToCsv, timelineCsvHeader } = await import("../../lib/shared/events-to-csv.ts");
const { formatQueuedExport, parseCsvLine } = await import("../../lib/sources/api/queued-export-format.ts");
const { resolveV3Tokens } = await import("../../lib/sources/chain/aave-v3-tokens.ts");
const { resolveErc20Meta } = await import("../../lib/sources/chain/erc20-meta.ts");
const { marketOf: compoundMarketOf } = await import("../../lib/compound/asset-catalog.ts");
const { COMPOUND_V2_MARKET_BY_KEY, CTOKEN_DECIMALS } = await import("../../lib/compound-v2/asset-catalog.ts");
const { maplePoolOf, MAPLE_SHARE_DECIMALS } = await import("../../lib/maple/asset-catalog.ts");

const ROUTES = {
  "aave-v3": await import("../../app/api/aave-v3/timeline/route.ts"),
  spark: await import("../../app/api/spark/timeline/route.ts"),
  maple: await import("../../app/api/maple/timeline/route.ts"),
  "compound-v3": await import("../../app/api/compound/timeline/route.ts"),
  "compound-v2": await import("../../app/api/compound-v2/timeline/route.ts"),
};
const CLIENTS = {
  "aave-v3": async (fx) =>
    (await import("../../lib/api/fetch-aave-v3-timeline.ts")).fetchAaveV3Timeline({
      wallet: fx.wallet,
      market: fx.market,
      baseUrl: LOCAL,
    }),
  spark: async (fx) =>
    (await import("../../lib/api/fetch-spark-timeline.ts")).fetchSparkTimeline(fx.wallet, { baseUrl: LOCAL }),
  maple: async (fx) =>
    (await import("../../lib/api/fetch-maple-timeline.ts")).fetchMapleTimeline(fx.wallet, { baseUrl: LOCAL }),
  "compound-v3": async (fx) =>
    (await import("../../lib/api/fetch-compound-timeline.ts")).fetchCompoundTimeline(fx.wallet, {
      market: fx.market,
      baseUrl: LOCAL,
    }),
  "compound-v2": async (fx) =>
    (await import("../../lib/api/fetch-compound-v2-timeline.ts")).fetchCompoundV2Timeline(fx.wallet, {
      baseUrl: LOCAL,
    }),
};
const ROUTE_PATH = {
  "aave-v3": "/api/aave-v3/timeline",
  spark: "/api/spark/timeline",
  maple: "/api/maple/timeline",
  "compound-v3": "/api/compound/timeline",
  "compound-v2": "/api/compound-v2/timeline",
};

const FIXTURES = [
  {
    family: "aave-v3",
    wallet: "0x106d1b55d6dfa8158d25cb6c401ccd0f80bd6955",
    market: "core",
    note: "swaps, a liquidation",
  },
  { family: "spark", wallet: "0xed0c6079229e2d407672a117c22b62064f4a4312", note: "the queued fixture" },
  { family: "spark", wallet: "0x26c8de1b6f4e4beea9ae564f9c7518242441a99a", note: "six liquidations" },
  { family: "maple", wallet: "0x1601843c5e9bc251a3272907010afa41fa18347e", note: "transfers" },
  { family: "compound-v3", wallet: "0xb0105f6582ec7a07c419990b1b38474a08f3f912", market: "usdc", note: "an absorb" },
  { family: "compound-v2", wallet: "0xcb1096e77d6eab734ffceced1fcd2d35ee6b8d15", note: "331 liquidations" },
];

// ── the page's fetch → the web's route (in this process) → the box ──────────
const LOCAL = "http://verify.local";
const realFetch = globalThis.fetch;
let recorded = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith(LOCAL)) {
    const u = new URL(url);
    const family = Object.keys(ROUTE_PATH).find((f) => ROUTE_PATH[f] === u.pathname);
    return ROUTES[family].GET(new NextRequest(url));
  }
  const res = await realFetch(input, init);
  if (url.startsWith(API)) {
    const text = await res.text();
    try {
      recorded.push(JSON.parse(text));
    } catch {
      /* not JSON: the route will say so */
    }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
};

// ── the box's queued file, written by its rule (api/src/services/timeline-export/csv.ts) ──
const cellText = (v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));
const csvEscape = (t) => (/[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
const dateUtc = (ts) => (/^\d{1,12}$/.test(String(ts)) ? new Date(Number(ts) * 1000).toISOString() : "");
function boxFile(rows) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [["date_utc", ...columns].map(csvEscape).join(",")];
  for (const r of rows)
    lines.push([dateUtc(r.block_timestamp), ...columns.map((c) => cellText(r[c]))].map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

let failures = 0;
let checks = 0;
const check = (id, ok, detail) => {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};

async function streamText(body) {
  const chunks = [];
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The file's data rows as objects keyed by header. */
function table(text) {
  const lines = text.replace(/^﻿/, "").split("\r\n");
  const header = parseCsvLine(lines[0]);
  return {
    header,
    rows: lines.slice(1).map((l) => Object.fromEntries(parseCsvLine(l).map((v, i) => [header[i], v]))),
  };
}

const pow10 = (d) => BigInt("1" + "0".repeat(d));
/** raw integer string ÷ 10^d as a Number, via BigInt (no float drift in the split). */
const scale = (raw, d) => {
  if (raw == null || raw === "") return null;
  const b = BigInt(String(raw).split(".")[0]);
  const neg = b < 0n;
  const a = neg ? -b : b;
  const v = Number(a / pow10(d)) + Number(a % pow10(d)) / Number(pow10(d));
  return neg ? -v : v;
};
const near = (a, b, abs = 0.011) => Math.abs(a - b) <= abs + Math.abs(b) * 1e-9;
const same = (cell, want) =>
  want == null ? cell === "" : cell !== "" && Math.abs(Number(cell) - want) <= Math.abs(want) * 1e-9 + 1e-12;

// ── F3 / F4: the file's cells against the served rows, computed here ─────────
async function decimalsFor(family, rows) {
  const addrs = [
    ...new Set(
      rows.flatMap((r) =>
        [r.reserve, r.collateral_asset, r.debt_asset, r.asset].filter(Boolean).map((a) => a.toLowerCase()),
      ),
    ),
  ];
  const metas = family === "aave-v3" ? await resolveV3Tokens(addrs) : await resolveErc20Meta(addrs);
  return (a) => (a ? metas.get(a.toLowerCase())?.decimals : undefined);
}

async function spotChecks(fx, served, file) {
  const f = fx.family;
  const usd = [];
  const bal = [];
  const priceBreak = BREAK === "usd" ? 1.01 : 1;
  if (f === "aave-v3" || f === "spark") {
    const dec = await decimalsFor(f, served);
    served.forEach((r, i) => {
      const c = file.rows[i] ?? {};
      if (r.action === "liquidation") {
        const coll = scale(r.liquidated_collateral_amount, dec(r.collateral_asset));
        const debt = scale(r.amount, dec(r.debt_asset));
        const cp = r.collateral_price_source === "iaave-oracle" ? Number(r.collateral_price_usd) * priceBreak : null;
        const dp = r.debt_price_source === "iaave-oracle" ? Number(r.debt_price_usd) * priceBreak : null;
        usd.push([c["Liq Collateral Value (USD)"], cp == null ? null : coll * cp, i]);
        usd.push([c["Liq Debt Value (USD)"], dp == null ? null : debt * dp, i]);
        bal.push([c["Supply After"], scale(r.supply_after, dec(r.collateral_asset)), i]);
        bal.push([c["Debt After"], scale(r.debt_after, dec(r.debt_asset)), i]);
        return;
      }
      const p = r.price_source === "iaave-oracle" && Number(r.price_usd) > 0 ? Number(r.price_usd) * priceBreak : null;
      usd.push([c["Value (USD)"], p == null ? null : scale(r.amount, dec(r.reserve)) * p, i]);
      const supplySide = ["supply", "withdraw", "transfer_in", "transfer_out"].includes(r.action);
      const debtSide = ["borrow", "repay", "bad_debt_written_off"].includes(r.action);
      const d = dec(r.reserve);
      if (supplySide) bal.push([c["Supply After"], scale(r.supply_after, d), i]);
      if (debtSide) bal.push([c["Debt After"], scale(r.debt_after, d), i]);
    });
  } else if (f === "compound-v3") {
    const dec = await decimalsFor(f, served);
    const base = new Set(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);
    served.forEach((r, i) => {
      const c = file.rows[i] ?? {};
      const u = r.usd_value == null ? null : scale(r.usd_value, 8) * priceBreak;
      usd.push([c["Value (USD)"], r.action.startsWith("absorb") ? u : null, i]);
      const m = compoundMarketOf(r.market);
      bal.push([c["Base Balance After"], scale(r.base_after, m.baseDecimals), i]);
      if (!base.has(r.action)) bal.push([c["Collateral After"], scale(r.collateral_after, dec(r.asset)), i]);
    });
  } else if (f === "compound-v2") {
    served.forEach((r, i) => {
      const c = file.rows[i] ?? {};
      const m = COMPOUND_V2_MARKET_BY_KEY[r.market];
      if (r.action === "liquidation") {
        const cm = COMPOUND_V2_MARKET_BY_KEY[r.collateral_market];
        const priced =
          r.price_numeraire === "USD" && r.debt_price_native && r.collateral_price_native && r.collateral_exchange_rate;
        const cleared = priced
          ? scale(r.amount, m.decimals) * scale(r.debt_price_native, 36 - m.decimals) * priceBreak
          : null;
        const seized = priced
          ? scale((BigInt(r.seize_tokens) * BigInt(r.collateral_exchange_rate)) / pow10(18), cm.decimals) *
            scale(r.collateral_price_native, 36 - cm.decimals) *
            priceBreak
          : null;
        usd.push([c["Liq Debt Value (USD)"], cleared, i]);
        usd.push([c["Liq Collateral Value (USD)"], seized, i]);
      }
      if (r.action === "mint" || r.action === "redeem")
        bal.push([c["Supply After"], scale(r.supply_after, m.decimals), i]);
      if (["mint", "redeem", "transfer_in", "transfer_out", "seize_out", "seize_in", "seize_burn"].includes(r.action))
        bal.push([c["cTokens After"], scale(r.ctokens_after, CTOKEN_DECIMALS), i]);
      if (["borrow", "repay", "liquidation"].includes(r.action))
        bal.push([c["Debt After"], scale(r.debt_after, m.decimals), i]);
    });
  } else if (f === "maple") {
    served.forEach((r, i) => {
      const c = file.rows[i] ?? {};
      const p = maplePoolOf(r.pool);
      bal.push([c["Shares After"], scale(r.shares_after, MAPLE_SHARE_DECIMALS), i]);
      bal.push([c["Principal After"], scale(r.principal_after, p.decimals), i]);
    });
  }
  if (BREAK === "balance" && bal.length) bal[Math.floor(bal.length / 2)][1] *= 1.001;
  return { usd, bal };
}

// ── run ───────────────────────────────────────────────────────────────────────
const refusalInput = [];
for (const fx of FIXTURES) {
  const id = `${fx.family} ${fx.wallet.slice(0, 6)}…${fx.wallet.slice(-4)}`;
  recorded = [];
  const res = await CLIENTS[fx.family](fx);
  const events = res.events ?? [];
  const served = recorded.flatMap((b) => b.rows ?? []);
  const instant = "﻿" + eventsToCsv(events, fx.family);

  let fileText = boxFile(served);
  if (BREAK === "bytes")
    fileText = fileText.replace(/(\r\n[^\r\n]*?,)(\d)(\d*,)/, (_, a, d, b) => `${a}${(Number(d) + 1) % 10}${b}`);
  if (BREAK === "count") fileText = fileText.replace(/[^\n]*\r\n$/, "");
  const gz = new Uint8Array(gzipSync(fileText));
  const t0 = performance.now();
  const formatted = await formatQueuedExport(gz, fx.family);
  const proxy = formatted.ok ? await streamText(formatted.body) : `(refused: ${formatted.code})`;
  const ms = Math.round(performance.now() - t0);

  console.log(`\n${id} (${fx.note}): ${served.length} served rows, ${events.length} events, proxy ${ms} ms`);
  check(
    `${id} size`,
    served.length > 0 && served.length <= 5000,
    `${served.length} rows (the instant path runs at 5,000 or fewer)`,
  );
  const firstDiff = [...instant].findIndex((ch, i) => ch !== proxy[i]);
  check(
    `${id} F1`,
    instant === proxy,
    instant === proxy
      ? `in-browser and proxy files identical, ${Buffer.byteLength(instant)} bytes`
      : `differ at char ${firstDiff < 0 ? Math.min(instant.length, proxy.length) : firstDiff}: …${JSON.stringify(instant.slice(Math.max(0, firstDiff - 40), firstDiff + 40))} vs …${JSON.stringify(proxy.slice(Math.max(0, firstDiff - 40), firstDiff + 40))}`,
  );
  const file = table(proxy);
  check(
    `${id} F2`,
    file.header.join(",") === timelineCsvHeader(fx.family) && file.rows.length === served.length,
    `${file.rows.length} data lines for ${served.length} served rows; header ${file.header.length} columns`,
  );
  const { usd, bal } = await spotChecks(fx, served, file);
  if (fx.family === "maple")
    check(`${id} F3`, !file.header.some((h) => /USD/.test(h)), "no USD column: Maple's rows carry no price");
  else {
    const bad = usd.filter(([cell, want]) => (want == null ? cell !== "" : cell === "" || !near(Number(cell), want)));
    const priced = usd.filter(([, w]) => w != null).length;
    check(
      `${id} F3`,
      bad.length === 0 && usd.length > 0,
      `${priced} priced cells = amount × price, ${usd.length - priced} unpriced cells empty` +
        (bad.length ? `; ${bad.length} wrong, first row ${bad[0][2]}: "${bad[0][0]}" vs ${bad[0][1]}` : ""),
    );
  }
  const badBal = bal.filter(([cell, want]) => !same(cell, want));
  check(
    `${id} F4`,
    badBal.length === 0 && bal.length > 0,
    `${bal.length} balance-after cells match the served *_after` +
      (badBal.length
        ? `; ${badBal.length} wrong, first row ${badBal[0][2]}: "${badBal[0][0]}" vs ${badBal[0][1]}`
        : ""),
  );
  if (
    (fx.family === "aave-v3" || fx.family === "spark") &&
    refusalInput.length < 2 &&
    fx.family !== refusalInput[0]?.family
  )
    refusalInput.push({
      family: fx.family,
      gz: Buffer.from(gz).toString("base64"),
      rows: served.slice(0, 200),
      wallet: fx.wallet,
    });
}

// A real box file, when given.
if (process.env.FILE && process.env.FAMILY) {
  const gz = new Uint8Array(readFileSync(process.env.FILE));
  const f = await formatQueuedExport(gz, process.env.FAMILY);
  const text = f.ok ? await streamText(f.body) : "";
  const rows = text ? table(text).rows : [];
  const wallet = rows[0]?.Wallet;
  const fx = { family: process.env.FAMILY, wallet, market: process.env.MARKET };
  recorded = [];
  const res = await CLIENTS[fx.family](fx);
  const instant = "﻿" + eventsToCsv(res.events ?? [], fx.family);
  check(
    `box file ${process.env.FILE.split("/").pop()} F1`,
    f.ok && instant === text,
    f.ok
      ? `${rows.length} rows; identical to the in-browser file of the served history: ${instant === text}`
      : "refused",
  );
}

// F5 in a child whose chain reader cannot be reached.
{
  const env = { ...process.env, VERIFY_EXPORT_REFUSAL_ARM: "1" };
  if (BREAK !== "meta") env.VERIFY_RPC_OVERRIDE = "http://127.0.0.1:9";
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
    input: JSON.stringify(refusalInput),
    env,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  let out = [];
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* reported below */
  }
  console.log("");
  for (const o of out)
    check(
      `${o.family} F5`,
      o.proxy === "EXPORT_TOKEN_META" && o.instantThrew,
      `chain reader unreachable: proxy ${o.proxy}; in-browser serializer ${o.instantThrew ? "refused" : "wrote a file"}`,
    );
  if (out.length === 0) check("F5", false, `the refusal arm did not answer (exit ${r.status})`);
}

// F6: the other families keep the core columns and their blocks.
{
  const core = "Date (UTC),Block,Action,Wallet,Token Flows,Gas (ETH),Gas (USD),Tx Hash,Etherscan";
  const v4 = {
    id: "x",
    txHash: "0x1",
    blockNumber: 1,
    timestamp: 1,
    wallet: "0xw",
    actionType: "supply",
    actionLabel: "Supply",
    flows: [],
    etherscanUrl: "u",
    context: { protocol: "aave-v4", data: { eventType: "supply", amount: "1" } },
  };
  const plain = eventsToCsv([]);
  const withV4 = eventsToCsv([v4]).split("\r\n")[0];
  check(
    "F6",
    plain === core && withV4.startsWith(core + ",Spoke,Event Type"),
    `no family: "${plain.slice(0, 40)}…"; Aave V4 block kept`,
  );
}

console.log(`\n${checks - failures}/${checks} passed${BREAK ? ` (BREAK=${BREAK})` : ""}`);
process.exit(failures ? 1 : 0);
