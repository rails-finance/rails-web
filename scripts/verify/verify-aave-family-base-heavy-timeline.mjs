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
//   2. WHAT IS CLAIMED IS SERVED, AND WHAT IS NOT IS WITHHELD. The reader's
//      own `loadAaveV3EventsFromIndex` is called for each heavy wallet.
//      Unseeded, its coverage must say `fromDeployment: false` from the cut
//      and the page's own gate (`v3ViewFromChain`) must return the peaks, the
//      transaction count and the last-activity stamp empty, where the same
//      call on a whole answer fills them. Seeded, the coverage must say
//      `fromDeployment: true` from the Pool's first block with no reason
//      withheld, and the gate must let those same figures through.
//
// The checks that compared a heavy answer against a `?full=1` read (the tail as
// the whole list's suffix, seed plus tail against the whole replay, and a
// regular wallet's gated answer against its full one) are retired: `?full=1`
// answers only while the box sets TIMELINE_FULL_DEBUG=1, and the flag stays off.
//
// Run:
//   node scripts/verify/verify-aave-family-base-heavy-timeline.mjs
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

const { loadAaveV3EventsFromIndex } = await import("../../lib/sources/api/aave-v3-base-timeline.ts");
const { v3ViewFromChain } = await import("../../lib/aave-v3/chain-position-view.ts");
const { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_DEPLOY_BLOCK } = await import("../../lib/aave-v3-base/asset-catalog.ts");
const { SEAMLESS_CHAIN_ID, SEAMLESS_DEPLOY_BLOCK } = await import("../../lib/seamless/asset-catalog.ts");

/** The route's own tail size (api/src/routes/baseLending.ts TAIL_ROWS). */
const TAIL_ROWS = 2_000;
/** The pool's statement timeout on the box — the wall the gate keeps the read
 *  inside. */
const STATEMENT_TIMEOUT_MS = 30_000;
/** The seed grammar the reader speaks (SEED_VERSION in the reader). */
const SEED_VERSION = 1;

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
  },
];

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

const timeline = (proto, wallet) => get(`${base}${proto.apiPrefix}/timeline?wallet=${wallet}`);

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
      // A wallet the server names as plumbing (a WETH gateway, a router)
      // states no peak (rails-ops decision 0024); any other is served one.
      if (j.peakWithheld === "plumbing")
        check(
          `${id} the peaks are withheld (plumbing)`,
          figures.peakSupplies.length + figures.peakBorrows.length === 0,
          `${figures.peakSupplies.length} supply / ${figures.peakBorrows.length} borrow`,
        );
      else
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
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
