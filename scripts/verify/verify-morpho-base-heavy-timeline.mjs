// A HEAVY wallet's seeded replay accounts for every row it was not sent.
// ----------------------------------------------------------------------------
// /api/morpho-base/timeline sends a vault's newest rows plus `heavy.seeds` —
// the replay's running state per market at the cut, aggregated in SQL over the
// rows it did not send. A replay started from those seeds over that tail goes
// through the real `replayMorphoRows`; the row decode here is this script's own
// (the reader's is not imported).
//
// WHAT IT ASSERTS:
//   • the route answers the heavy shape, with a seed per market
//   • per position, the omission arithmetic: `omitted.count + drawn ===
//     eventCount`
//   • per position, the seed carries the peaks (no `peaksPartial`)
//
// The comparison against a whole-history replay (`?full=1`, every position
// field wei-exact, the drawn rows' running figures, `--perturb`) is retired:
// `?full=1` answers only while the box sets TIMELINE_FULL_DEBUG=1, and the flag
// stays off (ruled 15 Oct 2026; the Aave family's verifier did the same in
// 25660add).
//
// Run:
//   node scripts/verify/verify-morpho-base-heavy-timeline.mjs
//   WALLET=0x… node scripts/verify/verify-morpho-base-heavy-timeline.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both rather than
// making the suite special-case this file (verify-market-note-placement.mjs
// does the same for the stripping half).
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
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

// .env.local holds RAILS_API_URL and API_BEARER_TOKEN for a local run; a CI or
// shell that already exports them wins.
const envFile = resolvePath(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const { replayMorphoRows } = await import("../../lib/sources/chain/morpho-blue-events.ts");
const { MORPHO_BASE_DEPLOYMENT } = await import("../../lib/sources/chain/morpho-deployments.ts");

/** Steakhouse Prime USDC — the largest wallet on the Base singleton. */
const WALLET = (process.env.WALLET ?? "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2").toLowerCase();
/** The web's own wallet-wide render budget (lib/sources/api/morpho-base-timeline.ts). */
const MAX_RENDERED_EVENTS = 2_000;
const ZERO = BigInt(0);

let failures = 0;
let checked = 0;
function check(name, cond, detail = "") {
  checked++;
  if (!cond) failures++;
  if (!cond || process.env.VERBOSE) console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.API_BEARER_TOKEN}` } });
  if (!res.ok) throw new Error(`${url.replace(/wallet=0x[0-9a-f]+/, "wallet=…")} answered ${res.status}`);
  return res.json();
}

// ── The decode: a Sieve row → the replay's row. This script's own copy. ──────
function decode(r) {
  const base = {
    blockNumber: Number(r.block_number),
    txIndex: r.tx_index,
    logIndex: r.log_index,
    txHash: r.tx_hash.toLowerCase(),
    kind: r.kind,
    marketId: `0x${r.market.toLowerCase()}`,
  };
  const caller = r.caller ? r.caller.toLowerCase() : undefined;
  if (r.kind === "supply_collateral" || r.kind === "withdraw_collateral")
    return { ...base, assets: ZERO, shares: ZERO, collateral: BigInt(r.assets), caller };
  if (r.kind === "liquidation")
    return {
      ...base,
      assets: BigInt(r.assets) + BigInt(r.bad_debt_assets ?? "0"),
      shares: BigInt(r.shares ?? "0") + BigInt(r.bad_debt_shares ?? "0"),
      collateral: BigInt(r.seized_assets ?? "0"),
      badDebtAssets: BigInt(r.bad_debt_assets ?? "0"),
    };
  return { ...base, assets: BigInt(r.assets), shares: BigInt(r.shares ?? "0"), collateral: ZERO, caller };
}

function seedOf(s) {
  return {
    marketId: `0x${s.market.toLowerCase()}`,
    supplyShares: BigInt(s.supplyShares),
    borrowShares: BigInt(s.borrowShares),
    collateral: BigInt(s.collateral),
    borrowed: BigInt(s.borrowed),
    supplied: BigInt(s.supplied),
    badDebt: BigInt(s.badDebt),
    liquidations: s.liquidations,
    events: s.events,
    txCount: s.txCount,
    firstBlock: s.firstBlock,
    firstTimestamp: s.firstTimestamp,
    lastBlock: s.lastBlock,
    lastTimestamp: s.lastTimestamp,
    lifetime: {
      deposited: BigInt(s.lifetime.deposited),
      collateralWithdrawn: BigInt(s.lifetime.collateralWithdrawn),
      collateralLiquidated: BigInt(s.lifetime.collateralLiquidated),
      borrowed: BigInt(s.lifetime.borrowed),
      repaid: BigInt(s.lifetime.repaid),
      supplied: BigInt(s.lifetime.supplied),
      withdrawn: BigInt(s.lifetime.withdrawn),
    },
    peaksPartial: s.peaksPartial,
  };
}

/** The rows carry their block's timestamp and their transaction's sender, so
 *  neither replay reads a chain for metadata — the same map both sides. */
function metadataFrom(rows) {
  const timestamps = new Map();
  const senders = new Map();
  for (const r of rows) {
    timestamps.set(Number(r.block_number), Number(r.block_timestamp));
    senders.set(r.tx_hash.toLowerCase(), r.tx_from.toLowerCase());
  }
  return async () => ({ timestamps, senders });
}

const base = process.env.RAILS_API_URL;
if (!base) {
  console.log("FAIL  RAILS_API_URL is not set");
  process.exit(1);
}

const t0 = Date.now();
const heavy = await get(`${base}/api/morpho-base/timeline?wallet=${WALLET}&reach=1`);
const tHeavy = Date.now() - t0;

console.log(`wallet ${WALLET}`);
console.log(`heavy  ${heavy.rows.length} rows, ${JSON.stringify(heavy.heavy?.cut ?? null)}, ${tHeavy}ms`);

check("the route answered the heavy shape", heavy.heavy != null, "no `heavy` — is the wallet above HEAVY_ROWS?");
if (!heavy.heavy) {
  console.log(`\n${failures} failed of ${checked}`);
  process.exit(1);
}
const seeds = heavy.heavy.seeds.map(seedOf);
check("the heavy answer carries seeds", seeds.length > 0, `${seeds.length}`);

const newestBlock = Number(heavy.rows[heavy.rows.length - 1]?.block_number ?? 0);
const seededResult = await replayMorphoRows({
  wallet: WALLET,
  deployment: MORPHO_BASE_DEPLOYMENT,
  maxRendered: MAX_RENDERED_EVENTS,
  coverage: { fromBlock: 0, toBlock: newestBlock, fromDeployment: true, deployBlock: 0, gaps: [], source: "index" },
  rows: heavy.rows.map(decode),
  seeds,
  metadata: metadataFrom(heavy.rows),
});
check("the seeded replay has positions", seededResult.positions.length > 0, `${seededResult.positions.length}`);

for (const s of seededResult.positions) {
  const id = s.marketId.slice(0, 10);
  // Whatever the seeded side did not draw, it counted.
  check(
    `${id} seeded omission adds up`,
    (s.omitted?.count ?? 0) + s.events.length === s.eventCount,
    `${s.omitted?.count ?? 0} omitted + ${s.events.length} drawn vs ${s.eventCount}`,
  );
  // The seed carries the peaks (a window over the elided rows, rails-server
  // api/src/routes/baseMorpho.ts).
  check(`${id} the seed carries the peaks`, s.peaksPartial !== true);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
