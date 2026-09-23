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
//   2. THE SEED IS WHAT A REPLAY OVER EVERY ROW REACHES. For the heavy
//      wallets whose whole history the route can still read (`?full=1`), the
//      seeded replay and a replay over every row are compared. Horizon: per
//      market, debtRaw and peakDebtRaw, wei-exact. Seeded: every position
//      field, both peaks, txCount, totalEvents, liquidationCount, the first
//      and last stamps, and every lifetime leg with `===` on the raw strings.
//      The two are independent — one is a SQL aggregate on the Base box, the
//      other a walk of the rows here — so an agreement between them is
//      evidence rather than a tautology. `--perturb` moves one seed by a wei
//      and must turn the run red.
//
//   3. THE COVERAGE SAYS WHICH. The reader's own `loadMoonwellEventsFromIndex`
//      is called for each heavy wallet. A horizon must say
//      `fromDeployment: false` from past the Comptroller's first block — the
//      flag the page reads (`sweptClean`) to withhold the peaks, the
//      transaction count and the lifetime layer; a heavy reply that claimed
//      the whole life would draw a two-thousand-row window as a lifetime. A
//      seeded answer must say `fromDeployment: true` from the Comptroller's
//      first block, `whole`, with the page's gate OPEN: the elided part
//      travelled as state and nothing is missing from the record.
//
//   4. NOTHING CHANGED BELOW THE GATE. A regular wallet's gated response
//      carries no `heavy` key and equals its `?full=1` answer byte for byte
//      (`coverage` excepted — it advances with the live index between the two
//      reads).
//
// The heaviest three are NOT compared against a `?full=1` baseline: their
// whole history is precisely the read that does not finish inside the
// statement timeout, which is why the gate exists. The equality check runs on
// the heavy wallets that still have a baseline to be checked against, and the
// script says which ones it found — and, per wallet, which shape it answered
// with. Until the seed table is filled every heavy wallet answers as a
// horizon and the seeded branch here does not run; the run says so.
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
// the whole history of a heavy wallet is the response this route must not be
// askable for.
//
// Run:
//   node scripts/verify/verify-moonwell-base-heavy-timeline.mjs
//   node scripts/verify/verify-moonwell-base-heavy-timeline.mjs --perturb
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

const { replayMoonwellRows, marketMapFromRoster, transferKind } = await import(
  "../../lib/sources/chain/moonwell-events.ts"
);
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

/** Heavy wallets small enough that `?full=1` still answers — the ones with a
 *  baseline to check the seed against. Tried in this order; the first three
 *  that answer are used, and the run says which. */
const PAIRED_CANDIDATES = [
  "0xf8d7292c418f363805e654f9e86a594696f9f923",
  "0x2696e8017a422af7ee764fa598c7ac3b75007fdb",
  "0xd491601e2c0948026be03899848496ae5d880552",
  "0xc8dc4db49d42372c92f7e02a0ff07ed6bea1464e",
  "0x744a222750a0681fb2f7167bdd00e2ba611f89a9",
  "0x852bf487cc7fc4e0ba6a8ca61bba2afead733586",
];
const PAIRED_WANTED = 3;

/** A wallet far below the gate — its answer must not have moved at all. */
const REGULAR = "0x7a570ff8d6b1bb62b430f826535deeb47a897077";

/** The route's own tail size (api/src/routes/baseMoonwell.ts TAIL_ROWS). */
const TAIL_ROWS = 2_000;
/** The web's wallet-wide render budget for this lane. */
const MAX_RENDERED_EVENTS = 2_000;
/** The pool's statement timeout on the box — the wall the gate exists to keep
 *  the read inside. */
const STATEMENT_TIMEOUT_MS = 30_000;

const PERTURB = process.argv.includes("--perturb");
const ONLY = process.env.WALLET ? process.env.WALLET.toLowerCase() : null;

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

const timeline = (wallet, full = false) =>
  get(`${base}/api/moonwell-base/timeline?wallet=${wallet}${full ? "&full=1" : ""}`);

const roster = await resolveMoonwellRoster(MOONWELL_BASE_DEPLOYMENT);
if (!roster) {
  console.log("FAIL  the Moonwell Base roster could not be read — BASE_RPC_URL?");
  process.exit(1);
}
const marketByMtoken = marketMapFromRoster(roster);
const router = MOONWELL_BASE_WETH_ROUTER.toLowerCase();
const protocolLegs = new Set([...marketByMtoken.keys(), router]);

/** A response's rows → the replay's rows, the reader's own rules applied: the
 *  routed-pair dedupe on (tx, log) and `transferKind` on every raw transfer.
 *  Written out here rather than imported so this file states the shape it is
 *  checking, the way the Morpho heavy verifier does. */
function decode(wallet, json) {
  const seizedIn = new Map();
  for (const r of json.rows) {
    if (r.kind !== "liquidation" || !r.collateral_market) continue;
    const tx = r.tx_hash.toLowerCase();
    if (!seizedIn.has(tx)) seizedIn.set(tx, new Set());
    seizedIn.get(tx).add(r.collateral_market.toLowerCase());
  }
  const timestamps = new Map();
  const rows = [];
  const seen = new Set();
  for (const r of json.rows) {
    const market = r.market.toLowerCase();
    if (!marketByMtoken.has(market)) continue;
    const txHash = r.tx_hash.toLowerCase();
    const key = `${txHash}-${r.log_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const blockNumber = Number(r.block_number);
    const b = {
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash,
      txFrom: r.tx_from.toLowerCase(),
      market,
      txGasUsed: r.tx_gas_used,
      txGasPrice: r.tx_gas_price,
      oracleAtBlock: r.oracle_at_block ?? null,
    };
    const caller = r.caller ? r.caller.toLowerCase() : undefined;
    let row = null;
    if (r.kind === "mint" || r.kind === "redeem")
      row = { ...b, kind: r.kind, caller, amount: BigInt(r.amount), mTokens: BigInt(r.mtokens) };
    else if (r.kind === "borrow")
      row = { ...b, kind: "borrow", amount: BigInt(r.amount), accountBorrows: BigInt(r.account_borrows) };
    else if (r.kind === "repay")
      row = { ...b, kind: "repay", caller, amount: BigInt(r.amount), accountBorrows: BigInt(r.account_borrows) };
    else if (r.kind === "liquidation")
      row = {
        ...b,
        kind: "liquidation",
        caller,
        amount: BigInt(r.amount),
        collateralMarket: r.collateral_market.toLowerCase(),
        seizeTokens: BigInt(r.seize_tokens),
        liquidator: r.liquidator.toLowerCase(),
      };
    else {
      const other = caller;
      const from = r.kind === "transfer_out" ? wallet : other;
      const to = r.kind === "transfer_out" ? other : wallet;
      const kind = transferKind({
        from,
        to,
        wallet,
        protocolLegs,
        protocolCut: to === market && (seizedIn.get(txHash)?.has(market) ?? false),
      });
      if (kind) row = { ...b, kind, caller: other, mTokens: BigInt(r.mtokens) };
    }
    if (!row) continue;
    timestamps.set(blockNumber, Number(r.block_timestamp));
    rows.push(row);
  }
  rows.sort((a, c) => a.blockNumber - c.blockNumber || a.txIndex - c.txIndex || a.logIndex - c.logIndex);
  return { rows, timestamps };
}

/** `state` is `{ seeds }` (a horizon), `{ seed }` (whole) or null (a whole
 *  history replayed from zero). */
function replay(wallet, decoded, state, fromBlock) {
  return replayMoonwellRows({
    wallet,
    chainId: MOONWELL_BASE_DEPLOYMENT.chainId,
    router,
    rows: decoded.rows,
    ...(state ?? {}),
    marketByMtoken,
    timestamps: decoded.timestamps,
    maxRendered: MAX_RENDERED_EVENTS,
    coverage: {
      fromBlock,
      toBlock: fromBlock,
      fromDeployment: state?.seeds == null,
      deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
      gaps: [],
      source: "index",
    },
  });
}

const seedsOf = (json) =>
  json.heavy.seeds.map((s) => ({
    market: s.market.toLowerCase(),
    debtRaw: BigInt(s.debt),
    peakDebtRaw: BigInt(s.peakDebt),
  }));

/** The one seed grammar the reader speaks (lib/sources/api/moonwell-base-
 *  timeline.ts SEED_VERSION). */
const SEED_VERSION = 1;
const isSeeded = (json) => json.heavy?.seed != null && json.heavy.seed.version === SEED_VERSION;

/** `heavy.seed` → the replay's whole seed, the reader's own mapping written
 *  out: roster markets only, every amount a bigint. */
const wholeSeedOf = (json) => {
  const s = json.heavy.seed;
  return {
    ...s.wallet,
    markets: s.markets
      .filter((m) => marketByMtoken.has(m.market.toLowerCase()))
      .map((m) => ({
        market: m.market.toLowerCase(),
        debtRaw: BigInt(m.debt),
        peakDebtRaw: BigInt(m.peakDebt),
        supplyRaw: BigInt(m.supply),
        peakSupplyRaw: BigInt(m.peakSupply),
        mTokensRaw: BigInt(m.mtokens),
        lifetime: {
          supplied: BigInt(m.lifetime.supplied),
          withdrawn: BigInt(m.lifetime.withdrawn),
          borrowed: BigInt(m.lifetime.borrowed),
          repaid: BigInt(m.lifetime.repaid),
          liquidatedDebt: BigInt(m.lifetime.liquidatedDebt),
        },
      })),
  };
};

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

// ── 2 · the seed is the debt a whole-history replay reaches ──────────────────
console.log("\n── the seed against a whole-history replay ─────────────────────");
const paired = [];
for (const wallet of PAIRED_CANDIDATES) {
  if (paired.length >= PAIRED_WANTED) break;
  const heavy = await timeline(wallet);
  if (!heavy.ok || heavy.json.heavy == null) continue;
  const full = await timeline(wallet, true);
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
  `found ${PAIRED_WANTED} heavy wallets with a ?full=1 baseline`,
  paired.length === PAIRED_WANTED,
  `${paired.length}`,
);

let perturbed = false;
for (const p of paired) {
  const { wallet } = p;
  const id = `${wallet.slice(0, 10)}…`;
  console.log(`${id} heavy ${p.heavy.rows.length} rows/${p.msHeavy}ms · full ${p.full.rows.length} rows/${p.msFull}ms`);

  // One history on both sides: cut the full list at the heavy read's own newest
  // row, so rows Sieve wrote between the two reads are on neither side.
  const key = (r) => [Number(r.block_number), r.tx_index, r.log_index];
  // A seeded answer can carry an EMPTY tail (a wallet dormant since before the
  // anchor): the whole list is then everything below the cut's block.
  const newest =
    p.heavy.rows.length > 0
      ? key(p.heavy.rows[p.heavy.rows.length - 1])
      : [p.heavy.heavy.cut.block - 1, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const le = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2]);
  const fullRows = p.full.rows.filter((r) => le(key(r), newest));

  // The tail is a SUFFIX of the whole list, row for row — a mis-cut cannot pass
  // as a matching replay.
  // `slice(-0)` is the whole list, so an empty tail is its own (empty) suffix.
  const suffix = p.heavy.rows.length > 0 ? fullRows.slice(-p.heavy.rows.length) : [];
  const rowKey = (r) => `${r.block_number}:${r.tx_index}:${r.log_index}:${r.kind}:${r.amount}:${r.mtokens}`;
  check(
    `${id} the tail is the whole list's own suffix`,
    suffix.length === p.heavy.rows.length && suffix.every((r, i) => rowKey(r) === rowKey(p.heavy.rows[i])),
  );
  // No transaction lands on both sides of the cut: the whole list holds no row
  // of the cut's own transaction older than the cut.
  const cut = p.heavy.heavy.cut;
  check(
    `${id} the cut is a transaction boundary`,
    !fullRows.some(
      (r) => Number(r.block_number) === cut.block && r.tx_index === cut.txIndex && r.log_index < cut.logIndex,
    ),
  );

  const fullResult = replay(wallet, decode(wallet, { ...p.full, rows: fullRows }), null, MOONWELL_BASE_DEPLOY_BLOCK);

  if (isSeeded(p.heavy)) {
    // ── Seeded: the whole life, field for field ──────────────────────────
    seededSeen++;
    const seed = wholeSeedOf(p.heavy);
    console.log(`${id} SEEDED · ${seed.events} events before block ${cut.block} · ${seed.markets.length} markets`);
    if (PERTURB && seed.markets.length && !perturbed) {
      perturbed = true;
      const m0 = seed.markets[0];
      m0.supplyRaw += BigInt(1);
      m0.lifetime.supplied += BigInt(1);
      console.log(`\n--perturb: ${m0.market.slice(0, 10)}… supply +1 wei, supplied +1 wei. The run MUST go red.\n`);
    }
    const seededResult = replay(wallet, decode(wallet, p.heavy), { seed }, MOONWELL_BASE_DEPLOY_BLOCK);
    const byMarket = new Map(seededResult.positions.map((x) => [x.market, x]));
    check(
      `${id} the same markets on both sides`,
      seededResult.positions.length === fullResult.positions.length &&
        fullResult.positions.every((f) => byMarket.has(f.market)),
      `${seededResult.positions.length} vs ${fullResult.positions.length}`,
    );
    for (const f of fullResult.positions) {
      const s = byMarket.get(f.market);
      const m = `${id} ${f.symbol}`;
      if (!s) {
        check(`${m} the seeded replay has the market`, false, "no position — the seed missed it");
        continue;
      }
      eq(`${m} supplyPrincipalRaw`, s.supplyPrincipalRaw, f.supplyPrincipalRaw);
      eq(`${m} mTokensRaw`, s.mTokensRaw, f.mTokensRaw);
      eq(`${m} debtRaw`, s.debtRaw, f.debtRaw);
      eq(`${m} peakSupplyPrincipalRaw`, s.peakSupplyPrincipalRaw, f.peakSupplyPrincipalRaw);
      eq(`${m} peakDebtRaw`, s.peakDebtRaw, f.peakDebtRaw);
    }
    eq(`${id} txCount`, seededResult.txCount, fullResult.txCount);
    eq(`${id} totalEvents`, seededResult.totalEvents, fullResult.totalEvents);
    eq(`${id} liquidationCount`, seededResult.liquidationCount, fullResult.liquidationCount);
    eq(`${id} firstEventAt`, seededResult.coverage.firstEventAt, fullResult.coverage.firstEventAt);
    eq(`${id} lastActivityAt`, seededResult.lastActivityAt, fullResult.lastActivityAt);
    const rawBy = new Map(seededResult.lifetimeRaw.map((f) => [f.market, f]));
    check(
      `${id} the same lifetime markets on both sides`,
      seededResult.lifetimeRaw.length === fullResult.lifetimeRaw.length &&
        fullResult.lifetimeRaw.every((f) => rawBy.has(f.market)),
    );
    for (const f of fullResult.lifetimeRaw) {
      const s = rawBy.get(f.market);
      if (!s) continue;
      for (const leg of ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedDebt"])
        eq(`${id} ${f.market} lifetime ${leg} raw`, s[leg], f[leg]);
    }
    check(
      `${id} the scaled lifetime is bit for bit the whole replay's`,
      JSON.stringify(seededResult.lifetime) === JSON.stringify(fullResult.lifetime),
    );
    check(`${id} the seeded coverage is from deployment`, seededResult.coverage.fromDeployment === true);
    continue;
  }

  // ── Horizon: the debt lane only ────────────────────────────────────────
  const seeds = seedsOf(p.heavy);
  if (PERTURB && seeds.length && !perturbed) {
    perturbed = true;
    seeds[0].debtRaw += BigInt(1);
    seeds[0].peakDebtRaw += BigInt(1);
    console.log(`\n--perturb: ${seeds[0].market.slice(0, 10)}… debt +1 wei, peak +1 wei. The run MUST go red.\n`);
  }

  const seededResult = replay(wallet, decode(wallet, p.heavy), { seeds }, cut.block);

  const byMarket = new Map(seededResult.positions.map((x) => [x.market, x]));
  let debtMarkets = 0;
  for (const f of fullResult.positions) {
    // The seed's whole claim is the debt lane; the other lanes are a horizon
    // by design and the coverage says so, so they are not compared.
    if (f.debtRaw === "0" && f.peakDebtRaw === "0") continue;
    debtMarkets++;
    const s = byMarket.get(f.market);
    const m = `${id} ${f.symbol}`;
    if (!s) {
      check(`${m} the seeded replay has the market`, false, "no position — the seed missed it");
      continue;
    }
    eq(`${m} debtRaw`, s.debtRaw, f.debtRaw);
    eq(`${m} peakDebtRaw`, s.peakDebtRaw, f.peakDebtRaw);
  }
  check(`${id} at least one market carries a debt to check`, debtMarkets > 0, `${debtMarkets}`);
  check(
    `${id} every seeded market is one the whole replay knows`,
    seeds.every((s) => fullResult.positions.some((f) => f.market === s.market) || !marketByMtoken.has(s.market)),
  );
  check(`${id} the horizon coverage is not from deployment`, seededResult.coverage.fromDeployment === false);
}

// ── 3 · below the gate, nothing moved ────────────────────────────────────────
console.log("\n── a regular wallet ────────────────────────────────────────────");
{
  const gated = await timeline(REGULAR);
  const full = await timeline(REGULAR, true);
  const id = `${REGULAR.slice(0, 10)}…`;
  check(`${id} answers 200`, gated.ok && full.ok);
  if (gated.ok && full.ok) {
    console.log(`${id} ${gated.json.rows.length} rows · ${gated.ms}ms`);
    check(`${id} carries no heavy key`, gated.json.heavy === undefined);
    // `coverage` advances with the live index between the two reads; it is the
    // one field that legitimately differs.
    const strip = (j) => {
      const { coverage: _coverage, ...rest } = j;
      return JSON.stringify(rest);
    };
    check(`${id} the gated answer is the full answer, byte for byte`, strip(gated.json) === strip(full.json));
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
