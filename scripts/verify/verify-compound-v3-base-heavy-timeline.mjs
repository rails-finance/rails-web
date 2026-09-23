// A HEAVY Compound V3 Base wallet answers, and what it says about itself is true.
// ----------------------------------------------------------------------------
// /api/compound-base/timeline answers one wallet's whole history across the five
// Comets, and for six addresses that is far more than a page can use: the
// heaviest is 161,864 rows — 69.3 MB after 4.2s on the box, replayed row by row
// in the browser to draw two thousand. Four of the six are unnamed strategy
// contracts and two are busy bots. Such a wallet now gets its newest rows, the
// block they start at, and — from a server that computes them — one SEED per
// market: the replay's exact state at the cut, so the elided history travels
// as state and the wallet is still a whole life.
//
// Which of the two the reader is looking at is decided by the response alone:
// `heavy.seeds` present means the web replays each market from its seed and
// the coverage says `fromDeployment: true` from the earliest Comet's first
// block; absent (an older server) means the cut is a HORIZON — `fromDeployment:
// false` from the cut — and the page's `sweptClean` gate withholds the
// principal, the peaks, the transaction count and the lifetime layer. Both are
// checked here, each against what it claims:
//
//   1. THE HEAVIEST ADDRESSES ANSWER, AND SMALL, with a tail no longer than
//      TAIL_ROWS and a cut that IS its oldest row. SEEDED, the reader must
//      report the life whole, the coverage must start at the deployment, the
//      page's gate must open and the figures it governs must be filled;
//      UNSEEDED, the reader turns the cut into a coverage horizon and the same
//      figures must come back empty — where the same call on the same history
//      told it is whole fills them.
//
//   2. THE TAIL IS THE WHOLE HISTORY'S OWN SUFFIX, AND THE REPLAY OVER IT IS
//      THE REPLAY OVER THOSE ROWS. Every heavy address here is small enough
//      that `?full=1` still answers — that is the one thing this route has
//      that the Aave family did not — so the gated rows are compared row for
//      row against the tail of the full list and the cut is checked to be a
//      transaction boundary. SEEDED, the seed-plus-tail replay through the
//      reader's own `replayCometRows` must equal the whole-history replay on
//      every position field — the principal, the peaks, the collateral, the
//      counts, the stamps and every lifetime leg — with `===` on the raw
//      strings, and its drawn events must be the whole list's own newest ones,
//      running balances included. UNSEEDED, the horizon replay is compared
//      field for field against a replay over the same rows lifted out of the
//      full answer, and what it does NOT claim is checked to be bounded: each
//      lifetime PAIR (`deposited + repaid`, `withdrawn + borrowed`,
//      `absorbedDebt`) is a plain sum over the rows and so a part of the
//      whole's, where a per-axis figure is not even that — the tail's own
//      zero-crossing split classifies the same rows differently from a walk
//      that reaches them holding a debt (measured on 0x77814975…: 4,239 WETH
//      `deposited` in the tail against 37.6 over the whole life). `--perturb`
//      moves one tail row by a wei and must turn the run red on either path.
//
//   3. NOTHING CHANGED BELOW THE GATE. A regular wallet's gated response
//      carries no `heavy` key and equals its `?full=1` answer byte for byte
//      (`coverage` excepted — it advances with the live index between the two
//      reads).
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
// a 69 MB response is not one this route should be askable for, and with the
// flag set every one of the six is.
//
// Run:
//   node scripts/verify/verify-compound-v3-base-heavy-timeline.mjs
//   node scripts/verify/verify-compound-v3-base-heavy-timeline.mjs --perturb

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both, exactly as
// verify-aave-family-base-heavy-timeline.mjs does.
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

const { replayCometRows } = await import("../../lib/sources/chain/compound-v3-events.ts");
const { resolveErc20Meta } = await import("../../lib/sources/chain/erc20-meta.ts");
const { loadCometEventsFromIndex } = await import("../../lib/sources/api/compound-base-timeline.ts");
const { cometViewFromChain } = await import("../../lib/compound/chain-position-view.ts");
const { COMPOUND_BASE_DEPLOYMENT, COMPOUND_BASE_DEPLOY_BLOCK, COMPOUND_BASE_CHAIN_ID } = await import(
  "../../lib/compound-base/asset-catalog.ts"
);

const API_PREFIX = "/api/compound-base";
/** The route's own tail size (api/src/routes/baseComet.ts TAIL_ROWS). */
const TAIL_ROWS = 2_000;
/** The web's render budget for this lane (MAX_RENDERED_EVENTS in the reader). */
const MAX_RENDERED_EVENTS = 2_000;
/** The gate's threshold. */
const HEAVY_ROWS = 20_000;
/** The pool's statement timeout on the box — the wall the gate keeps the read
 *  inside. This route was never near it (4.2s for the heaviest); the gate here
 *  is for the 69 MB the answer weighed and the 161,864 rows the browser
 *  replayed, so the assertion is a floor rather than the point. */
const STATEMENT_TIMEOUT_MS = 30_000;

/** The base axis, as the reader signs it — a row on any other kind moves
 *  collateral. Mirrors BASE_KINDS in lib/sources/api/compound-base-timeline.ts. */
const BASE_KINDS = new Set(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);

/** The six addresses above the gate, from the heavy-wallet census (2026-09-05),
 *  counted over the route's own union across the five Comets. Unlike the Aave
 *  family, EVERY one of them is small enough that `?full=1` still answers — so
 *  the heaviest three are checked for their horizon claims and the other three
 *  are paired against a whole-history baseline, which keeps the run short
 *  while still pairing three genuinely heavy wallets. */
const HEAVIEST = [
  "0x5c38a0ab51ac64d93203247eefbc5b6b3ee7f4f6", // 161,864 rows — EOA, 69.3 MB / 4.2s before the gate
  "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0", //  99,228 rows — unnamed contract
  "0xd10a6d98868122fea0f629bf1468530ed8efb8d8", //  86,132 rows — unnamed contract
];
const PAIRED_CANDIDATES = [
  "0xf2f09544418b6d93120df844c60dd56f7349514e", // 21,239 rows
  "0x7781497537af372c11c38d231c688d182c8157b7", // 48,596 rows
  "0x912d9b792ec304f7da518d04fb9fdbd853c86f9b", // 75,998 rows
];
const PAIRED_WANTED = 3;
/** A wallet far below the gate — its answer must not have moved at all. */
const REGULAR = "0x543f802cdffb2d412b6f29da7562701901dcb85e";

const PERTURB = process.argv.includes("--perturb");

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

const timeline = (wallet, full = false) =>
  get(`${base}${API_PREFIX}/timeline?wallet=${wallet}${full ? "&full=1" : ""}`);

/** A response's rows → the replay's rows, the reader's own decoding applied
 *  (lib/sources/api/compound-base-timeline.ts). Written out here rather than
 *  imported so this file states the shape it is checking, the way the other
 *  heavy verifiers do. A transfer row carries BOTH sides and yields the
 *  wallet's leg(s) — a self-transfer yields two, exactly as the reader does. */
function decode(json, wallet) {
  const marketByKey = new Map(COMPOUND_BASE_DEPLOYMENT.markets.map((m) => [m.key, m]));
  const timestamps = new Map();
  const senders = new Map();
  const rows = [];
  for (const r of json.rows) {
    const market = marketByKey.get(r.market);
    if (!market) continue;
    const blockNumber = Number(r.block_number);
    const txHash = r.tx_hash.toLowerCase();
    timestamps.set(blockNumber, Number(r.block_timestamp));
    senders.set(txHash, r.tx_from.toLowerCase());
    const head = { market, blockNumber, txIndex: r.tx_index, logIndex: r.log_index, txHash };
    const baseToken = market.baseToken.toLowerCase();
    const amount = BigInt(r.amount);
    const usd = r.usd_value != null ? { usdValue: BigInt(r.usd_value) } : {};
    const counterparty = (r.counterparty ?? "").toLowerCase();
    const asset = (r.asset ?? "").toLowerCase();
    switch (r.kind) {
      case "supply":
        rows.push({ ...head, kind: "supply", asset: baseToken, delta: amount, counterparty });
        break;
      case "withdraw":
        rows.push({ ...head, kind: "withdraw", asset: baseToken, delta: -amount, counterparty });
        break;
      case "supply_collateral":
        rows.push({ ...head, kind: "supply_collateral", asset, delta: amount, counterparty });
        break;
      case "withdraw_collateral":
        rows.push({ ...head, kind: "withdraw_collateral", asset, delta: -amount, counterparty });
        break;
      case "absorb_debt":
        rows.push({ ...head, kind: "absorb_debt", asset: baseToken, delta: amount, counterparty, ...usd });
        break;
      case "absorb_collateral":
        rows.push({ ...head, kind: "absorb_collateral", asset, delta: -amount, counterparty, ...usd });
        break;
      case "transfer":
      case "transfer_collateral": {
        const from = (r.xfer_from ?? "").toLowerCase();
        const to = (r.xfer_to ?? "").toLowerCase();
        const collateral = r.kind === "transfer_collateral";
        const tok = collateral ? asset : baseToken;
        if (from === wallet)
          rows.push({
            ...head,
            kind: collateral ? "transfer_collateral_out" : "transfer_out",
            asset: tok,
            delta: -amount,
            counterparty: to,
          });
        if (to === wallet)
          rows.push({
            ...head,
            kind: collateral ? "transfer_collateral_in" : "transfer_in",
            asset: tok,
            delta: amount,
            counterparty: from,
          });
        break;
      }
    }
  }
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.txIndex - b.txIndex || a.logIndex - b.logIndex);
  return { rows, timestamps, senders };
}

/** A response's seeds → the replay's seeds, the reader's own parsing applied
 *  (lib/sources/api/compound-base-timeline.ts): decimal strings to bigints,
 *  addresses lowercased, a market the roster does not name dropped. */
function decodeSeeds(json) {
  const marketByKey = new Map(COMPOUND_BASE_DEPLOYMENT.markets.map((m) => [m.key, m]));
  const big = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, BigInt(v)]));
  return (json.heavy?.seeds ?? []).flatMap((s) => {
    const market = marketByKey.get(s.market);
    if (!market) return [];
    return [
      {
        market,
        base: BigInt(s.base),
        peakLend: BigInt(s.peakLend),
        peakBorrow: BigInt(s.peakBorrow),
        collateral: Object.fromEntries(
          Object.entries(s.collateral).map(([a, c]) => [
            a.toLowerCase(),
            { balance: BigInt(c.balance), peak: BigInt(c.peak) },
          ]),
        ),
        absorbs: s.absorbs,
        txCount: s.txCount,
        eventCount: s.eventCount,
        firstBlock: s.firstBlock,
        firstTimestamp: s.firstTimestamp,
        lastBlock: s.lastBlock,
        lastTimestamp: s.lastTimestamp,
        lifetime: {
          ...big({
            deposited: s.lifetime.deposited,
            withdrawn: s.lifetime.withdrawn,
            borrowed: s.lifetime.borrowed,
            repaid: s.lifetime.repaid,
            absorbedDebt: s.lifetime.absorbedDebt,
          }),
          collateral: Object.fromEntries(
            Object.entries(s.lifetime.collateral).map(([a, c]) => [a.toLowerCase(), big(c)]),
          ),
        },
      },
    ];
  });
}

async function replay(wallet, decoded, fromBlock, fromDeployment, seeds) {
  const collAddrs = new Set();
  for (const d of decoded.rows) if (!BASE_KINDS.has(d.kind)) collAddrs.add(d.asset);
  for (const s of seeds ?? []) {
    for (const a of Object.keys(s.collateral)) collAddrs.add(a);
    for (const a of Object.keys(s.lifetime.collateral)) collAddrs.add(a);
  }
  const metas = await resolveErc20Meta([...collAddrs], COMPOUND_BASE_CHAIN_ID);
  return replayCometRows({
    wallet,
    chainId: COMPOUND_BASE_CHAIN_ID,
    deployment: COMPOUND_BASE_DEPLOYMENT,
    rows: decoded.rows,
    metas,
    timestamps: decoded.timestamps,
    senders: decoded.senders,
    maxRendered: MAX_RENDERED_EVENTS,
    ...(seeds ? { seeds } : {}),
    coverage: {
      fromBlock,
      toBlock: fromBlock,
      fromDeployment,
      deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
      gaps: [],
      source: "index",
    },
  });
}

/** The page's own consumption of a history, reduced to the figures the gate
 *  governs. `cometViewFromChain` fills the signed base PRINCIPAL, the peaks,
 *  the transaction count and the last-activity stamp from the replay only when
 *  it is whole (lib/compound/chain-position-view). The Comet read is not what
 *  is under test, so it is passed as `null` — the view's figures then come from
 *  the history alone, which is exactly the half being gated. */
function pageFigures(wallet, timelineResult, sweptClean) {
  const byKey = new Map(timelineResult.markets.map((m) => [m.market, m]));
  const out = [];
  for (const market of COMPOUND_BASE_DEPLOYMENT.markets) {
    const replayed = byKey.get(market.key);
    if (!replayed) continue;
    const view = cometViewFromChain(market, wallet, null, replayed, undefined, sweptClean);
    out.push({
      market: market.key,
      baseRaw: view.base.amountRaw,
      peakLent: view.peak.lentBase,
      peakBorrowed: view.peak.borrowedBase,
      peakCollateral: view.peak.collateral.length,
      txCount: view.txCount,
      lastActivityAt: view.lastActivityAt,
    });
  }
  return out;
}

let perturbed = false;

console.log("══ Compound V3 Base ═══════════════════════════════════════════");

// ── 1 · the heaviest addresses answer, and say what they are ─────────────────
console.log("── the heaviest addresses ──────────────────────────────────────");
check("there are heavy addresses to check", HEAVIEST.length > 0);
for (const wallet of HEAVIEST) {
  const r = await timeline(wallet);
  const id = `${wallet.slice(0, 10)}…`;
  check(`${id} answers 200`, r.ok, r.ok ? "" : `http ${r.status} after ${r.ms}ms`);
  if (!r.ok) continue;
  const j = r.json;
  const seededResponse = Array.isArray(j.heavy?.seeds);
  console.log(
    `${id} ${r.ms}ms · ${j.rows.length} rows · heavy=${j.heavy != null}${seededResponse ? ` · ${j.heavy.seeds.length} seed(s)` : " · no seeds"}`,
  );
  check(`${id} answers inside the statement timeout`, r.ms < STATEMENT_TIMEOUT_MS, `${r.ms}ms`);
  check(`${id} took the heavy path`, j.heavy != null);
  if (!j.heavy) continue;
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

  // The reader's own read — the coverage the page will actually see.
  const read = await loadCometEventsFromIndex({
    wallet,
    deployment: COMPOUND_BASE_DEPLOYMENT,
    apiPrefix: API_PREFIX,
    deployBlock: COMPOUND_BASE_DEPLOY_BLOCK,
  });
  check(`${id} the reader reports it heavy`, read?.heavy === true);
  check(`${id} the coverage names the index`, read?.result.coverage.source === "index");
  // The page's own gate, applied here as the page applies it.
  const sweptClean = (read?.result.coverage.gaps.length ?? 1) === 0 && read?.result.coverage.fromDeployment === true;
  const gated = pageFigures(wallet, read.result, sweptClean);
  check(`${id} the reader placed the tail in at least one market`, gated.length > 0, `${gated.length} market(s)`);

  if (seededResponse) {
    // ── seeded: a whole life, and the page may say so ──
    const seeds = j.heavy.seeds;
    const roster = new Set(COMPOUND_BASE_DEPLOYMENT.markets.map((m) => m.key));
    check(`${id} at least one seed travels`, seeds.length > 0);
    check(
      `${id} every seed names a rostered market`,
      seeds.every((sd) => roster.has(sd.market)),
    );
    check(
      `${id} every seed's first stamp sits before the cut`,
      seeds.every((sd) => sd.firstBlock <= sd.lastBlock && sd.lastBlock <= j.heavy.cut.block),
    );
    const seededRows = seeds.reduce((n, sd) => n + sd.eventCount, 0);
    check(
      `${id} the seeds account for more rows than the gate`,
      seededRows + j.rows.length > HEAVY_ROWS,
      `${seededRows}`,
    );
    check(`${id} the reader claims the whole life`, read?.whole === true, read?.reason ?? "");
    check(`${id} the coverage is from the deployment`, read?.result.coverage.fromDeployment === true);
    check(
      `${id} the coverage starts at the earliest Comet's first block`,
      read?.result.coverage.fromBlock === COMPOUND_BASE_DEPLOY_BLOCK,
      `${read?.result.coverage.fromBlock}`,
    );
    check(
      `${id} the coverage counts the seeded rows as omitted from the drawing`,
      (read?.result.coverage.omitted?.count ?? 0) >= seededRows,
      `${read?.result.coverage.omitted?.count} of ${seededRows}`,
    );
    check(
      `${id} the coverage dates the wallet's first event from the seeds`,
      read?.result.coverage.firstEventAt === Math.min(...seeds.map((sd) => sd.firstTimestamp)),
    );
    check(`${id} the page's sweptClean gate is open`, sweptClean === true);
    check(
      `${id} the transaction count is filled, and counts the seeds`,
      gated.some((m) => m.txCount > 0) &&
        gated.reduce((n, m) => n + m.txCount, 0) >= seeds.reduce((n, sd) => n + sd.txCount, 0),
      gated.map((m) => `${m.market}=${m.txCount}`).join(" "),
    );
    check(
      `${id} the last-activity stamp is filled`,
      gated.every((m) => m.lastActivityAt !== null),
    );
    check(
      `${id} the peaks are filled in at least one market`,
      gated.some((m) => m.peakLent > 0 || m.peakBorrowed > 0 || m.peakCollateral > 0),
    );
    const byKey = new Map(read.result.markets.map((m) => [m.market, m]));
    check(
      `${id} every seeded market is a position, its lifetime legs at least the seed's`,
      seeds.every((sd) => {
        const m = byKey.get(sd.market);
        return (
          m != null &&
          ["deposited", "withdrawn", "borrowed", "repaid", "absorbedDebt"].every(
            (leg) => BigInt(m.lifetimeRaw[leg]) >= BigInt(sd.lifetime[leg]),
          ) &&
          m.liquidationCount >= sd.absorbs
        );
      }),
    );
  } else {
    // ── unseeded: a horizon, and the page must not read it as a life ──
    check(`${id} the reader does not claim the whole life`, read?.whole === false);
    check(`${id} the coverage is a horizon`, read?.result.coverage.fromDeployment === false);
    check(
      `${id} the horizon starts past the earliest Comet's first block`,
      (read?.result.coverage.fromBlock ?? 0) > COMPOUND_BASE_DEPLOY_BLOCK,
      `${read?.result.coverage.fromBlock}`,
    );
    // A heavy reply must not pass the gate, or the principal, the peaks and
    // the lifetime layer would be drawn over a two-thousand-row window.
    check(`${id} the page's sweptClean gate is closed`, sweptClean === false);
    check(
      `${id} the principal is withheld in every market`,
      gated.every((m) => m.baseRaw === "0"),
      gated.map((m) => `${m.market}=${m.baseRaw}`).join(" "),
    );
    check(
      `${id} the peaks are withheld in every market`,
      gated.every((m) => m.peakLent === 0 && m.peakBorrowed === 0 && m.peakCollateral === 0),
    );
    check(
      `${id} the transaction count is withheld`,
      gated.every((m) => m.txCount === 0),
    );
    check(
      `${id} the last-activity stamp is withheld`,
      gated.every((m) => m.lastActivityAt === null),
    );
    // Not vacuous: the same call over the same history, told it is whole,
    // fills them — so what closes the figures is the gate and not an empty
    // replay.
    const asWhole = pageFigures(wallet, read.result, true);
    check(
      `${id} the same history read as whole WOULD fill them`,
      asWhole.some((m) => m.txCount > 0) && asWhole.some((m) => m.lastActivityAt !== null),
      asWhole.map((m) => `${m.market}=${m.txCount}`).join(" "),
    );
  }
}

// ── 2 · the tail is the whole history's own suffix ───────────────────────────
console.log("\n── the tail against a whole-history read ───────────────────────");
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

for (const p of paired) {
  const { wallet } = p;
  const id = `${wallet.slice(0, 10)}…`;
  console.log(`${id} heavy ${p.heavy.rows.length} rows/${p.msHeavy}ms · full ${p.full.rows.length} rows/${p.msFull}ms`);
  check(`${id} the full read is above the gate`, p.full.rows.length > HEAVY_ROWS, `${p.full.rows.length}`);

  if (PERTURB && !perturbed && p.heavy.rows.length > 0) {
    perturbed = true;
    const victim = p.heavy.rows[0];
    victim.amount = String(BigInt(victim.amount) + BigInt(1));
    console.log(`\n--perturb: ${id} the tail's oldest row's amount +1 wei. The run MUST go red.\n`);
  }

  // One history on both sides: cut the full list at the heavy read's own
  // newest row, so rows Sieve wrote between the two reads are on neither.
  const key = (r) => [Number(r.block_number), r.tx_index, r.log_index];
  const newest = key(p.heavy.rows[p.heavy.rows.length - 1]);
  const le = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] <= b[2]);
  const fullRows = p.full.rows.filter((r) => le(key(r), newest));

  // The tail is a SUFFIX of the whole list, row for row — a mis-cut cannot
  // pass as a matching replay.
  const suffix = fullRows.slice(-p.heavy.rows.length);
  const rowKey = (r) =>
    `${r.block_number}:${r.tx_index}:${r.log_index}:${r.kind}:${r.market}:${r.asset}:${r.amount}:${r.xfer_from}:${r.xfer_to}`;
  check(
    `${id} the tail is the whole list's own suffix`,
    suffix.length === p.heavy.rows.length && suffix.every((r, i) => rowKey(r) === rowKey(p.heavy.rows[i])),
  );
  // No transaction lands on both sides of the cut: the whole list holds no
  // row of the cut's own transaction older than the cut.
  const cut = p.heavy.heavy.cut;
  check(
    `${id} the cut is a transaction boundary`,
    !fullRows.some(
      (r) => Number(r.block_number) === cut.block && r.tx_index === cut.txIndex && r.log_index < cut.logIndex,
    ),
  );

  const whole = await replay(wallet, decode({ ...p.full, rows: fullRows }, wallet), COMPOUND_BASE_DEPLOY_BLOCK, true);
  const wholeByMarket = new Map(whole.markets.map((m) => [m.market, m]));

  if (Array.isArray(p.heavy.heavy.seeds)) {
    // ── seeded: seed + tail == whole, to the wei ──
    const seeds = decodeSeeds(p.heavy);
    const seeded = await replay(wallet, decode(p.heavy, wallet), COMPOUND_BASE_DEPLOY_BLOCK, true, seeds);
    check(
      `${id} the seeded replay holds every market the whole replay holds`,
      seeded.markets.length === whole.markets.length && seeded.markets.every((m) => wholeByMarket.has(m.market)),
      `${seeded.markets.map((m) => m.market).join(",")} vs ${whole.markets.map((m) => m.market).join(",")}`,
    );
    const byAddr = (list) => JSON.stringify([...list].sort((a, b) => (a.address < b.address ? -1 : 1)));
    // A record keyed by asset address: the whole walk inserts an asset when
    // its balance first rises above zero, the seed lists assets in first-touch
    // order, so the keys' ORDER can differ while every value is equal. Compare
    // with the keys sorted.
    const byKey = (rec) =>
      JSON.stringify(Object.fromEntries(Object.entries(rec ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))));
    const sortedLifetime = (lt) => JSON.stringify({ ...lt, collateral: JSON.parse(byKey(lt.collateral)) });
    const LEGS = ["deposited", "withdrawn", "borrowed", "repaid", "absorbedDebt"];
    for (const m of seeded.markets) {
      const w = wholeByMarket.get(m.market);
      if (!w) continue;
      const mk = `${id} ${m.market}`;
      check(
        `${mk} principal, raw ===`,
        m.base.amountRaw === w.base.amountRaw,
        `${m.base.amountRaw} vs ${w.base.amountRaw}`,
      );
      check(
        `${mk} peak lent / borrowed, raw ===`,
        m.peak.lentBaseRaw === w.peak.lentBaseRaw && m.peak.borrowedBaseRaw === w.peak.borrowedBaseRaw,
        `${m.peak.lentBaseRaw}/${m.peak.borrowedBaseRaw} vs ${w.peak.lentBaseRaw}/${w.peak.borrowedBaseRaw}`,
      );
      check(`${mk} collateral per asset, raw ===`, byAddr(m.collateral) === byAddr(w.collateral));
      check(`${mk} collateral peaks per asset, raw ===`, byAddr(m.peak.collateral) === byAddr(w.peak.collateral));
      check(`${mk} txCount`, m.txCount === w.txCount, `${m.txCount} vs ${w.txCount}`);
      check(
        `${mk} liquidationCount`,
        m.liquidationCount === w.liquidationCount && m.everLiquidated === w.everLiquidated,
        `${m.liquidationCount} vs ${w.liquidationCount}`,
      );
      check(
        `${mk} firstEventAt / lastActivityAt`,
        m.firstEventAt === w.firstEventAt && m.lastActivityAt === w.lastActivityAt,
        `${m.firstEventAt}/${m.lastActivityAt} vs ${w.firstEventAt}/${w.lastActivityAt}`,
      );
      for (const leg of LEGS)
        check(
          `${mk} lifetime ${leg}, raw ===`,
          m.lifetimeRaw[leg] === w.lifetimeRaw[leg],
          `${m.lifetimeRaw[leg]} vs ${w.lifetimeRaw[leg]}`,
        );
      check(
        `${mk} every collateral lifetime leg, raw ===`,
        byKey(m.lifetimeRaw.collateral) === byKey(w.lifetimeRaw.collateral),
        `${byKey(m.lifetimeRaw.collateral)} vs ${byKey(w.lifetimeRaw.collateral)}`,
      );
      check(
        `${mk} the scaled lifetime, bit for bit`,
        sortedLifetime(m.lifetime) === sortedLifetime(w.lifetime),
        `${sortedLifetime(m.lifetime)} vs ${sortedLifetime(w.lifetime)}`,
      );
    }
    // The drawn rows: the whole list's own newest ones, running balances included.
    const newest = whole.events.slice(-seeded.events.length);
    check(
      `${id} the seeded replay draws the whole list's own newest ${seeded.events.length} events`,
      seeded.events.length > 0 && JSON.stringify(seeded.events) === JSON.stringify(newest),
    );
    check(
      `${id} the seeded coverage is from the deployment`,
      seeded.coverage.fromDeployment === true && seeded.coverage.firstEventAt === whole.coverage.firstEventAt,
    );
    continue;
  }

  // ── unseeded: what the horizon path CLAIMS is a replay over the tail ──
  // Compared against a replay over the same rows lifted out of the whole
  // answer — two independent reads of the same history, replayed to the same
  // figures.
  const horizon = await replay(wallet, decode(p.heavy, wallet), cut.block, false);
  const fromFull = await replay(wallet, decode({ ...p.full, rows: suffix }, wallet), cut.block, false);
  check(
    `${id} the horizon replay is the replay over those same rows`,
    JSON.stringify(horizon) === JSON.stringify(fromFull),
  );

  // And what it does NOT claim: the whole life.
  //
  // The comparison has to be made on the right quantities, and finding out
  // which is the horizon decision's own evidence. A per-axis figure is NOT
  // bounded by the whole life's: `deposited` / `withdrawn` / `borrowed` /
  // `repaid` are a SPLIT AT THE ZERO CROSSINGS against the running balance, so
  // a tail that starts from zero classifies the same rows differently from a
  // walk that reaches them holding a debt. Measured here on 0x77814975…: the
  // tail books 4,239 WETH `deposited` where the whole life books 37.6, because
  // over the whole life those same supplies land on a negative balance and are
  // `repaid`. That reclassification — not a shortfall — is exactly why the
  // flows cannot be seeded by adding sums, and why the page withholds them.
  //
  // What IS a plain sum over the rows, and therefore bounded: each PAIR. A base
  // row with a positive delta contributes its whole magnitude to
  // `deposited + repaid` however the split falls, a negative one to
  // `withdrawn + borrowed`, and an absorb to `absorbedDebt`. Those three are
  // sums over a subset of the rows and can only be a part of the whole's.
  const PAIRS = [
    ["base in (deposited + repaid)", (l) => l.deposited + l.repaid],
    ["base out (withdrawn + borrowed)", (l) => l.withdrawn + l.borrowed],
    ["absorbed debt", (l) => l.absorbedDebt],
  ];
  let strictlyShort = 0;
  let reclassified = 0;
  for (const m of horizon.markets) {
    const w = wholeByMarket.get(m.market);
    if (!w) {
      check(`${id} ${m.market} is a market the whole replay knows`, false);
      continue;
    }
    for (const [label, f] of PAIRS) {
      const tail = f(m.lifetime);
      const life = f(w.lifetime);
      check(`${id} ${m.market} ${label} is a part of the whole`, tail <= life * (1 + 1e-9), `${tail} vs ${life}`);
      if (tail < life) strictlyShort++;
    }
    // And the split really does move between the axes rather than only
    // shrinking — the assertion above would pass vacuously if it did not.
    for (const axis of ["deposited", "withdrawn", "borrowed", "repaid"]) {
      if (m.lifetime[axis] > w.lifetime[axis] * (1 + 1e-9)) reclassified++;
    }
    check(
      `${id} ${m.market} the whole replay counts at least as many transactions`,
      w.txCount >= m.txCount,
      `${w.txCount} vs ${m.txCount}`,
    );
  }
  console.log(`${id} per-axis figures the tail's own split puts ABOVE the whole life's: ${reclassified}`);
  // A per-market count can tie (a market the wallet only touched inside the
  // tail), so the assertion that always separates the two is the total.
  const sumTx = (r) => r.markets.reduce((n, m) => n + m.txCount, 0);
  console.log(`${id} paired lifetime figures strictly short of the whole life: ${strictlyShort}`);
  check(
    `${id} the whole replay counts more transactions overall`,
    sumTx(whole) > sumTx(horizon),
    `${sumTx(whole)} vs ${sumTx(horizon)}`,
  );
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
    check(`${id} the wallet is below the gate`, gated.json.rows.length < HEAVY_ROWS, `${gated.json.rows.length} rows`);
    check(`${id} the wallet has a history to compare`, gated.json.rows.length > 0);
    // `coverage` advances with the live index between the two reads; it is the
    // one field that legitimately differs.
    const strip = (j) => {
      const { coverage: _coverage, ...rest } = j;
      return JSON.stringify(rest);
    };
    check(`${id} the gated answer is the full answer, byte for byte`, strip(gated.json) === strip(full.json));
  }
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checked - failures} of ${checked} assertions held`);
process.exit(failures === 0 ? 0 : 1);
