// Compound V3's lifetime flows are exact, and a whole life is a seed plus a tail.
// ----------------------------------------------------------------------------
// `replayCometRows` used to accumulate the lifetime flows — `deposited` /
// `withdrawn` / `borrowed` / `repaid` / `absorbedDebt` and each collateral
// asset's five legs — as scaled float64 in row order, splitting every base row
// at its zero crossings against the running balance. A numeric aggregate over
// the same rows agreed with that walk to about a part in 10⁷ and not bit for
// bit, which is what kept a heavy wallet's flows from travelling as state
// (rails-ops/architecture/heavy-wallet-timeline-gate.md). The flows now
// accumulate as bigints in raw token units and scale ONCE at the edge, in one
// arithmetic shared by the row replay and the Ethereum page's walk over
// rendered events. This checks the claims that rest on, offline, on a
// synthetic history that crosses zero every way Comet can:
//
//   1. THE RAW TOTALS ARE THE PLAIN SUMS. On the base spine
//      `deposited + repaid` equals Σ of the positive non-absorb deltas,
//      `withdrawn + borrowed` equals Σ |negative deltas|, `absorbedDebt` the
//      absorbs — exactly, as bigints. Every collateral leg is the sum of its
//      kind's magnitudes.
//
//   2. NOTHING VISIBLE MOVED. Each scaled leg equals what the old float walk
//      produced, to 1e-9 on the hand-built history and to a relative 1e-9 on
//      twenty thousand pseudo-random rows (where the float walk has drifted
//      and the exact figure is the correct one).
//
//   3. THE TWO WALKS ARE ONE. `replayCompoundLifetime` over the rendered
//      events (the Ethereum page's route, parsing human strings back to raw)
//      lands on the same bigints as the row replay, and the same doubles.
//
//   4. SEED + TAIL == WHOLE, BIT FOR BIT. The prefix's `lifetimeRaw` is handed
//      to `compoundLifetimeWithOpening` as an opening balance and the suffix's
//      events as the window; the merged figure must equal the whole history's
//      with `===` on every leg. The tail's own split differs from the whole's
//      (a supply that lands on a debt the tail never saw reads as a deposit),
//      which is why only the exact seed makes the figure travel — the run
//      counts the reclassified legs so that claim is not vacuous.
//
//   5. THE REPLAY'S OWN SEED INPUT LANDS WHERE THE WHOLE LIST LANDS. The Base
//      index reader hands a heavy wallet's elided history to `replayCometRows`
//      as `seeds` (its `CometReplaySeed`, the API's `TimelineSeed` parsed to
//      bigints). Here the seed is computed by an INDEPENDENT walk over the
//      prefix — the closed forms the server's SQL uses (a plain sum for the
//      unclamped base, a running max over its prefix sums for the peaks,
//      Lindley's form for the clamped collateral, counts, and the zero-
//      crossing split over raw deltas) — never by the replay under test. The
//      seed-plus-tail replay must then equal the whole-list replay on every
//      position field with `===` on the raw strings, and its drawn events
//      must be the whole list's own newest ones, running balances included.
//
// `--perturb` adds one raw unit to one seeded leg and must turn checks 4 and
// 5 red.
//
// Run:
//   node scripts/verify/verify-compound-lifetime-bigint.mjs
//   node scripts/verify/verify-compound-lifetime-bigint.mjs --perturb

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");

// The replay is TypeScript with `@/` path aliases, and neither type stripping
// nor alias resolution is on by default. Re-exec once with both, exactly as
// verify-compound-v3-base-heavy-timeline.mjs does.
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

const { replayCometRows } = await import("../../lib/sources/chain/compound-v3-events.ts");
const { replayCompoundLifetime, scaleCompoundLifetime, compoundLifetimeWithOpening } = await import(
  "../../lib/compound/economics.ts"
);

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  } else console.log("  ok:", msg);
}

// ── The synthetic market ────────────────────────────────────────────────────
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c785";
const market = {
  key: "usdc",
  label: "cUSDCv3",
  comet: "0xc3d688b66703497daa19211eedff47f25384cdc3",
  baseSymbol: "USDC",
  baseToken: USDC,
  baseDecimals: 6,
  quoteUnit: "USD",
};
const deployment = { chainId: 1, markets: [market] };
const metas = new Map([
  [WETH, { address: WETH, symbol: "WETH", decimals: 18 }],
  [WBTC, { address: WBTC, symbol: "WBTC", decimals: 8 }],
]);
const WALLET = "0x000000000000000000000000000000000000beef";
const OTHER = "0x000000000000000000000000000000000000cafe";

const BASE_KINDS = new Set(["supply", "withdraw", "absorb_debt", "transfer_in", "transfer_out"]);
const units = (human, decimals) => {
  const [w, f = ""] = String(human).split(".");
  const neg = w.startsWith("-");
  const v = BigInt((neg ? w.slice(1) : w) + f.padEnd(decimals, "0").slice(0, decimals));
  return neg ? -v : v;
};

/** One row. `amount` is signed human units of the touched token. */
let block = 100;
let tx = 0;
let log = 0;
function row(kind, amount, asset = USDC, sameTx = false) {
  if (!sameTx) {
    block += 7;
    tx += 1;
    log = 0;
  }
  log += 1;
  const decimals = asset === USDC ? 6 : metas.get(asset).decimals;
  return {
    market,
    blockNumber: block,
    txIndex: tx % 3,
    logIndex: log,
    txHash: `0x${tx.toString(16).padStart(64, "0")}`,
    kind,
    asset: BASE_KINDS.has(kind) ? USDC : asset,
    delta: typeof amount === "bigint" ? amount : units(amount, decimals),
    counterparty: OTHER,
    ...(kind === "absorb_debt" || kind === "absorb_collateral" ? { usdValue: BigInt(12345678) } : {}),
  };
}

// The hand-built history: every crossing Comet's split has to name.
const hand = [
  row("supply", "100"), //                  +100 → deposit           (bal 100)
  row("supply_collateral", "2", WETH),
  row("withdraw", "-250"), //               100 withdrawn, 150 borrowed (bal -150)
  row("supply", "40.123456"), //            all repay                 (bal -109.876544)
  row("transfer_out", "-10"), //            borrow                    (bal -119.876544)
  row("absorb_debt", "119.876544"), //      absorbedDebt              (bal 0)
  row("absorb_collateral", "-1.5", WETH, true),
  row("supply", "0.000001"), //             dust deposit
  row("withdraw", "-0.000001"), //          dust withdraw             (bal 0)
  row("supply", "300"),
  row("supply", "33.333333"), //            (bal 333.333333)
  row("withdraw", "-400.5"), //             333.333333 withdrawn, 67.166667 borrowed
  row("supply", "500"), //                  67.166667 repaid, 432.833333 deposit
  row("withdraw_collateral", "-0.25", WETH),
  row("transfer_collateral_in", "0.1", WETH),
  row("transfer_collateral_out", "-0.05", WETH),
  row("supply_collateral", "0.12345678", WBTC),
  row("withdraw", "-432.833333"), //        exactly to zero: all withdrawn (bal 0)
  row("withdraw", "-0.000003"), //          from zero: all borrow
];

// A long pseudo-random history, seeded so the run is reproducible. Awkward
// amounts (odd raw units) so the float walk has something to round.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const rnd = lcg(20260906);
const KINDS = ["supply", "withdraw", "supply", "withdraw", "supply_collateral", "withdraw_collateral", "transfer_out"];
const random = [];
for (let i = 0; i < 20_000; i++) {
  const kind = KINDS[Math.floor(rnd() * KINDS.length)];
  const raw = BigInt(Math.floor(rnd() * 1e12) + 1);
  if (i % 977 === 976) {
    random.push(row("absorb_debt", BigInt(Math.floor(rnd() * 1e11) + 1)));
    random.push(row("absorb_collateral", -BigInt(Math.floor(rnd() * 1e17) + 1), WETH, true));
    continue;
  }
  const sign = kind === "withdraw" || kind === "withdraw_collateral" || kind === "transfer_out" ? -raw : raw;
  random.push(row(kind, sign, kind.endsWith("collateral") ? (rnd() < 0.5 ? WETH : WBTC) : USDC));
}

// ── The old walk, kept here as the oracle for "nothing visible moved" ──────
function scaleRawOld(raw, decimals) {
  if (raw === BigInt(0)) return 0;
  const neg = raw < BigInt(0);
  const a = neg ? -raw : raw;
  const divisor = BigInt("1" + "0".repeat(decimals));
  const v = Number(a / divisor) + Number(a % divisor) / Number(divisor);
  return neg ? -v : v;
}
function oldWalk(rows) {
  const lt = { deposited: 0, withdrawn: 0, borrowed: 0, repaid: 0, absorbedDebt: 0, collateral: {} };
  let base = BigInt(0);
  for (const d of rows) {
    if (BASE_KINDS.has(d.kind)) {
      const before = base;
      base += d.delta;
      const delta = scaleRawOld(d.delta, 6);
      const beforeN = scaleRawOld(before, 6);
      if (d.kind === "absorb_debt") lt.absorbedDebt += Math.abs(delta);
      else if (delta > 0) {
        const repay = Math.min(delta, Math.max(0, -beforeN));
        lt.repaid += repay;
        lt.deposited += delta - repay;
      } else if (delta < 0) {
        const mag = -delta;
        const fromSavings = Math.min(mag, Math.max(0, beforeN));
        lt.withdrawn += fromSavings;
        lt.borrowed += mag - fromSavings;
      }
    } else {
      const meta = metas.get(d.asset);
      const c = lt.collateral[d.asset] ?? { supplied: 0, withdrawn: 0, absorbed: 0, received: 0, sent: 0 };
      const mag = Math.abs(scaleRawOld(d.delta, meta.decimals));
      if (d.kind === "supply_collateral") c.supplied += mag;
      else if (d.kind === "withdraw_collateral") c.withdrawn += mag;
      else if (d.kind === "absorb_collateral") c.absorbed += mag;
      else if (d.kind === "transfer_collateral_in") c.received += mag;
      else if (d.kind === "transfer_collateral_out") c.sent += mag;
      lt.collateral[d.asset] = c;
    }
  }
  return lt;
}

const BASE_LEGS = ["deposited", "withdrawn", "borrowed", "repaid", "absorbedDebt"];
const COLL_LEGS = ["supplied", "withdrawn", "absorbed", "received", "sent"];
const KIND_LEG = {
  supply_collateral: "supplied",
  withdraw_collateral: "withdrawn",
  absorb_collateral: "absorbed",
  transfer_collateral_in: "received",
  transfer_collateral_out: "sent",
};

function replay(rows, maxRendered) {
  const timestamps = new Map(rows.map((r) => [r.blockNumber, 1_700_000_000 + r.blockNumber * 12]));
  return replayCometRows({
    wallet: WALLET,
    chainId: 1,
    deployment,
    rows,
    metas,
    timestamps,
    senders: new Map(),
    maxRendered,
    coverage: { fromBlock: 0, toBlock: block, fromDeployment: true, deployBlock: 0, gaps: [], source: "sweep" },
  });
}

const big = (s) => BigInt(s);
const abs = (v) => (v < BigInt(0) ? -v : v);

function checkHistory(name, rows, tolerance) {
  console.log(`\n${name} — ${rows.length} rows`);
  const whole = replay(rows, rows.length);
  const m = whole.markets[0];
  const raw = m.lifetimeRaw;

  // 1. The raw totals are the plain sums.
  let posBase = BigInt(0);
  let negBase = BigInt(0);
  let absorbed = BigInt(0);
  const collSums = {};
  for (const d of rows) {
    if (d.kind === "absorb_debt") absorbed += abs(d.delta);
    else if (BASE_KINDS.has(d.kind)) {
      if (d.delta > BigInt(0)) posBase += d.delta;
      else negBase += -d.delta;
    } else {
      const c = (collSums[d.asset] ??= { supplied: 0n, withdrawn: 0n, absorbed: 0n, received: 0n, sent: 0n });
      c[KIND_LEG[d.kind]] += abs(d.delta);
    }
  }
  assert(big(raw.deposited) + big(raw.repaid) === posBase, `deposited + repaid == Σ positive base deltas (${posBase})`);
  assert(
    big(raw.withdrawn) + big(raw.borrowed) === negBase,
    `withdrawn + borrowed == Σ |negative base deltas| (${negBase})`,
  );
  assert(big(raw.absorbedDebt) === absorbed, `absorbedDebt == Σ absorbs (${absorbed})`);
  for (const [addr, sums] of Object.entries(collSums)) {
    const sym = metas.get(addr).symbol;
    assert(
      COLL_LEGS.every((leg) => big(raw.collateral[addr][leg]) === sums[leg]),
      `${sym}: every collateral leg is its kind's raw sum`,
    );
  }
  assert(
    Object.keys(raw.collateral).length === Object.keys(collSums).length,
    "no collateral asset beyond the ones the rows touched",
  );

  // 2. Nothing visible moved: the scaled legs equal the old float walk.
  const old = oldWalk(rows);
  let maxRel = 0;
  const near = (a, b) => {
    const diff = Math.abs(a - b);
    const rel = diff / Math.max(1, Math.abs(b));
    if (rel > maxRel) maxRel = rel;
    return tolerance.absolute ? diff <= tolerance.absolute : rel <= tolerance.relative;
  };
  assert(
    BASE_LEGS.every((leg) => near(m.lifetime[leg], old[leg])),
    `every scaled base leg matches the old float walk (${tolerance.absolute ? "abs" : "rel"} ${tolerance.absolute ?? tolerance.relative})`,
  );
  assert(
    Object.entries(old.collateral).every(([addr, c]) =>
      COLL_LEGS.every((leg) => near(m.lifetime.collateral[addr][leg], c[leg])),
    ),
    "every scaled collateral leg matches the old float walk",
  );
  console.log(`      max relative drift between the exact figure and the float walk: ${maxRel.toExponential(3)}`);
  // The wire form IS the source of the scaled figures: parse it back and scale.
  const rescaled = scaleCompoundLifetime(fromWire(raw));
  assert(
    BASE_LEGS.every((leg) => rescaled[leg] === m.lifetime[leg]) &&
      Object.entries(m.lifetime.collateral).every(([addr, c]) =>
        COLL_LEGS.every((leg) => rescaled.collateral[addr][leg] === c[leg]),
      ),
    "lifetimeRaw (decimal strings) scaled once reproduces lifetime bit for bit",
  );

  // 3. The two walks are one: the event walk lands on the same bigints.
  const walked = replayCompoundLifetime(whole.events, market.key);
  assert(walked != null, "the event walk over the rendered events answers");
  if (walked) {
    assert(
      BASE_LEGS.every((leg) => walked.base[leg] === big(raw[leg])),
      "event walk == row replay on every base leg, as bigints",
    );
    assert(
      Object.entries(raw.collateral).every(([addr, c]) =>
        COLL_LEGS.every((leg) => walked.collateral[addr][leg] === big(c[leg])),
      ),
      "event walk == row replay on every collateral leg, as bigints",
    );
    const scaled = scaleCompoundLifetime(walked);
    assert(
      BASE_LEGS.every((leg) => scaled[leg] === m.lifetime[leg]) &&
        Object.entries(m.lifetime.collateral).every(([addr, c]) =>
          COLL_LEGS.every((leg) => scaled.collateral[addr][leg] === c[leg]),
        ),
      "event walk == row replay on every scaled leg, bit for bit",
    );
  }

  // 4. Seed + tail == whole, bit for bit.
  // Cut at a transaction boundary about two thirds in.
  let cut = Math.floor((rows.length * 2) / 3);
  while (cut > 0 && rows[cut].txHash === rows[cut - 1].txHash) cut++;
  const prefix = replay(rows.slice(0, cut), 0);
  const seedExact = prefix.markets[0].lifetimeRaw;
  const seed = PERTURB ? { ...seedExact, deposited: (big(seedExact.deposited) + BigInt(1)).toString() } : seedExact;
  const tail = replay(rows, rows.length - cut); // every row walked, only the tail rendered
  assert(
    tail.events.length === rows.length - cut,
    `the tail renders exactly the ${rows.length - cut} rows after the cut`,
  );
  const opening = {
    cutoffBlock: rows[cut].blockNumber,
    totalEvents: cut,
    firstTimestamp: null,
    lastTimestamp: null,
    firstBlock: null,
    lastBlock: null,
    byAction: [],
    byDay: [],
    byAsset: null,
    actors: null,
    flows: [
      { key: market.key, decimals: 6, epoch: null, legs: Object.fromEntries(BASE_LEGS.map((l) => [l, seed[l]])) },
      ...Object.entries(seed.collateral).map(([addr, c]) => ({
        key: metas.get(addr).symbol,
        sourceKey: addr,
        decimals: metas.get(addr).decimals,
        epoch: null,
        legs: { ...c },
      })),
    ],
    omitted: [],
  };
  const merged = compoundLifetimeWithOpening(tail.events, market.key, opening);
  assert(merged != null, "the merge of seed and tail answers");
  if (merged) {
    const baseExact = BASE_LEGS.every((leg) => merged[leg] === m.lifetime[leg]);
    const collExact = Object.entries(m.lifetime.collateral).every(
      ([addr, c]) => merged.collateral[addr] && COLL_LEGS.every((leg) => merged.collateral[addr][leg] === c[leg]),
    );
    assert(baseExact, "seed + tail == whole on every base leg, with ===");
    assert(collExact, "seed + tail == whole on every collateral leg, with ===");
  }
  // The merge above was exact because every tail event carries the WHOLE
  // life's `baseAfter`. A tail replayed FROM ZERO — a horizon, what the Base
  // index lane serves a heavy wallet today — classifies the same rows
  // differently: a supply that lands on a debt the tail never saw reads as a
  // deposit rather than a repayment. That is the reason a seed has to carry
  // the running base as well as the flows, and the reason a per-leg figure is
  // not even bounded by the whole's. What IS a plain sum, and so adds up
  // across the cut regardless, is each pair.
  const fromZero = replay(rows.slice(cut), 0).markets[0].lifetimeRaw;
  const reclassified = BASE_LEGS.filter((leg) => big(fromZero[leg]) + big(seedExact[leg]) !== big(raw[leg]));
  console.log(
    `      legs a from-zero tail classifies differently from the whole: ${reclassified.length} (${reclassified.join(", ") || "none"})`,
  );
  const pair = (f, a, b) => big(f[a]) + big(f[b]);
  assert(
    pair(fromZero, "deposited", "repaid") + pair(seedExact, "deposited", "repaid") ===
      pair(raw, "deposited", "repaid") &&
      pair(fromZero, "withdrawn", "borrowed") + pair(seedExact, "withdrawn", "borrowed") ===
        pair(raw, "withdrawn", "borrowed") &&
      big(fromZero.absorbedDebt) + big(seedExact.absorbedDebt) === big(raw.absorbedDebt),
    "the pairs (deposited+repaid, withdrawn+borrowed) and absorbedDebt still add up across the cut from zero",
  );
  return reclassified.length;
}

/** The seed a server computes for the rows before a cut — written out as the
 *  closed forms, NOT by running the replay over the prefix, so that check 5
 *  tests the seed's meaning and not the replay against itself. */
function seedOf(rows) {
  let base = 0n;
  let peakLend = 0n;
  let peakBorrow = 0n;
  const coll = new Map(); // asset → { bal, peak }
  const lt = { deposited: 0n, withdrawn: 0n, borrowed: 0n, repaid: 0n, absorbedDebt: 0n, collateral: {} };
  let absorbs = 0;
  const txs = new Set();
  for (const d of rows) {
    if (BASE_KINDS.has(d.kind)) {
      const before = base;
      base += d.delta;
      if (base > peakLend) peakLend = base;
      if (-base > peakBorrow) peakBorrow = -base;
      if (d.kind === "absorb_debt") {
        lt.absorbedDebt += abs(d.delta);
        absorbs++;
      } else if (d.delta > 0n) {
        const repay = d.delta < -before ? d.delta : -before > 0n ? -before : 0n;
        lt.repaid += repay;
        lt.deposited += d.delta - repay;
      } else if (d.delta < 0n) {
        const mag = -d.delta;
        const fromSavings = mag < before ? mag : before > 0n ? before : 0n;
        lt.withdrawn += fromSavings;
        lt.borrowed += mag - fromSavings;
      }
    } else {
      const c = coll.get(d.asset) ?? { bal: 0n, peak: 0n };
      c.bal = c.bal + d.delta < 0n ? 0n : c.bal + d.delta;
      if (c.bal > c.peak) c.peak = c.bal;
      coll.set(d.asset, c);
      const legs = (lt.collateral[d.asset] ??= { supplied: 0n, withdrawn: 0n, absorbed: 0n, received: 0n, sent: 0n });
      legs[KIND_LEG[d.kind]] += abs(d.delta);
    }
    if (d.kind !== "absorb_debt" && d.kind !== "absorb_collateral") txs.add(d.txHash);
  }
  const ts = (r) => 1_700_000_000 + r.blockNumber * 12;
  return {
    market,
    base,
    peakLend,
    peakBorrow,
    collateral: Object.fromEntries([...coll].map(([a, c]) => [a, { balance: c.bal, peak: c.peak }])),
    absorbs,
    txCount: txs.size,
    eventCount: rows.length,
    firstBlock: rows[0].blockNumber,
    firstTimestamp: ts(rows[0]),
    lastBlock: rows[rows.length - 1].blockNumber,
    lastTimestamp: ts(rows[rows.length - 1]),
    lifetime: lt,
  };
}

/** Check 5, on one history: the replay opened from a seed and walked over
 *  the tail equals the replay over the whole list. */
function checkSeededReplay(name, rows) {
  console.log(`\n${name} — seed + tail through replayCometRows`);
  let cut = Math.floor((rows.length * 2) / 3);
  while (cut > 0 && rows[cut].txHash === rows[cut - 1].txHash) cut++;
  const tail = rows.slice(cut);
  const seedExact = seedOf(rows.slice(0, cut));
  const seed = PERTURB ? { ...seedExact, base: seedExact.base + 1n } : seedExact;
  const whole = replay(rows, tail.length);
  const timestamps = new Map(tail.map((r) => [r.blockNumber, 1_700_000_000 + r.blockNumber * 12]));
  const seeded = replayCometRows({
    wallet: WALLET,
    chainId: 1,
    deployment,
    rows: tail,
    metas,
    timestamps,
    senders: new Map(),
    maxRendered: tail.length,
    seeds: [seed],
    coverage: { fromBlock: 0, toBlock: block, fromDeployment: true, gaps: [], deployBlock: 0, source: "index" },
  });
  const w = whole.markets[0];
  const m = seeded.markets[0];
  assert(m != null && seeded.markets.length === 1, "the seeded replay holds the one market");
  if (!m) return;
  assert(m.base.amountRaw === w.base.amountRaw, `base principal, raw === (${m.base.amountRaw} vs ${w.base.amountRaw})`);
  assert(
    m.peak.lentBaseRaw === w.peak.lentBaseRaw && m.peak.borrowedBaseRaw === w.peak.borrowedBaseRaw,
    `peak lent / borrowed, raw === (${m.peak.lentBaseRaw}/${m.peak.borrowedBaseRaw} vs ${w.peak.lentBaseRaw}/${w.peak.borrowedBaseRaw})`,
  );
  const byAddr = (list) => JSON.stringify([...list].sort((a, b) => (a.address < b.address ? -1 : 1)));
  assert(byAddr(m.collateral) === byAddr(w.collateral), "collateral balances per asset, raw ===");
  assert(byAddr(m.peak.collateral) === byAddr(w.peak.collateral), "collateral peaks per asset, raw ===");
  assert(m.txCount === w.txCount, `txCount (${m.txCount} vs ${w.txCount})`);
  assert(
    m.liquidationCount === w.liquidationCount && m.everLiquidated === w.everLiquidated,
    `liquidationCount (${m.liquidationCount} vs ${w.liquidationCount})`,
  );
  assert(
    m.firstEventAt === w.firstEventAt && m.lastActivityAt === w.lastActivityAt,
    "firstEventAt / lastActivityAt from the seed and the tail",
  );
  assert(
    BASE_LEGS.every((leg) => m.lifetimeRaw[leg] === w.lifetimeRaw[leg]),
    "every base lifetime leg, raw ===",
  );
  assert(
    JSON.stringify(m.lifetimeRaw.collateral) === JSON.stringify(w.lifetimeRaw.collateral),
    "every collateral lifetime leg, raw ===",
  );
  assert(JSON.stringify(m.lifetime) === JSON.stringify(w.lifetime), "the scaled lifetime, bit for bit");
  // The two per-asset lists are Map insertion order — the whole walk lists a
  // peak from the first row that lifted the balance above zero, a seed from
  // the asset's first touch — so they are compared by address; every figure
  // in them is compared exactly.
  //
  // `omitted.summary.byType`/`byAsset` are excluded on purpose: per-market
  // decision 0019 (commit c2eefc0b) withholds the histogram on a seeded
  // market ("seeded markets carry a count and no breakdown, so the
  // histograms are withheld rather than stated short") but states it on a
  // market the walk owns every row of, which `w` here always does — the two
  // replays are correct to disagree there. `omitted.count`/`upToBlock` and
  // the rest of `summary` (stateAtCut, firstAt, lastAt) still compare exactly.
  const withheldHistogram = (summary) =>
    summary && typeof summary === "object" ? { ...summary, byType: undefined, byAsset: undefined } : summary;
  const normalised = (pos) => ({
    ...pos,
    collateral: JSON.parse(byAddr(pos.collateral)),
    peak: { ...pos.peak, collateral: JSON.parse(byAddr(pos.peak.collateral)) },
    ...(pos.omitted ? { omitted: { ...pos.omitted, summary: withheldHistogram(pos.omitted.summary) } } : {}),
  });
  assert(
    JSON.stringify(normalised(m)) === JSON.stringify(normalised(w)),
    "the whole position, field for field (per-asset lists by address, seeded histogram excluded)",
  );
  assert(
    m.omitted?.summary?.byType === null && m.omitted?.summary?.byAsset === null,
    "a seeded market's own boundary card withholds its histogram (rails-ops decision 0019, c2eefc0b)",
  );
  // The drawn rows: the same events with the same running balances.
  assert(
    JSON.stringify(seeded.events) === JSON.stringify(whole.events),
    `the drawn events are the whole list's own newest ${tail.length}, running balances included`,
  );
  assert(
    seeded.coverage.omitted?.count === cut && seeded.coverage.omitted?.upToBlock === rows[cut - 1].blockNumber,
    `coverage.omitted counts the ${cut} seeded rows up to the cut`,
  );
  assert(
    seeded.coverage.firstEventAt === whole.coverage.firstEventAt,
    "coverage.firstEventAt is the seed's, the whole list's own first",
  );
}

function fromWire(raw) {
  return {
    base: Object.fromEntries(BASE_LEGS.map((l) => [l, big(raw[l])])),
    baseDecimals: 6,
    collateral: Object.fromEntries(
      Object.entries(raw.collateral).map(([addr, c]) => [
        addr,
        {
          symbol: metas.get(addr).symbol,
          decimals: metas.get(addr).decimals,
          ...Object.fromEntries(COLL_LEGS.map((l) => [l, big(c[l])])),
        },
      ]),
    ),
  };
}

const r1 = checkHistory("hand-built history", hand, { absolute: 1e-9 });
const r2 = checkHistory("pseudo-random history", random, { relative: 1e-9 });
assert(r1 + r2 > 0, "at least one leg reclassified across the two histories — the seed+tail check is not vacuous");
checkSeededReplay("hand-built history", hand);
checkSeededReplay("pseudo-random history", random);

console.log(`\n${checks} checks, ${failures} failed${PERTURB ? " (--perturb: a red run is the pass)" : ""}`);
process.exit(failures > 0 ? 1 : 0);
