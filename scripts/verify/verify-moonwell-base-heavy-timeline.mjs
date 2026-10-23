// A HEAVY Moonwell Base wallet answers, and what it says about itself is true.
// ----------------------------------------------------------------------------
// /api/moonwell-base/timeline sends one of the three dozen addresses whose
// history is millions of rows the rows from a CUT plus what the history
// before the cut travels as. Two shapes, and this script branches on which
// one each wallet answered with:
//
//   • SEEDED — `heavy.seed` (mig 204, filled offline): the replay's whole
//     state at a block-boundary cut — per market the supply principal, the
//     mToken balance, the debt, both peaks and the raw lifetime flows; for
//     the wallet the counts and the stamps — and `rows` is EVERY row after
//     the cut. The reader replays the tail from that state and the answer is
//     a whole life.
//   • HORIZON — no `heavy.seed` (none stored yet, or the tail past the
//     stored seed outgrew what the route reads whole): the newest TAIL_ROWS
//     plus `heavy.seeds`, the DEBT lane's state at the cut aggregated per
//     request. Everything else is stated as a horizon rather than replayed
//     from zero.
//
// The claims checked:
//
//   1. THE HEAVIEST ADDRESSES ANSWER. 0x416ec2ca…, the mWETH market's own
//      contract and the WETH Router each 500'd after 30 seconds before the
//      gate. Each must now answer 200 inside the statement timeout. A horizon
//      answer's tail is no longer than TAIL_ROWS and its cut IS its oldest
//      row; a seeded answer's cut is the seed's block boundary, its tail
//      carries no row before it, and `totalEvents` is the seed's events plus
//      the tail's.
//
//   2. THE COVERAGE SAYS WHICH. The reader's own `loadMoonwellEventsFromIndex`
//      is called for each heavy wallet. A horizon must say
//      `fromDeployment: false` from past the Comptroller's first block — the
//      flag the page reads (`sweptClean`) to withhold the peaks, the
//      transaction count and the lifetime layer; a heavy reply that claimed
//      the whole life would draw a two-thousand-row window as a lifetime. A
//      seeded answer must say `fromDeployment: true` from the Comptroller's
//      first block, `whole`, with the page's gate OPEN: the elided part
//      travelled as state and nothing is missing from the record.
//
//   3. BELOW THE GATE. A regular wallet's response carries no `heavy` key.
//
// The checks that compared a heavy answer against a `?full=1` read (the seed
// against a replay over every row, and a regular wallet's gated answer against
// its full one) are retired: `?full=1` answers only while the box sets
// TIMELINE_FULL_DEBUG=1, and the flag stays off (ruled 15 Oct 2026; the Aave
// family's verifier did the same in 25660add). Until the seed table is filled
// every heavy wallet answers as a horizon and the seeded branch here does not
// run; the run says so.
//
// Run:
//   node scripts/verify/verify-moonwell-base-heavy-timeline.mjs
//   WALLET=0x… node scripts/verify/verify-moonwell-base-heavy-timeline.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both, exactly as
// verify-morpho-base-heavy-timeline.mjs does.
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

const { marketMapFromRoster } = await import("../../lib/sources/chain/moonwell-events.ts");
const { resolveMoonwellRoster } = await import("../../lib/sources/chain/moonwell-roster.ts");
const { loadMoonwellEventsFromIndex } = await import("../../lib/sources/api/moonwell-base-timeline.ts");
const { MOONWELL_BASE_DEPLOYMENT, MOONWELL_BASE_DEPLOY_BLOCK, MOONWELL_BASE_WETH_ROUTER } = await import(
  "../../lib/moonwell-base/asset-catalog.ts"
);

/** The three heaviest addresses on the lane (census, 2026-09-05): a strategy
 *  contract at 3,923,484 rows, the mWETH market's own contract at 2,650,027
 *  and the WETH Router at 2,230,035. Each 500'd before the gate. */
const HEAVIEST = [
  "0x416ec2ca21a38cbcfeacd6a14532b3f348356d23",
  "0x628ff693426583d9a7fb391e54366292f509d457",
  "0x70778cfcfc475c7ea0f24cc625baf6eae475d0c9",
];

/** A wallet far below the gate — its answer must not have moved at all. */
const REGULAR = "0x7a570ff8d6b1bb62b430f826535deeb47a897077";

/** The route's own tail size (api/src/routes/baseMoonwell.ts TAIL_ROWS). */
const TAIL_ROWS = 2_000;
/** The pool's statement timeout on the box — the wall the gate exists to keep
 *  the read inside. */
const STATEMENT_TIMEOUT_MS = 30_000;

const ONLY = process.env.WALLET ? process.env.WALLET.toLowerCase() : null;

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

const timeline = (wallet) => get(`${base}/api/moonwell-base/timeline?wallet=${wallet}`);

const roster = await resolveMoonwellRoster(MOONWELL_BASE_DEPLOYMENT);
if (!roster) {
  console.log("FAIL  the Moonwell Base roster could not be read — BASE_RPC_URL?");
  process.exit(1);
}
const marketByMtoken = marketMapFromRoster(roster);

/** The one seed grammar the reader speaks (lib/sources/api/moonwell-base-
 *  timeline.ts SEED_VERSION). */
const SEED_VERSION = 1;
const isSeeded = (json) => json.heavy?.seed != null && json.heavy.seed.version === SEED_VERSION;

// ── 1 · the heaviest addresses answer, and say which shape they are ──────────
console.log("── the heaviest addresses ──────────────────────────────────────");
/** How many heavy answers carried a seed — the run says at the end whether
 *  the seeded branch was exercised at all. */
let seededSeen = 0;
for (const wallet of ONLY ? [ONLY] : HEAVIEST) {
  const r = await timeline(wallet);
  const id = `${wallet.slice(0, 10)}…`;
  check(`${id} answers 200`, r.ok, r.ok ? "" : `http ${r.status} after ${r.ms}ms`);
  if (!r.ok) continue;
  const j = r.json;
  const seededAnswer = isSeeded(j);
  console.log(
    `${id} ${r.ms}ms · ${j.rows.length} rows · heavy=${j.heavy != null} · seeds=${j.heavy?.seeds.length ?? 0} · ${
      seededAnswer
        ? `SEEDED (v${j.heavy.seed.version}, ${j.heavy.seed.wallet.events} events before the cut)`
        : "horizon"
    }`,
  );
  check(`${id} answers inside the statement timeout`, r.ms < STATEMENT_TIMEOUT_MS, `${r.ms}ms`);
  check(`${id} took the heavy path`, j.heavy != null);
  if (!j.heavy) continue;
  if (seededAnswer) {
    seededSeen++;
    const seed = j.heavy.seed;
    check(
      `${id} the cut is the seed's block boundary`,
      seed.cutBlock === j.heavy.cut.block && j.heavy.cut.txIndex === 0 && j.heavy.cut.logIndex === 0,
      JSON.stringify(j.heavy.cut),
    );
    check(
      `${id} the tail carries no row before the cut block`,
      j.rows.every((x) => Number(x.block_number) >= j.heavy.cut.block),
    );
    check(
      `${id} totalEvents is the seed's events plus the tail's rows`,
      j.totalEvents === seed.wallet.events + j.rows.length,
      `${j.totalEvents} vs ${seed.wallet.events} + ${j.rows.length}`,
    );
    check(`${id} the debt-only seeds ride beside the seed for the older reader`, Array.isArray(j.heavy.seeds));
    check(
      `${id} every seeded market is one the roster names`,
      seed.markets.every((m) => marketByMtoken.has(m.market.toLowerCase())),
    );
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
  }
  check(`${id} nothing is claimed truncated`, j.truncated === false);

  // The reader's own read — the coverage the page will actually see.
  const read = await loadMoonwellEventsFromIndex({
    wallet,
    deployment: MOONWELL_BASE_DEPLOYMENT,
    deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
    router: MOONWELL_BASE_WETH_ROUTER,
    apiPrefix: "/api/moonwell-base",
  });
  check(`${id} the reader reports it heavy`, read?.heavy === true);
  // The page's own gate, applied here. A horizon must not pass it, or the
  // peaks and the lifetime layer would be drawn over a two-thousand-row
  // window; a seeded answer must, or a whole life would be withheld.
  const sweptClean = (read?.result.coverage.gaps.length ?? 1) === 0 && read?.result.coverage.fromDeployment === true;
  if (seededAnswer) {
    const seed = j.heavy.seed;
    check(`${id} the reader claims the whole life`, read?.whole === true, read?.reason ?? "");
    check(`${id} the coverage is from deployment`, read?.result.coverage.fromDeployment === true);
    check(
      `${id} the record starts at the Comptroller's first block`,
      read?.result.coverage.fromBlock === MOONWELL_BASE_DEPLOY_BLOCK,
      `${read?.result.coverage.fromBlock}`,
    );
    check(`${id} the page's sweptClean gate is open`, sweptClean === true);
    check(
      `${id} the replay counts the seed's events and transactions`,
      (read?.result.totalEvents ?? -1) >= seed.wallet.events &&
        (read?.result.totalEvents ?? Infinity) <= j.totalEvents &&
        (read?.result.txCount ?? 0) >= seed.wallet.txCount,
      `${read?.result.totalEvents} events (seed ${seed.wallet.events}, served ${j.totalEvents}) · ${read?.result.txCount} txs`,
    );
    // The seeded rows are omitted from the drawn list, and the guarantee
    // "everything the wallet signed is drawn" is WITHHELD — a seed makes it
    // unstatable, because its rows were replayed into it and were never here
    // to anchor. This read `omitted.anchored === undefined` until 2026-09-20,
    // which was the contract until `4fe15605` split the field's two jobs: the
    // count now rides beside a seed (even at 0) and the licence moved to
    // `anchoredComplete`. That commit updated the boundary-card verifier's
    // check 6 and not this one, which answers only against the deployed box
    // and had not been re-run since.
    const om = read?.result.coverage.omitted;
    check(
      `${id} the replay omits the seeded rows from the drawn list, without the anchored licence`,
      (om?.count ?? 0) >= seed.wallet.events && om?.anchoredComplete === false,
      `omitted ${om?.count ?? "—"} of the seed's ${seed.wallet.events} · anchored ${String(om?.anchored)}` +
        ` · anchoredComplete ${String(om?.anchoredComplete)}`,
    );
    if (seed.wallet.events > 0)
      check(
        `${id} the first stamp is the seed's`,
        read?.result.coverage.firstEventAt === seed.wallet.firstTimestamp,
        `${read?.result.coverage.firstEventAt} vs ${seed.wallet.firstTimestamp}`,
      );
  } else {
    check(`${id} the reader does not claim the whole life`, read?.whole === false);
    check(`${id} the coverage is a horizon`, read?.result.coverage.fromDeployment === false);
    check(
      `${id} the horizon is past the Comptroller's first block`,
      (read?.result.coverage.fromBlock ?? 0) > MOONWELL_BASE_DEPLOY_BLOCK,
      `${read?.result.coverage.fromBlock}`,
    );
    check(`${id} the page's sweptClean gate is closed`, sweptClean === false);
  }
}

// ── 2 · below the gate ───────────────────────────────────────────────────────
console.log("\n── a regular wallet ────────────────────────────────────────────");
{
  const gated = await timeline(REGULAR);
  const id = `${REGULAR.slice(0, 10)}…`;
  check(`${id} answers 200`, gated.ok);
  if (gated.ok) {
    console.log(`${id} ${gated.json.rows.length} rows · ${gated.ms}ms`);
    check(`${id} carries no heavy key`, gated.json.heavy === undefined);
    check(`${id} the wallet is below the gate`, gated.json.rows.length < 20_000, `${gated.json.rows.length} rows`);
  }
}

console.log(
  seededSeen > 0
    ? `\nseeded branch: exercised on ${seededSeen} heavy answer${seededSeen === 1 ? "" : "s"}`
    : "\nseeded branch: NOT exercised — every heavy answer was a horizon (no seed stored on the server yet)",
);
console.log(`${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
