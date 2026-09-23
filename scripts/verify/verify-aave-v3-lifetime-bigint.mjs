// Aave V3's lifetime flows are exact, and a whole life is a seed plus a tail.
// ----------------------------------------------------------------------------
// `replayAaveV3Rows` used to accumulate the lifetime flows — `supplied` /
// `withdrawn` / `borrowed` / `repaid` / `liquidatedCollateral` /
// `liquidatedDebt`, per symbol — as scaled float64 in row order. A numeric
// aggregate over the same rows agreed with that walk to about a part in 10⁷
// and not bit for bit, which is what kept a heavy wallet's flows from
// travelling as state (rails-ops/architecture/heavy-wallet-timeline-gate.md).
// The flows now accumulate as bigints in raw units per reserve ADDRESS and
// scale ONCE at the edge, merged by symbol. This checks the claims that rest
// on, offline, on a synthetic history that exercises every lane the Aave
// family has:
//
//   1. THE RAW TOTALS ARE THE PLAIN SUMS. Per reserve, each lane of
//      `lifetimeRaw` equals Σ of its kind's raw amounts, as bigints; a
//      liquidation lands its collateral on the collateral asset and its debt
//      on the debt asset; aToken transfers contribute to no lane.
//
//   2. NOTHING VISIBLE MOVED. Each scaled leg of `lifetime` equals what the
//      old float walk produced, to 1e-9 on the hand-built history and to a
//      relative 1e-9 on twenty thousand pseudo-random rows (where the float
//      walk has drifted and the exact figure is the correct one). Two
//      reserves sharing a symbol and decimals are summed raw and scaled once;
//      two sharing a symbol at DIFFERENT decimals are scaled each and added,
//      and that branch is exercised on its own.
//
//   3. SEED + TAIL == WHOLE. The replay opened from a seed over the head and
//      walked over the tail equals the replay over the whole list: every
//      reserve's balance on both axes (read off the drawn events' running
//      balances), every peak, every lifetime lane with `===` on the raw
//      strings, the transaction count, the first and last stamps, the drawn
//      events themselves, and `coverage.omitted`. The seed is computed by an
//      INDEPENDENT closed form over the head — the prefix sum minus its
//      running minimum for the clamped balance (`b = S − least(0, min S)`),
//      a window max over that walk for the peak, plain sums for the lanes,
//      `count(distinct)` for the transactions — the arithmetic the server's
//      `aaveFullSeedSql` runs, never the replay under test. The history
//      includes aToken transfers whose amount is `value × index ÷ 1e27`
//      truncated the way BigInt `/` (and Postgres `div()`) truncates,
//      liquidations touching a collateral reserve and a debt reserve (and one
//      where the two are the same reserve), and withdrawals past the balance
//      that the clamp floors.
//
// `--perturb` adds one raw unit to one seeded balance and one seeded lane and
// must turn check 3 red.
//
// Run:
//   node scripts/verify/verify-aave-v3-lifetime-bigint.mjs
//   node scripts/verify/verify-aave-v3-lifetime-bigint.mjs --perturb

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both, exactly as
// verify-compound-lifetime-bigint.mjs does.
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

const PERTURB = process.argv.includes("--perturb");

const { replayAaveV3Rows } = await import("../../lib/sources/chain/aave-v3-events.ts");

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  } else console.log("  ok:", msg);
}

// ── The synthetic Pool ──────────────────────────────────────────────────────
// Four reserves. USDC and USDC2 share a symbol AND decimals (a bridged twin),
// so their lanes merge raw; WETH and cbETH are 18-decimal singletons.
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC2 = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
const WETH = "0x4200000000000000000000000000000000000006";
const CBETH = "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22";
const RESERVES = [USDC, USDC2, WETH, CBETH];
const metas = new Map([
  [USDC, { address: USDC, symbol: "USDC", decimals: 6, lt: null }],
  [USDC2, { address: USDC2, symbol: "USDC", decimals: 6, lt: null }],
  [WETH, { address: WETH, symbol: "WETH", decimals: 18, lt: null }],
  [CBETH, { address: CBETH, symbol: "cbETH", decimals: 18, lt: null }],
]);
const WALLET = "0x000000000000000000000000000000000000beef";
const OTHER = "0x000000000000000000000000000000000000cafe";
const LIQUIDATOR = "0x000000000000000000000000000000000000f00d";
const RAY = 10n ** 27n;
const ZERO = 0n;

const units = (human, decimals) => {
  const [w, f = ""] = String(human).split(".");
  return BigInt(w + f.padEnd(decimals, "0").slice(0, decimals));
};
const decOf = (reserve) => metas.get(reserve).decimals;

/** One row, in the replay's own decoded shape. Blocks advance per
 *  transaction unless `sameTx`; several transactions can share a block
 *  (`sameBlock`), which is what makes the cut a BLOCK boundary worth
 *  asserting rather than a transaction one. */
let block = 1_000;
let tx = 0;
let log = 0;
let txInBlock = 0;
function head(sameTx, sameBlock) {
  if (!sameTx) {
    if (!sameBlock) {
      block += 5;
      txInBlock = 0;
    } else txInBlock++;
    tx += 1;
    log = 0;
  }
  log += 1;
  return { blockNumber: block, txIndex: txInBlock, logIndex: log, txHash: `0x${tx.toString(16).padStart(64, "0")}` };
}
function pool(kind, reserve, human, opts = {}) {
  const raw = typeof human === "bigint" ? human : units(human, decOf(reserve));
  return {
    ...head(opts.sameTx, opts.sameBlock),
    kind,
    reserve,
    amount: raw,
    ...(kind === "supply" || kind === "borrow" ? { poolCaller: WALLET } : {}),
    ...(kind === "borrow" ? { interestRateMode: 2, borrowRate: "50000000000000000000000000" } : {}),
    ...(kind === "repay" ? { useATokens: false } : {}),
  };
}
/** An aToken BalanceTransfer: the emitted `value` is the scaled balance and
 *  the amount the replay takes is `value × index ÷ 1e27`, truncated — the
 *  reader's arithmetic (lib/sources/api/aave-v3-base-timeline.ts) and the
 *  server's `div()`. Values are chosen so the division has a remainder. */
let transfersWithRemainder = 0;
function transfer(kind, reserve, value, index, opts = {}) {
  const v = typeof value === "bigint" ? value : units(value, decOf(reserve));
  const product = v * index;
  if (product % RAY !== ZERO) transfersWithRemainder++;
  return { ...head(opts.sameTx, opts.sameBlock), kind, reserve, amount: product / RAY, counterparty: OTHER };
}
function liquidation(debtAsset, debtToCover, collateralAsset, liquidatedCollateral, opts = {}) {
  return {
    ...head(opts.sameTx, opts.sameBlock),
    kind: "liquidation",
    reserve: debtAsset,
    amount: typeof debtToCover === "bigint" ? debtToCover : units(debtToCover, decOf(debtAsset)),
    collateralAsset,
    liquidatedCollateralAmount:
      typeof liquidatedCollateral === "bigint"
        ? liquidatedCollateral
        : units(liquidatedCollateral, decOf(collateralAsset)),
    liquidator: LIQUIDATOR,
  };
}

// The hand-built history: every lane, every clamp, every liquidation shape.
const IDX_A = 1_031_234_567_890_123_456_789_012_345n; // ≈ 1.031 RAY
const IDX_B = 1_002_000_000_000_000_000_000_000_001n; // one unit above a round index
const hand = [
  pool("supply", WETH, "10"),
  pool("supply", USDC, "5000"),
  pool("supply", USDC2, "250.5"), //                     the twin, merged by symbol
  pool("borrow", USDC, "3000"),
  pool("borrow", USDC2, "100", { sameTx: true }), //     two rows, one transaction
  pool("repay", USDC, "1000.123456"),
  transfer("transfer_out", WETH, "2", IDX_A), //         custody move, no lane
  transfer("transfer_in", WETH, "1.5", IDX_B, { sameBlock: true }),
  pool("withdraw", WETH, "20"), //                       past the balance: clamped to 0
  pool("withdraw", USDC, "0.000001"),
  pool("supply", CBETH, "3.25"),
  liquidation(USDC, "1500", CBETH, "1.1"), //            collateral cbETH, debt USDC
  liquidation(USDC, "200", USDC, "210"), //              one reserve on both axes
  pool("borrow", WETH, "4"),
  pool("supply", WETH, "0.5"),
  pool("repay", WETH, "4.000000000000000001"), //        repays past the debt: clamped
  pool("withdraw", CBETH, "5"), //                       past the balance again
  pool("borrow", USDC2, "42"),
  pool("supply", USDC, "0.000001", { sameBlock: true }),
  pool("withdraw", USDC2, "250.5"),
  transfer("transfer_out", USDC, "1", IDX_A),
  pool("repay", USDC2, "142"),
  pool("supply", WETH, "7.777777777777777777"),
];

// A long pseudo-random history, seeded so the run is reproducible. Awkward
// amounts (odd raw units) so the float walk has something to round.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const rnd = lcg(20260906);
const KINDS = ["supply", "withdraw", "borrow", "repay", "supply", "withdraw", "transfer_in", "transfer_out"];
const random = [];
for (let i = 0; i < 20_000; i++) {
  const reserve = RESERVES[Math.floor(rnd() * RESERVES.length)];
  const kind = KINDS[Math.floor(rnd() * KINDS.length)];
  const sameBlock = rnd() < 0.15;
  const sameTx = rnd() < 0.1;
  if (i % 991 === 990) {
    const coll = RESERVES[Math.floor(rnd() * RESERVES.length)];
    random.push(
      liquidation(reserve, BigInt(Math.floor(rnd() * 1e11) + 1), coll, BigInt(Math.floor(rnd() * 1e17) + 1), {
        sameBlock,
      }),
    );
    continue;
  }
  const raw = BigInt(Math.floor(rnd() * 1e12) + 1);
  if (kind.startsWith("transfer")) {
    const index = RAY + BigInt(Math.floor(rnd() * 1e26)) + 7n;
    random.push(transfer(kind, reserve, raw, index, { sameBlock, sameTx }));
  } else random.push(pool(kind, reserve, raw, { sameBlock, sameTx }));
}

const LANES = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedCollateral", "liquidatedDebt"];
const KIND_LANE = { supply: "supplied", withdraw: "withdrawn", borrow: "borrowed", repay: "repaid" };

// ── The old walk, kept here as the oracle for "nothing visible moved" ──────
function scaleV3Old(raw, decimals) {
  if (raw === ZERO) return 0;
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}
function oldWalk(rows) {
  const lifetime = new Map();
  const flowsFor = (m) => {
    let cur = lifetime.get(m.symbol);
    if (!cur) {
      cur = {
        symbol: m.symbol,
        supplied: 0,
        withdrawn: 0,
        borrowed: 0,
        repaid: 0,
        liquidatedCollateral: 0,
        liquidatedDebt: 0,
      };
      lifetime.set(m.symbol, cur);
    }
    return cur;
  };
  for (const d of rows) {
    const rMeta = metas.get(d.reserve);
    if (d.kind === "liquidation") {
      const collMeta = metas.get(d.collateralAsset);
      flowsFor(collMeta).liquidatedCollateral += scaleV3Old(d.liquidatedCollateralAmount, collMeta.decimals);
      flowsFor(rMeta).liquidatedDebt += scaleV3Old(d.amount, rMeta.decimals);
      continue;
    }
    if (d.kind === "transfer_in" || d.kind === "transfer_out") continue;
    flowsFor(rMeta)[KIND_LANE[d.kind]] += scaleV3Old(d.amount, rMeta.decimals);
  }
  return lifetime;
}

const tsOfBlock = (b) => 1_700_000_000 + b * 2;
function replay(rows, maxRendered, extra = {}) {
  const timestamps = new Map(rows.map((r) => [r.blockNumber, tsOfBlock(r.blockNumber)]));
  return replayAaveV3Rows({
    wallet: WALLET,
    chainId: 8453,
    rows,
    metas,
    timestamps,
    senders: new Map(rows.map((r) => [r.txHash, WALLET])),
    maxRendered,
    coverage: { fromBlock: 0, toBlock: block, fromDeployment: true, deployBlock: 0, gaps: [], source: "index" },
    ...extra,
  });
}

const big = (s) => BigInt(s);
const bySymbol = (list) => new Map(list.map((f) => [f.symbol, f]));

function checkHistory(name, rows, tolerance) {
  console.log(`\n${name} — ${rows.length} rows`);
  const whole = replay(rows, rows.length);

  // 1. The raw totals are the plain sums, per reserve.
  const sums = new Map();
  const sumsOf = (r) => {
    let s = sums.get(r);
    if (!s) {
      s = Object.fromEntries(LANES.map((l) => [l, ZERO]));
      sums.set(r, s);
    }
    return s;
  };
  for (const d of rows) {
    if (d.kind === "liquidation") {
      sumsOf(d.collateralAsset).liquidatedCollateral += d.liquidatedCollateralAmount;
      sumsOf(d.reserve).liquidatedDebt += d.amount;
    } else {
      const s = sumsOf(d.reserve);
      if (KIND_LANE[d.kind]) s[KIND_LANE[d.kind]] += d.amount;
    }
  }
  const rawByReserve = new Map(whole.lifetimeRaw.map((r) => [r.reserve, r]));
  assert(
    rawByReserve.size === sums.size && [...sums.keys()].every((r) => rawByReserve.has(r)),
    `lifetimeRaw names exactly the ${sums.size} reserves the rows touched`,
  );
  assert(
    [...sums].every(([r, s]) => LANES.every((l) => big(rawByReserve.get(r)[l]) === s[l])),
    "every lane of every reserve is its kind's raw sum, as bigints",
  );
  assert(
    whole.lifetimeRaw.every((r) => r.symbol === metas.get(r.reserve).symbol && r.decimals === decOf(r.reserve)),
    "every lifetimeRaw entry carries its reserve's symbol and decimals",
  );

  // 2. Nothing visible moved: the scaled legs equal the old float walk, and
  // the twin reserves merge raw under one symbol.
  const old = oldWalk(rows);
  const now = bySymbol(whole.lifetime);
  let maxRel = 0;
  const near = (a, b) => {
    const diff = Math.abs(a - b);
    const rel = diff / Math.max(1, Math.abs(b));
    if (rel > maxRel) maxRel = rel;
    return tolerance.absolute ? diff <= tolerance.absolute : rel <= tolerance.relative;
  };
  assert(
    old.size === now.size && [...old.keys()].every((s) => now.has(s)),
    `lifetime holds the same ${old.size} symbols the old walk held`,
  );
  assert(
    [...old].every(([sym, o]) => LANES.every((l) => near(now.get(sym)[l], o[l]))),
    `every scaled lane matches the old float walk (${tolerance.absolute ? "abs" : "rel"} ${tolerance.absolute ?? tolerance.relative})`,
  );
  console.log(`      max relative drift between the exact figure and the float walk: ${maxRel.toExponential(3)}`);
  const usdc = now.get("USDC");
  const twinRaw = LANES.map((l) => big(rawByReserve.get(USDC)[l]) + big(rawByReserve.get(USDC2)[l]));
  assert(
    LANES.every((l, i) => usdc[l] === scaleV3Old(twinRaw[i], 6)),
    "USDC's lanes are the twin reserves' raw sums scaled once",
  );
  return whole;
}

/** The seed a server computes for the rows before a cut — the closed forms
 *  `aaveFullSeedSql` runs, written out here rather than by running the replay
 *  over the head, so that check 3 tests the seed's meaning and not the replay
 *  against itself. Per reserve and axis: the prefix sum S of the signed
 *  deltas, its running minimum M floored at 0, balance = S − M after the last
 *  row, peak = max(S − M) over the rows. */
function seedOf(rows) {
  const st = new Map();
  const stateOf = (r) => {
    let s = st.get(r);
    if (!s) {
      s = {
        sup: { S: ZERO, M: ZERO, peak: ZERO },
        debt: { S: ZERO, M: ZERO, peak: ZERO },
        lifetime: Object.fromEntries(LANES.map((l) => [l, ZERO])),
      };
      st.set(r, s);
    }
    return s;
  };
  const step = (axis, delta) => {
    axis.S += delta;
    if (axis.S < axis.M) axis.M = axis.S;
    const b = axis.S - axis.M;
    if (b > axis.peak) axis.peak = b;
  };
  const txs = new Set();
  for (const d of rows) {
    if (d.kind === "liquidation") {
      const c = stateOf(d.collateralAsset);
      step(c.sup, -d.liquidatedCollateralAmount);
      c.lifetime.liquidatedCollateral += d.liquidatedCollateralAmount;
      const s = stateOf(d.reserve);
      step(s.debt, -d.amount);
      s.lifetime.liquidatedDebt += d.amount;
      continue;
    }
    txs.add(d.txHash);
    const s = stateOf(d.reserve);
    const supplySide = d.kind === "supply" || d.kind === "withdraw" || d.kind.startsWith("transfer");
    const positive = d.kind === "supply" || d.kind === "borrow" || d.kind === "transfer_in";
    step(supplySide ? s.sup : s.debt, positive ? d.amount : -d.amount);
    if (KIND_LANE[d.kind]) s.lifetime[KIND_LANE[d.kind]] += d.amount;
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    wallet: {
      events: rows.length,
      txCount: txs.size,
      firstBlock: first.blockNumber,
      firstTimestamp: tsOfBlock(first.blockNumber),
      lastBlock: last.blockNumber,
      lastTimestamp: tsOfBlock(last.blockNumber),
    },
    // The server orders its rows by reserve address; the replay must not care.
    reserves: [...st]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([reserve, s]) => ({
        reserve,
        supply: s.sup.S - s.sup.M,
        debt: s.debt.S - s.debt.M,
        peakSupply: s.sup.peak,
        peakDebt: s.debt.peak,
        lifetime: { ...s.lifetime },
      })),
  };
}

/** A running balance the drawn events state — the last `supplyAfter` /
 *  `debtAfter` each reserve's events reached, raw. Read off the events so the
 *  comparison rests on what a page would show. */
function balancesFrom(events) {
  const out = new Map();
  for (const e of events) {
    const ctx = e.context.data;
    const raw = ctx.raw;
    if (ctx.eventType === "liquidation") {
      out.set(`${ctx.collateralAsset}:supply`, raw.supplyAfter);
      out.set(`${e.flows?.[0]?.token ?? ctx.reserveSymbol}:debt`, raw.debtAfter);
      continue;
    }
    const token = e.flows[0].token;
    if (raw.supplyAfter != null) out.set(`${token}:supply`, raw.supplyAfter);
    if (raw.debtAfter != null) out.set(`${token}:debt`, raw.debtAfter);
  }
  return out;
}

/** Peaks compared with a zero standing in for an axis never noted: the
 *  whole walk notes a zero for an axis a clamped row touched, the seed
 *  cannot tell that axis from one it never touched, and no reader draws a
 *  zero peak either way (chain-position-view's `peaksFrom` skips them). The
 *  entry's `address` is compared only where the symbol names ONE reserve:
 *  for the twins it is whichever reserve touched the symbol first, which a
 *  seed ordered by address cannot know — the figures under it are the same. */
const reservesOfSymbol = new Map();
for (const m of metas.values()) reservesOfSymbol.set(m.symbol, (reservesOfSymbol.get(m.symbol) ?? 0) + 1);
const peaksOf = (list) =>
  JSON.stringify(
    [...list]
      .sort((a, b) => (a.symbol < b.symbol ? -1 : 1))
      .map((f) => [
        f.symbol,
        reservesOfSymbol.get(f.symbol) === 1 ? f.address : "(shared)",
        f.decimals,
        f.peakSuppliedRaw ?? "0",
        f.peakSupplied ?? 0,
        f.peakBorrowedRaw ?? "0",
        f.peakBorrowed ?? 0,
      ]),
  );
const lanesOf = (list) =>
  JSON.stringify(
    [...list].sort((a, b) => (a.symbol < b.symbol ? -1 : 1)).map((f) => [f.symbol, ...LANES.map((l) => f[l])]),
  );
const rawOf = (list) => JSON.stringify([...list].sort((a, b) => (a.reserve < b.reserve ? -1 : 1)));

/** Check 3, on one history: the replay opened from a seed and walked over
 *  the tail equals the replay over the whole list. */
function checkSeededReplay(name, rows, whole) {
  console.log(`\n${name} — seed + tail through replayAaveV3Rows`);
  // Cut at a BLOCK boundary about two thirds in.
  let cut = Math.floor((rows.length * 2) / 3);
  while (cut > 0 && rows[cut].blockNumber === rows[cut - 1].blockNumber) cut++;
  const headRows = rows.slice(0, cut);
  const tail = rows.slice(cut);
  assert(
    tail[0].blockNumber > headRows[headRows.length - 1].blockNumber,
    `the cut at row ${cut} is a block boundary (${headRows[headRows.length - 1].blockNumber} → ${tail[0].blockNumber})`,
  );
  const seedExact = seedOf(headRows);
  const seed = PERTURB
    ? {
        ...seedExact,
        // One unit on a balance (the tail's clamp may swallow it, the drawn
        // events before that cannot) and one on a lane (nothing swallows it).
        reserves: seedExact.reserves.map((r, i) =>
          i === 0
            ? { ...r, supply: r.supply + 1n, lifetime: { ...r.lifetime, supplied: r.lifetime.supplied + 1n } }
            : r,
        ),
      }
    : seedExact;
  const wholeDrawn = replay(rows, tail.length);
  const seeded = replay(tail, tail.length, { seed });

  assert(
    rawOf(seeded.lifetimeRaw) === rawOf(whole.lifetimeRaw),
    "every lifetime lane of every reserve, raw === (per reserve address)",
  );
  assert(lanesOf(seeded.lifetime) === lanesOf(whole.lifetime), "every scaled lifetime lane, bit for bit (per symbol)");
  assert(peaksOf(seeded.lifetime) === peaksOf(whole.lifetime), "every peak on both axes, raw and scaled (per symbol)");
  assert(seeded.txCount === whole.txCount, `txCount (${seeded.txCount} vs ${whole.txCount})`);
  assert(
    seeded.coverage.firstEventAt === whole.coverage.firstEventAt,
    `coverage.firstEventAt is the seed's, the whole list's own first (${seeded.coverage.firstEventAt})`,
  );
  assert(seeded.lastActivityAt === whole.lastActivityAt, "lastActivityAt from the tail's newest row");
  // The drawn rows: the same events with the same running balances.
  assert(
    JSON.stringify(seeded.events) === JSON.stringify(wholeDrawn.events),
    `the drawn events are the whole list's own newest ${tail.length}, running balances included`,
  );
  const bal = balancesFrom(seeded.events);
  const balWhole = balancesFrom(wholeDrawn.events);
  assert(
    bal.size === balWhole.size && [...balWhole].every(([k, v]) => bal.get(k) === v),
    `every reserve's supply and debt balance the drawn events state, raw === (${bal.size} axes)`,
  );
  assert(
    seeded.coverage.omitted?.count === cut && seeded.coverage.omitted?.upToBlock === rows[cut - 1].blockNumber,
    `coverage.omitted counts the ${cut} seeded rows up to block ${rows[cut - 1].blockNumber}`,
  );
  assert(seeded.totalEvents === wholeDrawn.totalEvents, "totalEvents is the drawn count on both");

  // A dormant wallet: the seed alone, an empty tail. The balances, peaks,
  // flows and counts are the seed's, and the stamps are the seed's own.
  const dormant = replay([], 0, { seed: seedExact });
  const headOnly = replay(headRows, 0);
  assert(
    rawOf(dormant.lifetimeRaw) === rawOf(headOnly.lifetimeRaw) &&
      lanesOf(dormant.lifetime) === lanesOf(headOnly.lifetime) &&
      peaksOf(dormant.lifetime) === peaksOf(headOnly.lifetime) &&
      dormant.txCount === headOnly.txCount,
    "an empty tail over the seed equals the replay over the head alone",
  );
  assert(
    dormant.coverage.firstEventAt === seedExact.wallet.firstTimestamp &&
      dormant.lastActivityAt === seedExact.wallet.lastTimestamp &&
      dormant.coverage.omitted?.count === cut &&
      dormant.coverage.omitted?.upToBlock === seedExact.wallet.lastBlock,
    "an empty tail takes its first and last stamps and its omitted span from the seed",
  );
}

// ── Mixed decimals under one symbol: scaled each, then added ────────────────
function checkMixedDecimals() {
  console.log("\ntwo reserves sharing a symbol at different decimals");
  const A = "0x00000000000000000000000000000000000000a6";
  const B = "0x0000000000000000000000000000000000000b18";
  const mixed = new Map([
    [A, { address: A, symbol: "X", decimals: 6, lt: null }],
    [B, { address: B, symbol: "X", decimals: 18, lt: null }],
  ]);
  const rows = [
    { blockNumber: 10, txIndex: 0, logIndex: 1, txHash: "0x1", kind: "supply", reserve: A, amount: 1_234_567n },
    {
      blockNumber: 12,
      txIndex: 0,
      logIndex: 1,
      txHash: "0x2",
      kind: "supply",
      reserve: B,
      amount: 1_000_000_000_000_000_001n,
    },
  ];
  const r = replayAaveV3Rows({
    wallet: WALLET,
    chainId: 8453,
    rows,
    metas: mixed,
    timestamps: new Map([
      [10, 1],
      [12, 2],
    ]),
    senders: new Map(),
    maxRendered: 2,
    coverage: { fromBlock: 0, toBlock: 12, fromDeployment: true, deployBlock: 0, gaps: [], source: "index" },
  });
  const x = r.lifetime.find((f) => f.symbol === "X");
  assert(x != null && r.lifetime.length === 1, "one symbol entry for the two reserves");
  assert(
    x.supplied === scaleV3Old(1_234_567n, 6) + scaleV3Old(1_000_000_000_000_000_001n, 18),
    `supplied is each reserve scaled on its own decimals, then added (${x.supplied})`,
  );
  assert(
    r.lifetimeRaw.length === 2 && r.lifetimeRaw.every((e) => e.symbol === "X"),
    "lifetimeRaw still lists the two reserves apart, raw",
  );
}

assert(transfersWithRemainder > 0, `${transfersWithRemainder} transfers whose value × index ÷ 1e27 has a remainder`);
const wholeHand = checkHistory("hand-built history", hand, { absolute: 1e-9 });
const wholeRandom = checkHistory("pseudo-random history", random, { relative: 1e-9 });
checkMixedDecimals();
checkSeededReplay("hand-built history", hand, wholeHand);
checkSeededReplay("pseudo-random history", random, wholeRandom);

console.log(`\n${checks} checks, ${failures} failed${PERTURB ? " (--perturb: a red run is the pass)" : ""}`);
process.exit(failures > 0 ? 1 : 0);
