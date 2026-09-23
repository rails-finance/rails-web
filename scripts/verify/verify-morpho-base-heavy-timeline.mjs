// A HEAVY wallet's seeded replay lands where a whole-history replay lands.
// ----------------------------------------------------------------------------
// /api/morpho-base/timeline sends a vault's newest rows plus `heavy.seeds` —
// the replay's running state per market at the cut, aggregated in SQL over the
// rows it did not send. This checks the only thing that claim rests on: a
// replay started from those seeds over that tail reaches the same positions as
// a replay over every row.
//
// The two sides are built from ONE fetch each of the SAME deployed API:
//
//   heavy — GET /timeline?wallet=…            (tail + seeds)
//   full  — GET /timeline?wallet=…&full=1     (every row; the route answers
//           `full=1` only while the box sets TIMELINE_FULL_DEBUG=1, so this
//           script needs that switch on and says so when it is off)
//
// Sieve keeps writing between the two reads, so the full list is TRUNCATED to
// the heavy read's own newest row before it is replayed — the two then cover
// exactly the same history, and `heavy.omittedBefore.count + rows.length ===
// the truncated length` is asserted before anything else, so a mis-cut cannot
// pass as a matching replay.
//
// Both sides go through the real `replayMorphoRows`; only the seeds differ.
// The row decode here is this script's own (the reader's is not imported), so
// a decode that drifted would show up as a red assertion rather than cancel
// itself out on both sides.
//
// WHAT IT ASSERTS, per position, seeded vs full:
//   • collateralRaw, borrowSharesRaw, supplySharesRaw — wei-exact
//   • borrowed, supplied, badDebt — the replayed principals
//   • eventCount, txCount, liquidationCount, everLiquidated
//   • firstBlock / lastBlock / firstEventAt / lastTs
//   • open|closed|liquidated, by the card's own predicate
//   • omitted.count / omitted.upToBlock, and the drawn-row figures
//     (assetsDelta, sharesDelta, collateralAfter, borrowedAfter,
//     suppliedAfter, isOpen) for every row BOTH sides drew
//   • the peaks, only on positions the seed did not mark `peaksPartial`
//
// A position whose newest `maxRendered / markets` rows sit BEFORE the cut is
// drawn by the full replay and not by the seeded one — the seeded side states
// them as omitted instead. That is the design, not a drift: the script reports
// the per-position drawn-count difference and asserts the omission arithmetic
// (`eventCount − drawn === omitted.count`) holds on both sides.
//
// TIMELINE_FULL_DEBUG needs no file edit: the compose file reads it as
// `${TIMELINE_FULL_DEBUG:-}`, and Compose substitutes from the SHELL
// environment before it falls back to `.env`. On the onboarding box, in the
// server checkout:
//
//   TIMELINE_FULL_DEBUG=1 docker compose -f docker-compose.server.yml \
//     up -d --no-deps --force-recreate api      # … run this … then:
//   docker compose -f docker-compose.server.yml up -d --no-deps --force-recreate api
//   docker exec api printenv TIMELINE_FULL_DEBUG   # must print an empty line
//
// `.env` is never opened, so there is nothing to back up, restore or prove by
// sha256, and `--no-deps` leaves the other containers alone. Read the flag out
// of the CONTAINER to prove it off. NEVER leave it set — a heavy wallet's
// whole history is the response this route must not be askable for.
//
// Run:
//   node scripts/verify/verify-morpho-base-heavy-timeline.mjs
//   WALLET=0x… node scripts/verify/verify-morpho-base-heavy-timeline.mjs
//   node scripts/verify/verify-morpho-base-heavy-timeline.mjs --perturb
//
// `--perturb` adds ONE WEI to the first seed's supplyShares and one to its
// supplied assets before the seeded replay — the first shows in the final
// state, the second in every drawn row's running figure. It must turn the run
// red; it is how the check is shown to be able to fail at all.

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
const PERTURB = process.argv.includes("--perturb");
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
function eq(name, a, b) {
  check(name, a === b, a === b ? "" : `seeded ${a} · full ${b}`);
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
const heavy = await get(`${base}/api/morpho-base/timeline?wallet=${WALLET}`);
const tHeavy = Date.now() - t0;
const t1 = Date.now();
const full = await get(`${base}/api/morpho-base/timeline?wallet=${WALLET}&full=1`);
const tFull = Date.now() - t1;

console.log(`wallet ${WALLET}`);
console.log(`heavy  ${heavy.rows.length} rows, ${JSON.stringify(heavy.heavy?.cut ?? null)}, ${tHeavy}ms`);
console.log(`full   ${full.rows.length} rows, ${tFull}ms`);

check("the route answered the heavy shape", heavy.heavy != null, "no `heavy` — is the wallet above HEAVY_ROWS?");
check(
  "the route answered the full history for ?full=1",
  full.heavy == null && full.rows.length > heavy.rows.length,
  full.heavy != null ? "still heavy — TIMELINE_FULL_DEBUG is not set on the box" : "",
);
if (!heavy.heavy || full.heavy != null) {
  console.log(`\n${failures} failed of ${checked}`);
  process.exit(1);
}

// One history on both sides: cut the full list at the heavy read's own newest
// row, so rows Sieve wrote between the two reads are on neither side.
const key = (r) => [Number(r.block_number), r.tx_index, r.log_index];
const newest = key(heavy.rows[heavy.rows.length - 1]);
const le = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2]);
const fullRows = full.rows.filter((r) => le(key(r), newest));
eq("the two reads cover one history", heavy.heavy.omittedBefore.count + heavy.rows.length, fullRows.length);

const seeds = heavy.heavy.seeds.map(seedOf);
if (PERTURB) {
  // One wei on the shares slot AND one on the assets it stands for: the first
  // shows in the final state, the second in every drawn row's running figure.
  seeds[0].supplyShares += BigInt(1);
  seeds[0].supplied += BigInt(1);
  console.log(
    `\n--perturb: ${seeds[0].marketId.slice(0, 10)} supplyShares +1 wei, supplied +1 wei. The run MUST go red.\n`,
  );
}

const common = {
  wallet: WALLET,
  deployment: MORPHO_BASE_DEPLOYMENT,
  maxRendered: MAX_RENDERED_EVENTS,
  coverage: { fromBlock: 0, toBlock: newest[0], fromDeployment: true, deployBlock: 0, gaps: [], source: "index" },
};
const seededResult = await replayMorphoRows({
  ...common,
  rows: heavy.rows.map(decode),
  seeds,
  metadata: metadataFrom(heavy.rows),
});
const fullResult = await replayMorphoRows({
  ...common,
  rows: fullRows.map(decode),
  metadata: metadataFrom(fullRows),
});

eq("wallet-wide totalEvents", seededResult.totalEvents, fullResult.totalEvents);
eq("wallet-wide first event", seededResult.coverage.firstEventAt, fullResult.coverage.firstEventAt);
eq("positions", seededResult.positions.length, fullResult.positions.length);

const status = (p) =>
  p.collateral > 1e-6 || BigInt(p.borrowSharesRaw) > ZERO ? "open" : p.everLiquidated ? "liquidated" : "closed";
const byId = new Map(fullResult.positions.map((p) => [p.marketId, p]));
const drawnDelta = [];

for (const s of seededResult.positions) {
  const f = byId.get(s.marketId);
  const id = s.marketId.slice(0, 10);
  if (!f) {
    check(`${id} exists in the full replay`, false);
    continue;
  }
  eq(`${id} collateralRaw`, s.collateralRaw, f.collateralRaw);
  eq(`${id} borrowSharesRaw`, s.borrowSharesRaw, f.borrowSharesRaw);
  eq(`${id} supplySharesRaw`, s.supplySharesRaw, f.supplySharesRaw);
  eq(`${id} borrowed`, s.borrowed, f.borrowed);
  eq(`${id} supplied`, s.supplied, f.supplied);
  eq(`${id} collateral`, s.collateral, f.collateral);
  eq(`${id} badDebt`, s.badDebt, f.badDebt);
  eq(`${id} eventCount`, s.eventCount, f.eventCount);
  eq(`${id} txCount`, s.txCount, f.txCount);
  eq(`${id} liquidationCount`, s.liquidationCount, f.liquidationCount);
  eq(`${id} everLiquidated`, s.everLiquidated, f.everLiquidated);
  eq(`${id} firstBlock`, s.firstBlock, f.firstBlock);
  eq(`${id} lastBlock`, s.lastBlock, f.lastBlock);
  eq(`${id} firstEventAt`, s.firstEventAt, f.firstEventAt);
  eq(`${id} lastTs`, s.lastTs, f.lastTs);
  eq(`${id} status`, status(s), status(f));
  if (!s.peaksPartial) {
    eq(`${id} peakCollateral`, s.peakCollateral, f.peakCollateral);
    eq(`${id} peakBorrowed`, s.peakBorrowed, f.peakBorrowed);
  }
  // The omission arithmetic on each side separately: whatever a side did not
  // draw, it counted.
  eq(`${id} seeded omission adds up`, (s.omitted?.count ?? 0) + s.events.length, s.eventCount);
  eq(`${id} full omission adds up`, (f.omitted?.count ?? 0) + f.events.length, f.eventCount);
  if (s.events.length !== f.events.length) {
    drawnDelta.push(`${id} drew ${s.events.length} of the ${f.events.length} the full replay drew`);
  } else {
    eq(`${id} omitted.count`, s.omitted?.count ?? 0, f.omitted?.count ?? 0);
    eq(`${id} omitted.upToBlock`, s.omitted?.upToBlock ?? 0, f.omitted?.upToBlock ?? 0);
  }

  // Every row BOTH drew must carry the same running figures.
  const fEv = new Map(f.events.map((e) => [e.id, e]));
  let shared = 0;
  for (const e of s.events) {
    const g = fEv.get(e.id);
    if (!g) continue;
    shared++;
    const a = e.context.data;
    const b = g.context.data;
    eq(`${id} ${e.id.slice(0, 12)} collateralAfter`, a.collateralAfter, b.collateralAfter);
    eq(`${id} ${e.id.slice(0, 12)} borrowedAfter`, a.borrowedAfter, b.borrowedAfter);
    eq(`${id} ${e.id.slice(0, 12)} suppliedAfter`, a.suppliedAfter, b.suppliedAfter);
    eq(`${id} ${e.id.slice(0, 12)} assetsDelta`, a.assetsDelta, b.assetsDelta);
    eq(`${id} ${e.id.slice(0, 12)} sharesDelta`, a.sharesDelta, b.sharesDelta);
    eq(`${id} ${e.id.slice(0, 12)} isOpen`, a.isOpen, b.isOpen);
  }
  // Every row the seeded side drew is a row the full replay drew too — the
  // seeded side can only draw FEWER (a position whose newest rows sit before
  // the cut), never a row the whole-history replay left out.
  eq(`${id} every seeded drawn row is in the full replay`, shared, s.events.length);
  check(`${id} the seed marks the peaks partial`, s.peaksPartial === true);
}

if (drawnDelta.length) {
  console.log("\nDrawn-row differences (by design — the tail is one cut, so a position");
  console.log("whose newest drawn rows sit before it states them as omitted instead):");
  for (const d of drawnDelta) console.log(`  ${d}`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
