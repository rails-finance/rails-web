// Moonwell's lifetime flows are exact, and a whole life is a seed plus a tail.
// ----------------------------------------------------------------------------
// `replayMoonwellRows` used to accumulate the lifetime flows — `supplied` /
// `withdrawn` / `borrowed` / `repaid` / `liquidatedDebt` per market — as
// scaled float64 in row order, and netted the liquidated debt out of `repaid`
// on the floats. A numeric aggregate over the same rows agreed with that walk
// to a few parts in 10¹⁶ and not bit for bit, which is what kept a heavy
// wallet's flows from travelling as state (rails-ops/architecture/
// heavy-wallet-timeline-gate.md). The flows now accumulate as bigints in raw
// underlying wei, the carve-out is applied in the integer domain, and each
// leg scales ONCE at the edge. This checks the claims that rest on, offline,
// on a synthetic history that exercises every row-set rule the reader applies
// — routed mints (and the (tx, log) dedupe of their doubled pairing), the
// custody rule on mToken transfers including the protocol's cut of a seize,
// liquidations with their RepayBorrow legs — on two markets of different
// decimals:
//
//   1. THE RAW TOTALS ARE THE PLAIN SUMS. Per market `supplied` is Σ mint
//      amounts, `withdrawn` Σ redeem, `borrowed` Σ borrow, `liquidatedDebt`
//      Σ liquidation repay amounts, and `repaid` is max(0, Σ repay − Σ
//      liquidation) — exactly, as bigints.
//
//   2. NOTHING VISIBLE MOVED. Each scaled leg equals what the old float walk
//      produced, to 1e-9 on the hand-built history and to a relative 1e-9 on
//      twenty thousand pseudo-random rows (where the float walk has drifted
//      and the exact figure is the correct one), and `lifetimeRaw` scaled
//      once reproduces `lifetime` bit for bit.
//
//   3. SEED + TAIL == WHOLE. The history is cut at a block boundary about two
//      thirds in. The seed over the head is computed by an INDEPENDENT
//      closed-form walk — the server's own identity for the clamped lanes
//      (b = S − least(0, min S), peak = max b), the market's last emitted
//      `accountBorrows` and their max for the debt lane, raw sums per kind
//      (gross `repaid`), distinct non-liquidation transactions, counts and
//      stamps — never by the replay under test. `replayMoonwellRows` opened
//      from that seed over the tail must then equal the replay over the whole
//      list on every position field, both peaks, txCount, totalEvents,
//      liquidationCount, firstEventAt, lastActivityAt, and every lifetime leg
//      with `===` on the raw strings; its drawn events must be the whole
//      list's own rows after the cut; and `coverage.omitted` must count the
//      seeded rows up to the seed's last block without the `anchored` licence
//      (a wallet-signed row before the cut is not drawn).
//
//   4. THE HORIZON PATH DID NOT MOVE. The same tail replayed with only the
//      debt-only `seeds` (what the route sends while no seed is stored) still
//      lands the debt lane where the whole replay lands and counts nothing it
//      did not see.
//
// `--perturb` adds one raw unit to one seeded leg and must turn check 3 red.
//
// Run:
//   node scripts/verify/verify-moonwell-lifetime-bigint.mjs
//   node scripts/verify/verify-moonwell-lifetime-bigint.mjs --perturb

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

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

const PERTURB = process.argv.includes("--perturb");

const { replayMoonwellRows, transferKind } = await import("../../lib/sources/chain/moonwell-events.ts");

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  } else console.log("  ok:", msg);
}

// ── The synthetic deployment ────────────────────────────────────────────────
const WALLET = "0x000000000000000000000000000000000000beef";
const ROUTER = "0x000000000000000000000000000000000000f00d";
const LIQUIDATOR = "0x00000000000000000000000000000000000011a7";
const OTHER = "0x000000000000000000000000000000000000cafe";
const M_USDC = "0x00000000000000000000000000000000000000a1";
const M_WETH = "0x00000000000000000000000000000000000000b2";
const USDC = "0x0000000000000000000000000000000000000a1a";
const WETH = "0x0000000000000000000000000000000000000b2b";
const markets = [
  { key: "usdc", symbol: "USDC", mSymbol: "mUSDC", mtoken: M_USDC, underlying: USDC, decimals: 6, collateralFactor: 0 },
  {
    key: "weth",
    symbol: "WETH",
    mSymbol: "mWETH",
    mtoken: M_WETH,
    underlying: WETH,
    decimals: 18,
    collateralFactor: 0,
  },
];
const marketByMtoken = new Map(markets.map((m) => [m.mtoken, m]));
const protocolLegs = new Set([...marketByMtoken.keys(), ROUTER]);
const CHAIN_ID = 8453;
const ts = (block) => 1_700_000_000 + block * 2;

const units = (human, decimals) => {
  const [w, f = ""] = String(human).split(".");
  return BigInt(w + f.padEnd(decimals, "0").slice(0, decimals));
};

// ── Rows in the API's own shape ─────────────────────────────────────────────
// Every row is written as /api/moonwell-base/timeline sends it (strings, the
// direction of a transfer resolved, the other party in `caller`) and goes
// through the reader's own decode below, so the custody rule and the dedupe
// are exercised on the way in rather than assumed.
let block = 1000;
let txi = 0;
let log = 0;
let txCounter = 0;
let txHash = "";
/** Open a new transaction, in a new block unless `sameBlock`. */
function tx(from = WALLET, sameBlock = false) {
  if (!sameBlock) {
    block += 3;
    txi = 0;
  } else txi += 1;
  log = 0;
  txCounter += 1;
  txHash = `0x${txCounter.toString(16).padStart(64, "0")}`;
  return from;
}
function row(kind, market, fields, txFrom = WALLET) {
  log += 1;
  return {
    kind,
    block_number: String(block),
    tx_index: txi,
    log_index: log,
    tx_hash: txHash,
    block_timestamp: String(ts(block)),
    tx_from: txFrom,
    tx_gas_used: null,
    tx_gas_price: null,
    market,
    caller: null,
    amount: null,
    mtokens: null,
    account_borrows: null,
    collateral_market: null,
    seize_tokens: null,
    liquidator: null,
    ...fields,
  };
}
const mint = (market, amount, mtokens, caller = WALLET) =>
  row("mint", market, { caller, amount: String(amount), mtokens: String(mtokens) });
const redeem = (market, amount, mtokens, caller = WALLET) =>
  row("redeem", market, { caller, amount: String(amount), mtokens: String(mtokens) });
const borrow = (market, amount, accountBorrows) =>
  row("borrow", market, { amount: String(amount), account_borrows: String(accountBorrows) });
const repay = (market, amount, accountBorrows, payer = WALLET, txFrom = WALLET) =>
  row("repay", market, { caller: payer, amount: String(amount), account_borrows: String(accountBorrows) }, txFrom);
const liquidation = (market, amount, collateral, seizeTokens) =>
  row(
    "liquidation",
    market,
    {
      caller: LIQUIDATOR,
      amount: String(amount),
      collateral_market: collateral,
      seize_tokens: String(seizeTokens),
      liquidator: LIQUIDATOR,
    },
    LIQUIDATOR,
  );
const xferOut = (market, to, mtokens, txFrom = WALLET) =>
  row("transfer_out", market, { caller: to, mtokens: String(mtokens) }, txFrom);
const xferIn = (market, from, mtokens, txFrom = WALLET) =>
  row("transfer_in", market, { caller: from, mtokens: String(mtokens) }, txFrom);

const U = (h) => units(h, 6);
const E = (h) => units(h, 18);
const MT = (h) => units(h, 8);

// The hand-built history: every rule the reader applies, on both markets.
const hand = [];
tx();
hand.push(mint(M_USDC, U("1000"), MT("49000")));
tx();
// A routed mint: the router minted, the API resolved the owner. Its pairing
// is doubled on the wire — the reader dedupes on (tx, log).
{
  const r = mint(M_WETH, E("2"), MT("9500"), ROUTER);
  hand.push(r, { ...r });
}
tx();
hand.push(borrow(M_USDC, U("400"), U("400")));
tx();
hand.push(mint(M_USDC, U("0.000001"), MT("0.00000004")));
tx();
hand.push(repay(M_USDC, U("150.5"), U("251.123456")));
tx();
// A custody move to another wallet: kept, the mToken lane moves.
hand.push(xferOut(M_USDC, OTHER, MT("1000")));
tx();
// A wallet→market transfer with no liquidation in the transaction is a
// Redeem's companion: dropped by the custody rule.
hand.push(xferOut(M_USDC, M_USDC, MT("1")));
tx();
// A market→wallet transfer is a Mint's leg: dropped.
hand.push(xferIn(M_WETH, M_WETH, MT("1")));
tx();
// A custody move in from another wallet: kept.
hand.push(xferIn(M_WETH, OTHER, MT("250")));
tx();
// A redeem past the principal: the supply lane clamps at zero.
hand.push(redeem(M_USDC, U("1200"), MT("30000")));
tx();
hand.push(borrow(M_WETH, E("1.5"), E("1.5")));
tx();
hand.push(borrow(M_WETH, E("0.25"), E("1.75123")));
// The liquidation: the liquidator's transaction. Its RepayBorrow leg (payer =
// liquidator) lands in `repaid` and the carve-out nets it back out; the
// seize is a transfer_out to the liquidator (kept, a custody move) and the
// protocol's cut a transfer_out to the collateral market itself (kept ONLY
// because a liquidation of this wallet seized that market in this tx).
tx(LIQUIDATOR);
hand.push(repay(M_WETH, E("0.9"), E("0.86"), LIQUIDATOR, LIQUIDATOR));
hand.push(liquidation(M_WETH, E("0.9"), M_USDC, MT("12000")));
hand.push(xferOut(M_USDC, LIQUIDATOR, MT("11664"), LIQUIDATOR));
hand.push(xferOut(M_USDC, M_USDC, MT("336"), LIQUIDATOR));
tx();
hand.push(repay(M_WETH, E("0.86"), E("0")));
tx();
hand.push(mint(M_WETH, E("0.000000000000000001"), MT("0.00000001")));
tx();
hand.push(redeem(M_WETH, E("1.999999999999999999"), MT("9500.00000001"), ROUTER));
tx();
// A second liquidation whose debt leg exceeds every voluntary repayment so far
// on USDC: `repaid` clamps at zero after the carve-out.
tx(LIQUIDATOR);
hand.push(repay(M_USDC, U("251.123456"), U("0"), LIQUIDATOR, LIQUIDATOR));
hand.push(liquidation(M_USDC, U("251.123456"), M_WETH, MT("100")));
hand.push(xferOut(M_WETH, LIQUIDATOR, MT("97"), LIQUIDATOR));
hand.push(xferOut(M_WETH, M_WETH, MT("3"), LIQUIDATOR));
tx();
hand.push(mint(M_USDC, U("42"), MT("2000")));

// A long pseudo-random history, seeded so the run is reproducible, with odd
// raw units so the float walk has something to round.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const rnd = lcg(20260906);
const rawOf = (max) => BigInt(Math.floor(rnd() * max) + 1);
const random = [];
{
  const debt = { [M_USDC]: 0n, [M_WETH]: 0n };
  for (let i = 0; i < 20_000; i++) {
    const m = rnd() < 0.5 ? M_USDC : M_WETH;
    const other = m === M_USDC ? M_WETH : M_USDC;
    const unit = m === M_USDC ? 1e9 : 1e18;
    const k = rnd();
    if (i % 613 === 612) {
      // A liquidation, with its repay leg and both seize transfers.
      tx(LIQUIDATOR);
      const a = debt[m] > 0n ? debt[m] / 3n + 1n : rawOf(unit);
      debt[m] = debt[m] > a ? debt[m] - a : 0n;
      random.push(repay(m, a, debt[m], LIQUIDATOR, LIQUIDATOR));
      random.push(liquidation(m, a, other, rawOf(1e10)));
      random.push(xferOut(other, LIQUIDATOR, rawOf(1e10), LIQUIDATOR));
      random.push(xferOut(other, other, rawOf(1e8), LIQUIDATOR));
      continue;
    }
    // Two transactions in one block now and then, so the cut's block boundary
    // and the tx-count seed are both exercised on a shared block.
    tx(WALLET, i % 97 === 96);
    if (k < 0.25) random.push(mint(m, rawOf(unit), rawOf(1e10), rnd() < 0.3 ? ROUTER : WALLET));
    else if (k < 0.45) random.push(redeem(m, rawOf(unit), rawOf(1e10), rnd() < 0.3 ? ROUTER : WALLET));
    else if (k < 0.65) {
      const a = rawOf(unit);
      debt[m] += a + rawOf(1e6); // interest since the last event rides on accountBorrows
      random.push(borrow(m, a, debt[m]));
    } else if (k < 0.8) {
      const a = debt[m] > 0n ? (debt[m] * BigInt(Math.floor(rnd() * 100))) / 100n + 1n : rawOf(unit);
      debt[m] = debt[m] > a ? debt[m] - a : 0n;
      random.push(repay(m, a, debt[m]));
    } else if (k < 0.9) random.push(xferOut(m, rnd() < 0.2 ? m : OTHER, rawOf(1e9)));
    else random.push(xferIn(m, rnd() < 0.2 ? m : OTHER, rawOf(1e9)));
  }
}

// ── The reader's decode, written out ────────────────────────────────────────
// The routed-pair dedupe on (tx, log) and `transferKind` on every raw
// transfer, as lib/sources/api/moonwell-base-timeline.ts applies them.
function decode(json) {
  const seizedIn = new Map();
  for (const r of json) {
    if (r.kind !== "liquidation" || !r.collateral_market) continue;
    if (!seizedIn.has(r.tx_hash)) seizedIn.set(r.tx_hash, new Set());
    seizedIn.get(r.tx_hash).add(r.collateral_market);
  }
  const timestamps = new Map();
  const rows = [];
  const seen = new Set();
  for (const r of json) {
    const market = r.market;
    const key = `${r.tx_hash}-${r.log_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const blockNumber = Number(r.block_number);
    const b = {
      blockNumber,
      txIndex: r.tx_index,
      logIndex: r.log_index,
      txHash: r.tx_hash,
      txFrom: r.tx_from,
      market,
      txGasUsed: r.tx_gas_used,
      txGasPrice: r.tx_gas_price,
      oracleAtBlock: null,
    };
    const caller = r.caller ?? undefined;
    let d = null;
    if (r.kind === "mint" || r.kind === "redeem")
      d = { ...b, kind: r.kind, caller, amount: BigInt(r.amount), mTokens: BigInt(r.mtokens) };
    else if (r.kind === "borrow")
      d = { ...b, kind: "borrow", amount: BigInt(r.amount), accountBorrows: BigInt(r.account_borrows) };
    else if (r.kind === "repay")
      d = { ...b, kind: "repay", caller, amount: BigInt(r.amount), accountBorrows: BigInt(r.account_borrows) };
    else if (r.kind === "liquidation")
      d = {
        ...b,
        kind: "liquidation",
        caller,
        amount: BigInt(r.amount),
        collateralMarket: r.collateral_market,
        seizeTokens: BigInt(r.seize_tokens),
        liquidator: r.liquidator,
      };
    else {
      const other = caller;
      const from = r.kind === "transfer_out" ? WALLET : other;
      const to = r.kind === "transfer_out" ? other : WALLET;
      const kind = transferKind({
        from,
        to,
        wallet: WALLET,
        protocolLegs,
        protocolCut: to === market && (seizedIn.get(r.tx_hash)?.has(market) ?? false),
      });
      if (kind) d = { ...b, kind, caller: other, mTokens: BigInt(r.mtokens) };
    }
    if (!d) continue;
    timestamps.set(blockNumber, Number(r.block_timestamp));
    rows.push(d);
  }
  rows.sort((a, c) => a.blockNumber - c.blockNumber || a.txIndex - c.txIndex || a.logIndex - c.logIndex);
  return { rows, timestamps };
}

function replay(decoded, maxRendered, extra = {}) {
  return replayMoonwellRows({
    wallet: WALLET,
    chainId: CHAIN_ID,
    router: ROUTER,
    rows: decoded.rows,
    marketByMtoken,
    timestamps: decoded.timestamps,
    maxRendered,
    ...extra,
    coverage: { fromBlock: 0, toBlock: block, fromDeployment: true, deployBlock: 0, gaps: [], source: "index" },
  });
}

// ── The old walk, kept here as the oracle for "nothing visible moved" ──────
function oldWalk(rows) {
  const flows = new Map();
  for (const d of rows) {
    const m = marketByMtoken.get(d.market);
    let f = flows.get(m.key);
    if (!f) flows.set(m.key, (f = { supplied: 0, withdrawn: 0, borrowed: 0, repaid: 0, liquidatedDebt: 0 }));
    const scaled = d.amount != null ? Number(d.amount) / 10 ** m.decimals : 0;
    if (d.kind === "liquidation") f.liquidatedDebt += scaled;
    else if (d.kind === "mint") f.supplied += scaled;
    else if (d.kind === "redeem") f.withdrawn += scaled;
    else if (d.kind === "borrow") f.borrowed += scaled;
    else if (d.kind === "repay") f.repaid += scaled;
  }
  for (const f of flows.values()) if (f.liquidatedDebt > 0) f.repaid = Math.max(0, f.repaid - f.liquidatedDebt);
  return flows;
}

/** The edge's own scaling, restated: whole part plus fraction. */
function scaleUnits(raw, decimals) {
  if (raw === 0n) return 0;
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}

const LEGS = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedDebt"];
const big = (s) => BigInt(s);

function checkHistory(name, json, tolerance) {
  const decoded = decode(json);
  const rows = decoded.rows;
  console.log(`\n${name} — ${json.length} rows on the wire, ${rows.length} replayed`);
  const whole = replay(decoded, rows.length);
  assert(whole.lifetime.length === 2 && whole.lifetimeRaw.length === 2, "both markets carry lifetime flows");
  const rawBy = new Map(whole.lifetimeRaw.map((f) => [f.market, f]));
  const scaledBy = new Map(whole.lifetime.map((f) => [f.market, f]));

  // 1. The raw totals are the plain sums.
  const sums = new Map();
  for (const d of rows) {
    const m = marketByMtoken.get(d.market);
    const s = sums.get(m.key) ?? { supplied: 0n, withdrawn: 0n, borrowed: 0n, repaid: 0n, liquidatedDebt: 0n };
    if (d.kind === "mint") s.supplied += d.amount;
    else if (d.kind === "redeem") s.withdrawn += d.amount;
    else if (d.kind === "borrow") s.borrowed += d.amount;
    else if (d.kind === "repay") s.repaid += d.amount;
    else if (d.kind === "liquidation") s.liquidatedDebt += d.amount;
    sums.set(m.key, s);
  }
  for (const [key, s] of sums) {
    const raw = rawBy.get(key);
    const net = s.repaid > s.liquidatedDebt ? s.repaid - s.liquidatedDebt : 0n;
    assert(
      big(raw.supplied) === s.supplied &&
        big(raw.withdrawn) === s.withdrawn &&
        big(raw.borrowed) === s.borrowed &&
        big(raw.liquidatedDebt) === s.liquidatedDebt,
      `${key}: supplied / withdrawn / borrowed / liquidatedDebt are the raw sums per kind`,
    );
    assert(big(raw.repaid) === net, `${key}: repaid == max(0, Σ repay − Σ liquidation) in the integer domain (${net})`);
  }

  // 2. Nothing visible moved.
  const old = oldWalk(rows);
  let maxRel = 0;
  const near = (a, b) => {
    const diff = Math.abs(a - b);
    const rel = diff / Math.max(1, Math.abs(b));
    if (rel > maxRel) maxRel = rel;
    return tolerance.absolute ? diff <= tolerance.absolute : rel <= tolerance.relative;
  };
  for (const [key, o] of old) {
    const f = scaledBy.get(key);
    assert(
      LEGS.every((leg) => near(f[leg], o[leg])),
      `${key}: every scaled leg matches the old float walk (${tolerance.absolute ? "abs" : "rel"} ${tolerance.absolute ?? tolerance.relative})`,
    );
  }
  console.log(`      max relative drift between the exact figure and the float walk: ${maxRel.toExponential(3)}`);
  assert(
    whole.lifetime.every((f, i) => {
      const raw = whole.lifetimeRaw[i];
      const dec = markets.find((m) => m.key === f.market).decimals;
      return raw.market === f.market && LEGS.every((leg) => scaleUnits(big(raw[leg]), dec) === f[leg]);
    }),
    "lifetimeRaw (decimal strings) scaled once reproduces lifetime bit for bit",
  );
  return { decoded, whole };
}

/** The seed a server computes for the rows before a cut — the closed forms,
 *  NOT the replay over the head, so check 3 tests the seed's meaning and not
 *  the replay against itself. The clamped lanes use the identity the server's
 *  SQL uses: b_i = S_i − least(0, min_{k≤i} S_k) over the prefix sums. */
function seedOf(head, timestamps) {
  const per = new Map();
  const stateOf = (market) => {
    let s = per.get(market);
    if (!s) {
      s = {
        supS: 0n,
        supMin: 0n,
        supB: 0n,
        supPeak: 0n,
        mtS: 0n,
        mtMin: 0n,
        mtB: 0n,
        debt: 0n,
        peakDebt: 0n,
        lt: { supplied: 0n, withdrawn: 0n, borrowed: 0n, repaid: 0n, liquidatedDebt: 0n },
      };
      per.set(market, s);
    }
    return s;
  };
  const txs = new Set();
  let liquidations = 0;
  for (const d of head) {
    const s = stateOf(d.market);
    const supD = d.kind === "mint" ? d.amount : d.kind === "redeem" ? -d.amount : 0n;
    const mtD =
      d.kind === "mint" || d.kind === "transfer_in"
        ? d.mTokens
        : d.kind === "redeem" || d.kind === "transfer_out"
          ? -d.mTokens
          : 0n;
    s.supS += supD;
    if (s.supS < s.supMin) s.supMin = s.supS;
    s.supB = s.supS - (s.supMin < 0n ? s.supMin : 0n);
    if (s.supB > s.supPeak) s.supPeak = s.supB;
    s.mtS += mtD;
    if (s.mtS < s.mtMin) s.mtMin = s.mtS;
    s.mtB = s.mtS - (s.mtMin < 0n ? s.mtMin : 0n);
    if (d.kind === "borrow" || d.kind === "repay") {
      s.debt = d.accountBorrows;
      if (d.accountBorrows > s.peakDebt) s.peakDebt = d.accountBorrows;
    }
    if (d.kind === "mint") s.lt.supplied += d.amount;
    else if (d.kind === "redeem") s.lt.withdrawn += d.amount;
    else if (d.kind === "borrow") s.lt.borrowed += d.amount;
    else if (d.kind === "repay") s.lt.repaid += d.amount;
    else if (d.kind === "liquidation") {
      s.lt.liquidatedDebt += d.amount;
      liquidations++;
    }
    if (d.kind !== "liquidation") txs.add(`${d.blockNumber}:${d.txIndex}`);
  }
  const first = head[0];
  const last = head[head.length - 1];
  return {
    events: head.length,
    txCount: txs.size,
    liquidations,
    firstBlock: first.blockNumber,
    firstTimestamp: timestamps.get(first.blockNumber),
    lastBlock: last.blockNumber,
    lastTimestamp: timestamps.get(last.blockNumber),
    markets: [...per].map(([market, s]) => ({
      market,
      debtRaw: s.debt,
      peakDebtRaw: s.peakDebt,
      supplyRaw: s.supB,
      peakSupplyRaw: s.supPeak,
      mTokensRaw: s.mtB,
      lifetime: { ...s.lt },
    })),
  };
}

const byMarket = (list) => JSON.stringify([...list].sort((a, b) => (a.market < b.market ? -1 : 1)));

function checkSeededReplay(name, { decoded, whole }) {
  const rows = decoded.rows;
  console.log(`\n${name} — seed + tail through replayMoonwellRows`);
  // Cut at a BLOCK boundary about two thirds in.
  let cut = Math.floor((rows.length * 2) / 3);
  while (cut < rows.length && rows[cut].blockNumber === rows[cut - 1].blockNumber) cut++;
  const head = rows.slice(0, cut);
  const tail = rows.slice(cut);
  const seedExact = seedOf(head, decoded.timestamps);
  const seed = PERTURB
    ? {
        ...seedExact,
        markets: seedExact.markets.map((m, i) =>
          i === 0
            ? { ...m, supplyRaw: m.supplyRaw + 1n, lifetime: { ...m.lifetime, supplied: m.lifetime.supplied + 1n } }
            : m,
        ),
      }
    : seedExact;
  if (PERTURB) console.log(`      --perturb: ${seed.markets[0].market.slice(0, 10)}… supply +1 wei, supplied +1 wei`);
  const tailDecoded = { rows: tail, timestamps: decoded.timestamps };
  const seeded = replay(tailDecoded, tail.length, { seed });
  const wholeDrawn = replay(decoded, tail.length);

  assert(byMarket(seeded.positions) === byMarket(whole.positions), "every position, field for field (by market)");
  for (const w of whole.positions) {
    const s = seeded.positions.find((x) => x.market === w.market);
    const id = w.symbol;
    assert(s != null, `${id}: the seeded replay has the market`);
    if (!s) continue;
    assert(s.supplyPrincipalRaw === w.supplyPrincipalRaw, `${id}: supplyPrincipalRaw === (${s.supplyPrincipalRaw})`);
    assert(s.mTokensRaw === w.mTokensRaw, `${id}: mTokensRaw === (${s.mTokensRaw})`);
    assert(s.debtRaw === w.debtRaw, `${id}: debtRaw === (${s.debtRaw})`);
    assert(
      s.peakSupplyPrincipalRaw === w.peakSupplyPrincipalRaw,
      `${id}: peakSupplyPrincipalRaw === (${s.peakSupplyPrincipalRaw})`,
    );
    assert(s.peakDebtRaw === w.peakDebtRaw, `${id}: peakDebtRaw === (${s.peakDebtRaw})`);
  }
  assert(seeded.txCount === whole.txCount, `txCount (${seeded.txCount} vs ${whole.txCount})`);
  assert(seeded.totalEvents === whole.totalEvents, `totalEvents (${seeded.totalEvents} vs ${whole.totalEvents})`);
  assert(
    seeded.liquidationCount === whole.liquidationCount,
    `liquidationCount (${seeded.liquidationCount} vs ${whole.liquidationCount})`,
  );
  assert(
    seeded.coverage.firstEventAt === whole.coverage.firstEventAt && seeded.lastActivityAt === whole.lastActivityAt,
    "firstEventAt / lastActivityAt from the seed and the tail",
  );
  assert(byMarket(seeded.lifetimeRaw) === byMarket(whole.lifetimeRaw), "every lifetime leg, raw ===");
  assert(byMarket(seeded.lifetime) === byMarket(whole.lifetime), "the scaled lifetime, bit for bit");
  // The drawn rows: the whole replay drawn to the same depth anchors the
  // wallet's own rows below its cut, so its list is compared past the cut.
  // `context.data.isOpen` is `idx === 0` of the DRAWN list in the card builder
  // (lib/sources/api/moonwell-timeline.ts) — a property of the list, not of
  // the position, no Moonwell card reads it, and it already differs between
  // a whole page and a windowed one — so it is set aside here.
  const tailTxs = new Set(tail.map((d) => d.txHash));
  const sansOpen = (e) =>
    JSON.stringify({ ...e, context: { ...e.context, data: { ...e.context.data, isOpen: undefined } } });
  const afterCut = wholeDrawn.events.filter((e) => tailTxs.has(e.txHash));
  const firstDiff = seeded.events.findIndex((e, i) => sansOpen(e) !== sansOpen(afterCut[i] ?? {}));
  assert(
    seeded.events.length === afterCut.length && firstDiff === -1,
    `the drawn events are the whole list's own cards after the cut (${afterCut.length} from ${tail.length} rows), running balances included` +
      (firstDiff >= 0
        ? `\n        first difference at ${firstDiff}:\n        seeded ${JSON.stringify(seeded.events[firstDiff])}\n        whole  ${JSON.stringify(afterCut[firstDiff])}`
        : seeded.events.length !== afterCut.length
          ? ` — ${seeded.events.length} vs ${afterCut.length}`
          : ""),
  );
  assert(
    seeded.coverage.omitted?.count === cut &&
      seeded.coverage.omitted?.upToBlock === head[head.length - 1].blockNumber &&
      !("anchored" in seeded.coverage.omitted),
    `coverage.omitted counts the ${cut} seeded rows up to the seed's last block, without the anchored licence`,
  );
  assert(
    !("omitted" in wholeDrawn.coverage) || wholeDrawn.coverage.omitted.anchored != null,
    "the unseeded replay still states its anchored licence",
  );

  // 4. The horizon path did not move: debt-only seeds, nothing else counted.
  const debtSeeds = seedExact.markets
    .filter((m) => m.peakDebtRaw > 0n)
    .map((m) => ({ market: m.market, debtRaw: m.debtRaw, peakDebtRaw: m.peakDebtRaw }));
  const horizon = replay(tailDecoded, tail.length, { seeds: debtSeeds });
  assert(
    whole.positions.every((w) => {
      const h = horizon.positions.find((x) => x.market === w.market);
      return h && h.debtRaw === w.debtRaw && h.peakDebtRaw === w.peakDebtRaw;
    }),
    "horizon: the debt lane lands where the whole replay lands",
  );
  assert(
    horizon.totalEvents === tail.length &&
      horizon.coverage.omitted === undefined &&
      horizon.coverage.firstEventAt === decoded.timestamps.get(tail[0].blockNumber),
    "horizon: counts only the tail, omits nothing, dates from the tail's first row",
  );
  // A seed with nothing before the cut is the whole history as a tail.
  const empty = replay(decoded, rows.length, {
    seed: {
      events: 0,
      txCount: 0,
      liquidations: 0,
      firstBlock: 0,
      firstTimestamp: 0,
      lastBlock: 0,
      lastTimestamp: 0,
      markets: [],
    },
  });
  assert(JSON.stringify(empty) === JSON.stringify(whole), "a seed with events = 0 replays exactly as no seed");
}

const h = checkHistory("hand-built history", hand, { absolute: 1e-9 });
const r = checkHistory("pseudo-random history", random, { relative: 1e-9 });
{
  // The fixture's own claims — that the rules were actually exercised.
  const kinds = new Map();
  for (const d of h.decoded.rows) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
  assert(
    hand.length === h.decoded.rows.length + 3,
    "the hand-built decode dropped the doubled pair and the two Redeem/Mint legs",
  );
  assert(
    kinds.get("transfer_out") === 5 && kinds.get("transfer_in") === 1,
    "the protocol's cut of both seizes was kept and the plain companions dropped",
  );
  // The carve-out: USDC saw one voluntary repayment (150.5) and one
  // liquidation whose RepayBorrow leg (251.123456) also landed in `repaid`.
  const usdc = h.whole.lifetimeRaw.find((f) => f.market === "usdc");
  assert(
    usdc.repaid === String(U("150.5")) && usdc.liquidatedDebt === String(U("251.123456")),
    "USDC repaid keeps only the voluntary repayment after the carve-out",
  );
}
checkSeededReplay("hand-built history", h);
checkSeededReplay("pseudo-random history", r);

console.log(`\n${checks} checks, ${failures} failed${PERTURB ? " (--perturb: a red run is the pass)" : ""}`);
process.exit(failures > 0 ? 1 : 0);
