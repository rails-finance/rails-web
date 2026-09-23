// A HEAVY Aave-family Base wallet answers, and what it says about itself is true.
// ----------------------------------------------------------------------------
// /api/aave-v3-base/timeline and /api/seamless/timeline share one router
// (api/src/routes/baseLending.ts), so they share one gate: 52 addresses — 47 on
// Aave V3 Base, 5 on Seamless — hold more rows than the route can send at any
// sensible size, and six of them are Aave's OWN aToken wrappers, which touch
// every depositor's balance change by design. Such a wallet answers in one of
// two shapes, and this checks each on its own terms:
//
//   SEEDED — `heavy.seed` (version 1) is present: the replay's exact state at
//   a block-boundary cut, computed offline by the seed filler (rails-server
//   api/src/services/baseTimelineSeeds.ts `aaveFullSeedSql`, mig 204), and
//   `rows` is EVERY row at or after the cut. The web opens its replay from the
//   seed and the answer is a WHOLE life: `fromDeployment: true` from the
//   Pool's first block, and the page's gate lets the peaks, the transaction
//   count and the lifetime layer through.
//
//   UNSEEDED — no seed stored yet (or the box is behind mig 204, or the tail
//   past the seed's cut has outgrown the server's bound): the newest rows and
//   the block they start at, and nothing else. This family emits no running
//   total a cheap aggregate could carry, and the replay's own per-reserve
//   balance is CLAMPED at zero after every row, so a sum over the elided rows
//   is not the balance a walk reaches. The elided history is a HORIZON,
//   stated, not state.
//
// The claims checked:
//
//   1. THE HEAVIEST ADDRESSES ANSWER, AND SMALL. waBasUSDC's 2,097,105 rows
//      were 220 MB after 23.4s; Seamless's heaviest 601,848 rows were 236.6 MB
//      after 19.2s. Each must now answer 200 well inside the statement timeout.
//      Unseeded: a tail no longer than TAIL_ROWS and a cut that IS its oldest
//      row. Seeded: a block-boundary cut no row precedes, `totalEvents` equal
//      to the seed's events plus the rows, nothing claimed truncated.
//
//   2. THE TAIL IS THE WHOLE HISTORY'S OWN SUFFIX, AND THE REPLAY OVER IT IS
//      THE REPLAY OVER THOSE ROWS. For the heavy wallets whose whole history
//      the route can still read (`?full=1`), the gated rows are compared row
//      for row against the suffix of the full list. Unseeded: the cut is
//      checked to be a transaction boundary, and the horizon replay is
//      compared field for field against a replay over the same rows taken
//      from the full answer — the only figures the horizon path claims.
//      Seeded: the full list must hold exactly `seed.wallet.events` rows
//      before the cut, and the seed-plus-tail replay must equal the WHOLE
//      replay over the full list on every figure the page draws — every
//      reserve's lifetime lanes with `===` on the raw strings, the peaks, the
//      transaction count, the first and last stamps, and the drawn events
//      with their running balances. `--perturb` moves one tail row by a wei
//      and must turn the run red either way.
//
//   3. WHAT IS CLAIMED IS SERVED, AND WHAT IS NOT IS WITHHELD. The reader's
//      own `loadAaveV3EventsFromIndex` is called for each heavy wallet.
//      Unseeded, its coverage must say `fromDeployment: false` from the cut
//      and the page's own gate (`v3ViewFromChain`) must return the peaks, the
//      transaction count and the last-activity stamp empty, where the same
//      call on a whole answer fills them. Seeded, the coverage must say
//      `fromDeployment: true` from the Pool's first block with no reason
//      withheld, and the gate must let those same figures through.
//
//   4. NOTHING CHANGED BELOW THE GATE. A regular wallet's gated response
//      carries no `heavy` key and equals its `?full=1` answer byte for byte
//      (`coverage` excepted — it advances with the live index between the two
//      reads).
//
// The heaviest addresses are NOT compared against a `?full=1` baseline: their
// whole history is precisely the read the gate exists to avoid. The equality
// checks run on the heavy wallets that still have a baseline, and the script
// says which ones it found — and, per wallet, which shape it answered in.
//
// `?full=1` answers only while the box sets TIMELINE_FULL_DEBUG=1, and the
// switch needs no file edit: the compose file reads it as
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
// of the CONTAINER to prove it off. NEVER leave it set —
// a 220 MB response is not one this route should be askable for.
//
// Run:
//   node scripts/verify/verify-aave-family-base-heavy-timeline.mjs
//   node scripts/verify/verify-aave-family-base-heavy-timeline.mjs --perturb
//   PROTOCOL=seamless node scripts/verify/verify-aave-family-base-heavy-timeline.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both, exactly as
// verify-moonwell-base-heavy-timeline.mjs does.
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

// .env.local holds RAILS_API_URL, API_BEARER_TOKEN and BASE_RPC_URL for a local
// run; a shell that already exports them wins.
const envFile = resolvePath(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const { replayAaveV3Rows } = await import("../../lib/sources/chain/aave-v3-events.ts");
const { resolveV3Tokens } = await import("../../lib/sources/chain/aave-v3-tokens.ts");
const { loadAaveV3EventsFromIndex } = await import("../../lib/sources/api/aave-v3-base-timeline.ts");
const { v3ViewFromChain } = await import("../../lib/aave-v3/chain-position-view.ts");
const { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_DEPLOY_BLOCK } = await import("../../lib/aave-v3-base/asset-catalog.ts");
const { SEAMLESS_CHAIN_ID, SEAMLESS_DEPLOY_BLOCK } = await import("../../lib/seamless/asset-catalog.ts");

/** The route's own tail size (api/src/routes/baseLending.ts TAIL_ROWS). */
const TAIL_ROWS = 2_000;
/** The web's render budget for this lane (MAX_RENDERED_EVENTS in the reader). */
const MAX_RENDERED_EVENTS = 2_000;
/** The gate's threshold. */
const HEAVY_ROWS = 20_000;
/** The pool's statement timeout on the box — the wall the gate keeps the read
 *  inside. */
const STATEMENT_TIMEOUT_MS = 30_000;
/** A transfer's emitted `value` is a SCALED balance; the underlying it moved is
 *  value × the emitted index ÷ 1e27 — the reader's own arithmetic. */
const RAY = BigInt("1000000000000000000000000000");
/** The seed grammar the reader speaks (SEED_VERSION in the reader). */
const SEED_VERSION = 1;
const LANES = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedCollateral", "liquidatedDebt"];

/** Both deployments of the shared router. Addresses from the heavy-wallet
 *  census (2026-09-05), taken over the route's own union per wallet. */
const PROTOCOLS = [
  {
    key: "aave-v3-base",
    label: "Aave V3 Base",
    apiPrefix: "/api/aave-v3-base",
    chainId: AAVE_V3_BASE_CHAIN_ID,
    deployBlock: AAVE_V3_BASE_DEPLOY_BLOCK,
    // waBasUSDC (2,097,105 rows — 220 MB, 23.4s before the gate), an unnamed
    // strategy contract (1,810,977) and another (904,649).
    heaviest: [
      "0xc768c589647798a6ee01a91fde98ef2ed046dbd6",
      "0xd1895f2019c2152fc2b9022d57f19198c4cfcabc",
      "0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24",
    ],
    // Heavy, but small enough that `?full=1` still answers — the ones with a
    // baseline to check the tail against. The first `pairedWanted` that answer
    // are used, and the run says which.
    pairedCandidates: [
      "0x6307119078556fc8ad77781dfc67df20d75fb4f9",
      "0xf708e11a7c94abde8f6217b13e6fe39c8b9cc0a6",
      "0x7ac2887e026e4239416aac6483c15df05a04a92e",
      "0x43f9a7aec2a683c4cd6016f92ff76d5f3e7b44d3",
      "0x5598bbfa2f4fe8151f45bba0a3ede1b54b51a0a9",
      "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818",
    ],
    pairedWanted: 3,
    /** A wallet far below the gate — its answer must not have moved at all. */
    regular: "0xa9015c54dd51df1eef05f9888e3ee36ab4b8ead6",
  },
  {
    key: "seamless",
    label: "Seamless",
    apiPrefix: "/api/seamless",
    chainId: SEAMLESS_CHAIN_ID,
    deployBlock: SEAMLESS_DEPLOY_BLOCK,
    // The lane's heaviest (601,848 rows — 236.6 MB, 19.2s before the gate) and
    // the two behind it.
    heaviest: [
      "0xaeeb3898ede6a6e86864688383e211132baa1af3",
      "0x232205f47a202a4f1cccf7e6efd79f0af362b161",
      "0x3fed901fc296096e125d7332fadba63303b7ddd6",
    ],
    // Only five Seamless addresses are above the gate at all, and three of them
    // are the heaviest above; these are the other two.
    pairedCandidates: ["0x6115680fef9e905131e58555d5e7972a2bf3eee2", "0x258730e23cf2f25887cb962d32bd10b878ea8a4e"],
    pairedWanted: 2,
    regular: "0x25c7c147f01875c8311409ce046b2fddd1594635",
  },
];

const PERTURB = process.argv.includes("--perturb");
const ONLY = process.env.PROTOCOL ? process.env.PROTOCOL.toLowerCase() : null;

let failures = 0;
let checked = 0;
function check(name, cond, detail = "") {
  checked++;
  if (!cond) failures++;
  if (!cond || process.env.VERBOSE) console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const base = process.env.RAILS_API_URL;
if (!base) {
  console.log("FAIL  RAILS_API_URL is not set");
  process.exit(1);
}

async function get(url) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.API_BEARER_TOKEN}` } });
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false, status: res.status, ms };
  return { ok: true, status: res.status, ms, json: await res.json() };
}

const timeline = (proto, wallet, full = false) =>
  get(`${base}${proto.apiPrefix}/timeline?wallet=${wallet}${full ? "&full=1" : ""}`);

/** A response's rows → the replay's rows, the reader's own decoding applied.
 *  Written out here rather than imported so this file states the shape it is
 *  checking, the way the other two heavy verifiers do. */
function decode(json) {
  const timestamps = new Map();
  const senders = new Map();
  const rows = [];
  for (const r of json.rows) {
    const blockNumber = Number(r.block_number);
    const txHash = r.tx_hash.toLowerCase();
    timestamps.set(blockNumber, Number(r.block_timestamp));
    senders.set(txHash, r.tx_from.toLowerCase());
    const isTransfer = r.kind === "transfer_in" || r.kind === "transfer_out";
    rows.push({
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash,
      kind: r.kind,
      reserve: r.reserve.toLowerCase(),
      amount: isTransfer && r.index_raw != null ? (BigInt(r.amount) * BigInt(r.index_raw)) / RAY : BigInt(r.amount),
      ...(r.collateral_asset ? { collateralAsset: r.collateral_asset.toLowerCase() } : {}),
      ...(r.liquidated_collateral_amount != null
        ? { liquidatedCollateralAmount: BigInt(r.liquidated_collateral_amount) }
        : {}),
      ...(r.liquidator ? { liquidator: r.liquidator.toLowerCase() } : {}),
      ...(r.pool_caller ? { poolCaller: r.pool_caller.toLowerCase() } : {}),
      ...(r.counterparty ? { counterparty: r.counterparty.toLowerCase() } : {}),
      ...(r.interest_rate_mode != null ? { interestRateMode: Number(r.interest_rate_mode) } : {}),
      ...(r.borrow_rate != null ? { borrowRate: r.borrow_rate } : {}),
      ...(r.use_a_tokens != null ? { useATokens: r.use_a_tokens } : {}),
    });
  }
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
  return { rows, timestamps, senders };
}

/** A response's `heavy.seed` → the replay's seed, the reader's own mapping
 *  applied (decimal strings to bigints, reserves lowercased). Null when the
 *  response carries none this build speaks. */
function seedOf(json) {
  const s = json.heavy?.seed;
  if (!s || s.version !== SEED_VERSION) return null;
  return {
    wallet: { ...s.wallet },
    reserves: s.reserves.map((r) => ({
      reserve: r.reserve.toLowerCase(),
      supply: BigInt(r.supply),
      debt: BigInt(r.debt),
      peakSupply: BigInt(r.peakSupply),
      peakDebt: BigInt(r.peakDebt),
      lifetime: Object.fromEntries(LANES.map((l) => [l, BigInt(r.lifetime[l])])),
    })),
  };
}

async function replay(proto, wallet, decoded, fromBlock, fromDeployment, opts = {}) {
  const addrs = new Set();
  for (const d of decoded.rows) {
    addrs.add(d.reserve);
    if (d.collateralAsset) addrs.add(d.collateralAsset);
  }
  for (const r of opts.seed?.reserves ?? []) addrs.add(r.reserve);
  const metas = await resolveV3Tokens([...addrs], proto.chainId);
  return replayAaveV3Rows({
    wallet,
    chainId: proto.chainId,
    rows: decoded.rows,
    metas,
    timestamps: decoded.timestamps,
    senders: decoded.senders,
    maxRendered: opts.maxRendered ?? MAX_RENDERED_EVENTS,
    ...(opts.seed ? { seed: opts.seed } : {}),
    coverage: {
      fromBlock,
      toBlock: fromBlock,
      fromDeployment,
      deployBlock: proto.deployBlock,
      gaps: [],
      source: "index",
    },
  });
}

/** The page's own consumption of a history, reduced to the figures the gate
 *  governs: `v3ViewFromChain` fills the peaks and the activity meta only when
 *  the sweep read the whole life (lib/aave-v3/chain-position-view). The Pool
 *  read is not what is under test here, so it is a bare stub — the view's
 *  peaks, txCount and lastActivityAt come from the history alone. */
function pageFigures(wallet, timelineResult, sweptClean) {
  const stub = {
    wallet,
    pool: "0x",
    blockNumber: 0,
    healthFactor: null,
    avgLiquidationThreshold: 0,
    ltv: 0,
    totalCollateralUsd: 0,
    totalDebtUsd: 0,
    availableBorrowsUsd: 0,
    supplyAssetCount: 0,
    debtAssetCount: 0,
    chainStale: false,
    reserves: [],
  };
  const view = v3ViewFromChain(stub, "base", undefined, timelineResult.events, {
    timeline: timelineResult,
    whole: sweptClean,
  });
  return {
    peakSupplies: view.peakSupplies,
    peakBorrows: view.peakBorrows,
    txCount: view.txCount,
    lastActivityAt: view.lastActivityAt,
  };
}

/** The figures a seeded answer claims, in a form two replays can be compared
 *  on with `===`. Peaks are compared with a zero standing in for an axis
 *  never noted: the whole walk notes a zero for an axis a clamped row
 *  touched, the seed cannot tell that axis from one it never touched, and no
 *  reader draws a zero peak either way (`peaksFrom` skips them). */
const rawOf = (r) => JSON.stringify([...r.lifetimeRaw].sort((a, b) => (a.reserve < b.reserve ? -1 : 1)));
const lanesOf = (r) =>
  JSON.stringify(
    [...r.lifetime].sort((a, b) => (a.symbol < b.symbol ? -1 : 1)).map((f) => [f.symbol, ...LANES.map((l) => f[l])]),
  );
const peaksOf = (r) =>
  JSON.stringify(
    [...r.lifetime]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
      .map((f) => [
        f.symbol,
        f.address,
        f.decimals,
        f.peakSuppliedRaw ?? "0",
        f.peakSupplied ?? 0,
        f.peakBorrowedRaw ?? "0",
        f.peakBorrowed ?? 0,
      ]),
  );

let perturbed = false;

for (const proto of PROTOCOLS) {
  if (ONLY && proto.key !== ONLY) continue;
  console.log(`\n══ ${proto.label} ═══════════════════════════════════════════════`);

  // ── 1 · the heaviest addresses answer, and say what shape they are ─────────
  console.log("── the heaviest addresses ──────────────────────────────────────");
  check(`${proto.label} has heavy addresses to check`, proto.heaviest.length > 0);
  for (const wallet of proto.heaviest) {
    const r = await timeline(proto, wallet);
    const id = `${proto.key} ${wallet.slice(0, 10)}…`;
    check(`${id} answers 200`, r.ok, r.ok ? "" : `http ${r.status} after ${r.ms}ms`);
    if (!r.ok) continue;
    const j = r.json;
    const seeded = j.heavy?.seed != null;
    console.log(
      `${id} ${r.ms}ms · ${j.rows.length} rows · heavy=${j.heavy != null}${seeded ? ` · SEEDED v${j.heavy.seed.version} at ${j.heavy.seed.cutBlock} (${j.heavy.seed.wallet.events} events before, computed ${j.heavy.seed.computedAt})` : " · unseeded (horizon)"}`,
    );
    check(`${id} answers inside the statement timeout`, r.ms < STATEMENT_TIMEOUT_MS, `${r.ms}ms`);
    check(`${id} took the heavy path`, j.heavy != null);
    if (!j.heavy) continue;
    if (seeded) {
      const seed = j.heavy.seed;
      check(`${id} the seed is version ${SEED_VERSION}`, seed.version === SEED_VERSION, `${seed.version}`);
      check(
        `${id} the cut is the seed's block boundary`,
        j.heavy.cut.block === seed.cutBlock && j.heavy.cut.txIndex === 0 && j.heavy.cut.logIndex === 0,
        JSON.stringify(j.heavy.cut),
      );
      check(
        `${id} every row is at or after the cut`,
        j.rows.every((x) => Number(x.block_number) >= seed.cutBlock),
      );
      check(
        `${id} totalEvents is the seed's events plus the rows`,
        j.totalEvents === seed.wallet.events + j.rows.length,
        `${j.totalEvents} vs ${seed.wallet.events} + ${j.rows.length}`,
      );
      check(`${id} the seed holds rows before the cut`, seed.wallet.events > 0, `${seed.wallet.events}`);
      check(`${id} the seed names reserves`, seed.reserves.length > 0, `${seed.reserves.length}`);
      check(`${id} nothing is claimed truncated`, j.truncated === false);
    } else {
      check(`${id} the tail is at most TAIL_ROWS`, j.rows.length > 0 && j.rows.length <= TAIL_ROWS, `${j.rows.length}`);
      const first = j.rows[0];
      check(
        `${id} the cut IS the tail's oldest row`,
        j.heavy.cut.block === Number(first.block_number) &&
          j.heavy.cut.txIndex === first.tx_index &&
          j.heavy.cut.logIndex === first.log_index,
        JSON.stringify(j.heavy.cut),
      );
      check(
        `${id} the tail carries no row older than the cut`,
        j.rows.every(
          (x) =>
            Number(x.block_number) > j.heavy.cut.block ||
            (Number(x.block_number) === j.heavy.cut.block &&
              (x.tx_index > j.heavy.cut.txIndex ||
                (x.tx_index === j.heavy.cut.txIndex && x.log_index >= j.heavy.cut.logIndex))),
        ),
      );
      check(`${id} nothing is claimed truncated`, j.truncated === false);
    }

    // The reader's own read — the coverage the page will actually see.
    const read = await loadAaveV3EventsFromIndex({
      wallet,
      chainId: proto.chainId,
      apiPrefix: proto.apiPrefix,
      deployBlock: proto.deployBlock,
    });
    check(`${id} the reader reports it heavy`, read?.heavy === true);
    check(`${id} the coverage names the index`, read?.result.coverage.source === "index");
    const sweptClean = (read?.result.coverage.gaps.length ?? 1) === 0 && read?.result.coverage.fromDeployment === true;
    const figures = pageFigures(wallet, read.result, sweptClean);
    if (seeded) {
      // A seeded answer is whole, and the page's gate must let it through:
      // the peaks, the transaction count and the last-activity stamp are the
      // replay's own, opened from the seed.
      check(`${id} the reader claims the whole life`, read?.whole === true, read?.reason ?? "");
      check(`${id} the reader withholds no reason`, read?.reason === undefined, read?.reason ?? "");
      check(`${id} the coverage is from the deployment`, read?.result.coverage.fromDeployment === true);
      check(
        `${id} the coverage starts at the Pool's first block`,
        read?.result.coverage.fromBlock === proto.deployBlock,
        `${read?.result.coverage.fromBlock}`,
      );
      check(`${id} the page's sweptClean gate is open`, sweptClean === true);
      check(
        `${id} the transaction count is served, seed included`,
        figures.txCount === read.result.txCount && figures.txCount >= j.heavy.seed.wallet.txCount,
        `${figures.txCount} (seed ${j.heavy.seed.wallet.txCount})`,
      );
      check(`${id} the last-activity stamp is served`, figures.lastActivityAt > 0, `${figures.lastActivityAt}`);
      check(
        `${id} the peaks are served`,
        figures.peakSupplies.length + figures.peakBorrows.length > 0,
        `${figures.peakSupplies.length} supply / ${figures.peakBorrows.length} borrow`,
      );
      check(
        `${id} coverage.omitted counts the seeded rows`,
        (read.result.coverage.omitted?.count ?? 0) >= j.heavy.seed.wallet.events,
        `${read.result.coverage.omitted?.count} vs ${j.heavy.seed.wallet.events}`,
      );
      check(
        `${id} coverage.firstEventAt is the seed's first stamp`,
        read.result.coverage.firstEventAt === j.heavy.seed.wallet.firstTimestamp,
        `${read.result.coverage.firstEventAt} vs ${j.heavy.seed.wallet.firstTimestamp}`,
      );
    } else {
      check(`${id} the reader does not claim the whole life`, read?.whole === false);
      check(`${id} the coverage is a horizon`, read?.result.coverage.fromDeployment === false);
      check(
        `${id} the horizon starts past the Pool's first block`,
        (read?.result.coverage.fromBlock ?? 0) > proto.deployBlock,
        `${read?.result.coverage.fromBlock}`,
      );
      // The page's own gate, applied here: a horizon must not pass it, or the
      // peaks and the lifetime layer would be drawn over a two-thousand-row window.
      check(`${id} the page's sweptClean gate is closed`, sweptClean === false);
      check(`${id} the peaks are withheld`, figures.peakSupplies.length === 0 && figures.peakBorrows.length === 0);
      check(`${id} the transaction count is withheld`, figures.txCount === 0);
      check(`${id} the last-activity stamp is withheld`, figures.lastActivityAt === 0);
      // Not vacuous: the same call over the same history, told it is whole, fills
      // them — so what closes the figures is the gate and not an empty replay.
      const asWhole = pageFigures(wallet, read.result, true);
      check(`${id} the same history read as whole WOULD fill them`, asWhole.txCount > 0, `${asWhole.txCount}`);
    }
  }

  // ── 2 · the tail is the whole history's own suffix ─────────────────────────
  console.log("\n── the tail against a whole-history read ───────────────────────");
  const paired = [];
  for (const wallet of proto.pairedCandidates) {
    if (paired.length >= proto.pairedWanted) break;
    const heavy = await timeline(proto, wallet);
    if (!heavy.ok || heavy.json.heavy == null) continue;
    const full = await timeline(proto, wallet, true);
    if (!full.ok) {
      console.log(`  ${wallet.slice(0, 10)}… skipped — ?full=1 answered ${full.status} after ${full.ms}ms`);
      continue;
    }
    if (full.json.heavy != null) {
      check("the route answers the whole history for ?full=1", false, "TIMELINE_FULL_DEBUG is not set on the box");
      break;
    }
    paired.push({ wallet, heavy: heavy.json, full: full.json, msHeavy: heavy.ms, msFull: full.ms });
  }
  check(
    `${proto.label}: found ${proto.pairedWanted} heavy wallets with a ?full=1 baseline`,
    paired.length === proto.pairedWanted,
    `${paired.length}`,
  );

  for (const p of paired) {
    const { wallet } = p;
    const id = `${proto.key} ${wallet.slice(0, 10)}…`;
    const seed = seedOf(p.heavy);
    console.log(
      `${id} heavy ${p.heavy.rows.length} rows/${p.msHeavy}ms · full ${p.full.rows.length} rows/${p.msFull}ms · ${seed ? `SEEDED at ${p.heavy.heavy.cut.block}` : "unseeded"}`,
    );
    check(`${id} the full read is above the gate`, p.full.rows.length > HEAVY_ROWS, `${p.full.rows.length}`);

    if (PERTURB && !perturbed && p.heavy.rows.length > 0) {
      perturbed = true;
      const victim = p.heavy.rows[0];
      victim.amount = String(BigInt(victim.amount) + BigInt(1));
      console.log(`\n--perturb: ${id} the tail's oldest row's amount +1 wei. The run MUST go red.\n`);
    }

    // One history on both sides: cut the full list at the heavy read's own
    // newest row, so rows Sieve wrote between the two reads are on neither.
    // (A seeded answer with an EMPTY tail — a wallet dormant since before
    // its cut — has no newest row; the full list stands as it is.)
    const key = (r) => [Number(r.block_number), r.tx_index, r.log_index];
    const le = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2]);
    const fullRows =
      p.heavy.rows.length > 0
        ? p.full.rows.filter((r) => le(key(r), key(p.heavy.rows[p.heavy.rows.length - 1])))
        : p.full.rows;

    // The tail is a SUFFIX of the whole list, row for row — a mis-cut cannot
    // pass as a matching replay.
    const suffix = fullRows.slice(fullRows.length - p.heavy.rows.length);
    const rowKey = (r) =>
      `${r.block_number}:${r.tx_index}:${r.log_index}:${r.kind}:${r.reserve}:${r.amount}:${r.index_raw}`;
    check(
      `${id} the tail is the whole list's own suffix`,
      suffix.length === p.heavy.rows.length && suffix.every((r, i) => rowKey(r) === rowKey(p.heavy.rows[i])),
    );
    const cut = p.heavy.heavy.cut;

    if (seed) {
      // ── Seeded: seed + tail == whole, on every figure the page draws ─────
      // The seed summarises exactly the rows before its cut, and the tail is
      // exactly the rows at or after it.
      const before = fullRows.filter((r) => Number(r.block_number) < cut.block).length;
      check(
        `${id} the full list holds exactly the seed's events before the cut`,
        before === seed.wallet.events,
        `${before} vs ${seed.wallet.events}`,
      );
      check(
        `${id} the tail is every row at or after the cut`,
        fullRows.length - before === p.heavy.rows.length,
        `${fullRows.length - before} vs ${p.heavy.rows.length}`,
      );
      // Both replays draw the same newest rows: the whole one is asked for
      // as many as the seeded one can draw, so the drawn lists compare.
      const drawn = Math.min(p.heavy.rows.length, MAX_RENDERED_EVENTS);
      const fromSeed = await replay(proto, wallet, decode(p.heavy), proto.deployBlock, true, {
        seed,
        maxRendered: drawn,
      });
      const whole = await replay(proto, wallet, decode({ ...p.full, rows: fullRows }), proto.deployBlock, true, {
        maxRendered: drawn,
      });
      check(
        `${id} every lifetime lane of every reserve, raw === (seed + tail vs whole)`,
        rawOf(fromSeed) === rawOf(whole),
      );
      check(`${id} every scaled lifetime lane, bit for bit`, lanesOf(fromSeed) === lanesOf(whole));
      check(`${id} every peak on both axes, raw and scaled`, peaksOf(fromSeed) === peaksOf(whole));
      check(`${id} txCount`, fromSeed.txCount === whole.txCount, `${fromSeed.txCount} vs ${whole.txCount}`);
      check(
        `${id} coverage.firstEventAt is the whole list's own first`,
        fromSeed.coverage.firstEventAt === whole.coverage.firstEventAt,
        `${fromSeed.coverage.firstEventAt} vs ${whole.coverage.firstEventAt}`,
      );
      check(
        `${id} lastActivityAt`,
        fromSeed.lastActivityAt === whole.lastActivityAt,
        `${fromSeed.lastActivityAt} vs ${whole.lastActivityAt}`,
      );
      check(
        `${id} the drawn events are the whole list's own newest ${drawn}, running balances included`,
        JSON.stringify(fromSeed.events) === JSON.stringify(whole.events),
      );
      check(
        `${id} coverage.omitted counts the seeded rows and the undrawn tail`,
        (fromSeed.coverage.omitted?.count ?? 0) === (whole.coverage.omitted?.count ?? 0) &&
          (fromSeed.coverage.omitted?.count ?? 0) === seed.wallet.events + p.heavy.rows.length - drawn,
        `${fromSeed.coverage.omitted?.count} vs ${whole.coverage.omitted?.count}`,
      );
      // And the page's figures, through its own gate, are the whole life's.
      const a = pageFigures(wallet, fromSeed, true);
      const b = pageFigures(wallet, whole, true);
      check(
        `${id} the page's figures from the seeded read are the whole life's`,
        JSON.stringify(a) === JSON.stringify(b),
      );
      check(
        `${id} the seed is not vacuous — the whole life counts more transactions than the tail alone`,
        whole.txCount > fromSeed.txCount - seed.wallet.txCount,
        `${whole.txCount} whole, ${seed.wallet.txCount} seeded`,
      );
    } else {
      // ── Unseeded: a horizon, and only the horizon's own figures ─────────
      // No transaction lands on both sides of the cut: the whole list holds no
      // row of the cut's own transaction older than the cut.
      check(
        `${id} the cut is a transaction boundary`,
        !fullRows.some(
          (r) => Number(r.block_number) === cut.block && r.tx_index === cut.txIndex && r.log_index < cut.logIndex,
        ),
      );

      // What the horizon path CLAIMS: a replay over the tail. Compared against a
      // replay over the same rows lifted out of the whole answer — two
      // independent reads of the same history, replayed to the same figures.
      const horizon = await replay(proto, wallet, decode(p.heavy), cut.block, false);
      const fromFull = await replay(proto, wallet, decode({ ...p.full, rows: suffix }), cut.block, false);
      check(
        `${id} the horizon replay is the replay over those same rows`,
        JSON.stringify(horizon) === JSON.stringify(fromFull),
      );

      // And what it does NOT claim: the whole life. The tail's gross flows can
      // only be a part of the whole history's, per asset and per axis.
      const whole = await replay(proto, wallet, decode({ ...p.full, rows: fullRows }), proto.deployBlock, true);
      const wholeBySymbol = new Map(whole.lifetime.map((f) => [f.symbol, f]));
      let strictlyShort = 0;
      for (const f of horizon.lifetime) {
        const w = wholeBySymbol.get(f.symbol);
        if (!w) {
          check(`${id} ${f.symbol} is a symbol the whole replay knows`, false);
          continue;
        }
        for (const axis of LANES) {
          check(
            `${id} ${f.symbol} ${axis} is a part of the whole`,
            f[axis] <= w[axis] * (1 + 1e-9),
            `${f[axis]} vs ${w[axis]}`,
          );
          if (f[axis] < w[axis]) strictlyShort++;
        }
      }
      // Not asserted, because it does not have to hold: a wallet whose elided
      // rows are all aToken transfers has the same GROSS FLOWS in the tail as in
      // its whole life (a custody move is neither a deposit nor a withdrawal, so
      // it contributes to no flow), and two of Aave V3 Base's paired wallets are
      // exactly that. The transaction count below is the figure that always
      // separates the two, and it is the one asserted.
      console.log(`${id} lifetime figures strictly short of the whole life: ${strictlyShort}`);
      check(
        `${id} the whole replay counts more transactions`,
        whole.txCount > horizon.txCount,
        `${whole.txCount} vs ${horizon.txCount}`,
      );
    }
  }

  // ── 3 · below the gate, nothing moved ──────────────────────────────────────
  console.log("\n── a regular wallet ────────────────────────────────────────────");
  {
    const gated = await timeline(proto, proto.regular);
    const full = await timeline(proto, proto.regular, true);
    const id = `${proto.key} ${proto.regular.slice(0, 10)}…`;
    check(`${id} answers 200`, gated.ok && full.ok);
    if (gated.ok && full.ok) {
      console.log(`${id} ${gated.json.rows.length} rows · ${gated.ms}ms`);
      check(`${id} carries no heavy key`, gated.json.heavy === undefined);
      check(
        `${id} the wallet is below the gate`,
        gated.json.rows.length < HEAVY_ROWS,
        `${gated.json.rows.length} rows`,
      );
      check(`${id} the wallet has a history to compare`, gated.json.rows.length > 0);
      // `coverage` advances with the live index between the two reads; it is
      // the one field that legitimately differs.
      const strip = (j) => {
        const { coverage: _coverage, ...rest } = j;
        return JSON.stringify(rest);
      };
      check(`${id} the gated answer is the full answer, byte for byte`, strip(gated.json) === strip(full.json));
    }
  }
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
