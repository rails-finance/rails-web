// One cap on every request the wallet page makes to the api host (lib/wallet/api-hop.ts, rails-ops
// ui-jobs 814): the summary and listing reads, every family's head read (route-gate.ts and the
// families' fetches), the families read at visit and the Liquidity section share one queue of
// API_CONCURRENCY. A many-family wallet read, with every visit module launched and the Liquidity
// section beside it, holds the api host to that many requests at once and finishes every request;
// a route-gate request frees its slot before the caller's chain read and is not retried; its wait
// runs from the slot. The backend and the chains are a stubbed fetch: the chains refuse every call,
// so each chain fallback runs and fails fast. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";
for (const v of [
  "ALCHEMY_URL",
  "BASE_RPC_URL",
  "ARBITRUM_RPC_URL",
  "OPTIMISM_RPC_URL",
  "ARC_RPC_URL",
  "SEPOLIA_RPC_URL",
])
  process.env[v] = "http://rpc.test";
// The modules log each refused chain call and missing route; the assertions say what matters.
console.error = console.warn = () => {};

const W = "0xb32cb14f2a5b17d1f1343749e302316be5133321";
const W2 = "0x1111111111111111111111111111111111111111";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const BASE_WETH = "0x4200000000000000000000000000000000000006";

// ── Each family's stored card, enough for its shaping to reach its head read ──

const PARAMS = `(Address(${USDC}), Address(${WSTETH}), Address(0x48f7e36eb6b826b2df4b2e630b62cd25e89e40e2), Address(0x870ac11d48b15db9a138cf899d20f13f79ba00bc), Uint(860000000000000000, 256))`;
const life = {
  lastActivityAt: 1790000000,
  lastBlockNumber: 23000000,
  lastTxHash: null,
  txCount: 2,
  liquidationCount: 0,
  lastLiquidationAt: null,
};
const reserves = [
  { reserve: WETH, supplyBalanceRaw: "1000000000000000000", debtBalanceRaw: "0" },
  { reserve: USDC, supplyBalanceRaw: "0", debtBalanceRaw: "1000000" },
];
const baseReserves = [{ reserve: BASE_WETH, supplyBalanceRaw: "1000000000000000000", debtBalanceRaw: "0" }];
const trove = (collateralType) => ({
  id: "0x1",
  status: "open",
  collateralType,
  owner: W,
  lastOwner: W,
  ownerEns: null,
  debt: { current: 1000, currentRaw: "1000000000000000000000", peak: 1000 },
  collateral: { amount: 1, amountRaw: "1000000000000000000", peakAmount: 1 },
  metrics: { interestRate: 5 },
  activity: { lastActivityAt: 1790000000, transactionCount: 2, redemptionCount: 0, liquidationCount: 0 },
  batch: { isMember: false },
});
const comet = (asset) => ({
  market: "usdc",
  account: W,
  baseFinalRaw: "-1000000",
  status: "open",
  everLiquidated: false,
  collateral: [{ asset, amountRaw: "1000000000000000000" }],
  collateralAssets: 1,
  eventCount: 2,
  firstBlock: 22000000,
  ...life,
});
const MORPHO = {
  market: "b323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
  borrower: W,
  coll_raw: "2000000000000000000",
  borr_raw: "3900000000",
  bsh_raw: "4000000000000000",
  status: "open",
  liquidated: false,
  market_params: PARAMS,
  event_count: "3",
  first_block: "20000000",
  last_block: "21000000",
  last_ts: "1730000000",
  last_tx_hash: null,
  peak_coll_raw: "2000000000000000000",
  peak_borr_raw: "3900000000",
  tx_count: 3,
  bad_debt_raw: null,
};
const CARDS = {
  "aave-v3": { wallet: W, market: "core", status: "open", reserves, ...life },
  "aave-v3-base": { wallet: W, market: "base", status: "open", reserves: baseReserves, ...life },
  spark: { wallet: W, reserves, ...life },
  seamless: { wallet: W, market: "seamless", status: "open", reserves: baseReserves, ...life },
  "compound-v3": comet(WETH),
  "compound-v3-base": comet(BASE_WETH),
  "compound-v2": {
    wallet: W,
    status: "open",
    everLiquidated: false,
    markets: [
      {
        market: "0x39aa39c021dfbae8fac545936693ac917d5e7563",
        supplyPrincipalRaw: "100000000",
        ctokenBalanceRaw: "5000000000",
        debtBalanceRaw: "0",
      },
    ],
    ...life,
  },
  moonwell: {
    wallet: W,
    status: "open",
    markets: [
      {
        market: "weth",
        supplyPrincipalRaw: "1000000000000000000",
        mtokenBalanceRaw: "5000000000",
        debtBalanceRaw: "0",
      },
    ],
    ...life,
  },
  "moonwell-base": {
    wallet: W,
    status: "open",
    markets: [
      {
        market: "0x628ff693426583d9a7fb391e54366292f509d457",
        supplyPrincipalRaw: "1000000000000000000",
        mtokenBalanceRaw: "5000000000",
        debtBalanceRaw: "0",
      },
    ],
    ...life,
  },
  dolomite: {
    owner: W,
    accountNumber: "0",
    isDolomiteBalance: false,
    status: "open",
    everLiquidated: false,
    supplyMarketCount: 1,
    borrowMarketCount: 0,
    balances: [{ marketId: 0, symbol: "WETH", decimals: 18, parRaw: "1000000000000000000" }],
    eventCount: 2,
    ...life,
  },
  maple: {
    wallet: W,
    status: "open",
    inQueue: false,
    pools: [
      {
        pool: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
        sharesBalanceRaw: "1000000",
        escrowedSharesRaw: "0",
        depositedPrincipalRaw: "1000000",
        lifetimeDepositedRaw: "1000000",
        lifetimeWithdrawnRaw: "0",
        requestCount: 0,
      },
    ],
    firstActivityAt: 1780000000,
    requestCount: 0,
    ...life,
  },
  "liquity-v2": { ...trove("WETH"), interestBatchManager: null },
  ebisu: trove("WEETH"),
  asymmetry: trove("WETH"),
  basedollar: trove("WETH"),
  llamalend: {
    controller: "0xeda215b7666936ded834f76f3fbc6f323295110a",
    user: W,
    market: {
      version: 1,
      factory: "0xea6876dde9e3467564acbee1ed5bac88783205e0",
      factoryIndex: 0,
      amm: "0xe0438eb3703bf871e31ce639bd351109c88666ea",
      A: 100,
      collateral: { token: WETH, symbol: "WETH", decimals: 18 },
      borrowed: { token: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e", symbol: "crvUSD", decimals: 18 },
    },
    status: "open",
    isOpen: true,
    everLiquidated: false,
    collateralRaw: "1000000000000000000",
    borrowedRaw: "0",
    debtRaw: "1000000000000000000000",
    n1: 1,
    n2: 4,
    stateBlock: 23000000,
    snapshotBlock: 23000000,
    eventCount: 2,
    selfLiquidationCount: 0,
    firstActivityAt: 1780000000,
    ...life,
  },
  fx: {
    pool_key: "wsteth",
    position: "7",
    opened_block: "22000000",
    opened_ts: "1780000000",
    opened_by: W,
    last_event_block: "23000000",
    last_event_ts: "1790000000",
    n_operates: 2,
    n_liquidations: 0,
    ever_liquidated: false,
    implied_debt: "1000000000000000000000",
    coll_in_token: "1000000000000000000",
    coll_out_token: "0",
    protocol_fees_paid: null,
    gas_wei: null,
    last_tick: null,
    last_snap_price: null,
    last_snap_block: null,
    closed_hint: false,
    chain_raw_colls: null,
    chain_raw_debts: null,
    chain_debt_ratio: null,
    chain_owner: W,
    chain_closed: false,
    chain_block: null,
    pool_oracle_price: null,
    pool_price_block: null,
  },
  frankencoin: {
    position: "0x1111111111111111111111111111111111111112",
    hub_version: "v2",
    owner: W,
    original: null,
    collateral_token: WETH,
    collateral_symbol: "WETH",
    collateral_decimals: 18,
    collateral_raw: "1000000000000000000",
    minted_raw: "1000000000000000000000",
    price_raw: "2000000000000000000000",
    status: "open",
    challenge_count: 0,
    challenge_succeeded_count: 0,
    opened_at: 1780000000,
    last_activity_at: 1790000000,
    last_block_number: 23000000,
    last_tx_hash: null,
    event_count: 2,
    tx_count: 2,
  },
};
const POLARIS = [
  {
    kind: "cdp",
    market: "usdp",
    cdp_id: "1",
    owner: W,
    owner_at_open: W,
    status: "open",
    liquidated: false,
    coll_raw: "1000000000000000000",
    debt_raw: "1000000000000000000000",
    peak_coll_raw: "1000000000000000000",
    peak_debt_raw: "1000000000000000000000",
    sum_accrued_interest_raw: "0",
    sum_stable_gain_raw: "0",
    sum_bc_token_gain_raw: "0",
    first_block: 1,
    first_ts: 1780000000,
    first_tx_hash: null,
    last_block: 2,
    last_ts: 1790000000,
    last_tx_hash: null,
    event_count: 2,
    transfer_count: 0,
    liq_count: 0,
    last_primary_rate: null,
  },
  { kind: "loan", market: "usdp", loan_id: "1" },
  { kind: "sp", market: "usdp", token_id: "1" },
];

const row = (f, positionId, card) => ({
  chain: f.summaryChain,
  family: f.summaryFamily,
  kind: f.summaryKind,
  positionId,
  owner: W,
  market: null,
  status: "open",
  collateral: null,
  debt: null,
  collateralUsd: null,
  debtUsd: null,
  usdSource: null,
  peakCollateral: null,
  peakDebt: null,
  openedAt: null,
  closedAt: null,
  lastActivityAt: null,
  txCount: 2,
  liquidationCount: 0,
  readBlock: 23000000,
  readAt: null,
  href: "/x",
  card,
  writtenAt: "2026-11-24T00:00:00Z",
});

/** One open row a module, six Morpho Ethereum markets and one row of each Polaris kind. The
 *  modules the listing reads feed take no summary row. */
function rowsOf(f, i) {
  if (f.summaryKind || f.id === "liquity-v1") return [];
  if (f.id === "morpho")
    return Array.from({ length: 6 }, (_, k) => {
      const market = MORPHO.market.slice(0, -2) + k.toString(16).padStart(2, "0");
      return row(f, `${market}-${W}`, { ...MORPHO, market });
    });
  if (f.id === "polaris") return POLARIS.map((card, k) => row(f, `polaris-${k}`, card));
  return [row(f, `p${i}`, CARDS[f.id] ?? {})];
}

// ── The stubbed fetch: the api host answers after a pause, the chains refuse ──

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let summaryRows = [];
/** Each api-host request's path, and the counts the cap is read from. */
let api = { paths: [], inFlight: 0, peak: 0, started: 0, ended: 0, aborted: 0 };
let chainCalls = 0;
/** A test's answer for a route, by path; null leaves it to the default. */
let route = () => null;

const rpcRefusal = (body) => {
  const one = (q) => ({ jsonrpc: "2.0", id: q.id, error: { code: -32602, message: "no chain in this test" } });
  const q = JSON.parse(body);
  return json(Array.isArray(q) ? q.map(one) : one(q));
};

function answer(path, init) {
  if (/^\/api\/wallet\/[^/]+\/positions$/.test(path))
    return json({ address: W, rows: summaryRows, total: summaryRows.length, open: summaryRows.length, closed: 0 });
  if (path === "/api/liquity-v1/positions") return json({ rows: [], total: 0, limit: 100, offset: 0 });
  if (/\/(stability-pool|staking)$/.test(path) && !path.startsWith("/api/polaris"))
    return json({ rows: [], pagination: { total: 0 } });
  if (path === "/api/reference/erc20") {
    const { addresses } = JSON.parse(init.body);
    return json({ tokens: {}, missing: addresses });
  }
  return json({ error: "no stub in this test" }, 404);
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.host === "rpc.test") {
    chainCalls++;
    return rpcRefusal(init.body);
  }
  assert.equal(url.host, "box.test", `a request to ${url.host}`);
  api.paths.push(url.pathname);
  api.started++;
  api.inFlight++;
  api.peak = Math.max(api.peak, api.inFlight);
  try {
    await pause(8);
    if (init.signal?.aborted) api.aborted++;
    const stub = await route(url.pathname, init);
    if (stub instanceof Error) throw stub;
    return stub ?? answer(url.pathname, init);
  } finally {
    api.inFlight--;
    api.ended++;
  }
};

const { readWalletUncached, WALLET_FAMILIES } = await import("../../lib/wallet/read-wallet.ts");
const { readWalletLiquidity } = await import("../../lib/wallet/liquidity/read-liquidity.ts");
const { API_CONCURRENCY, apiHop, inWalletRead } = await import("../../lib/wallet/api-hop.ts");
const { routeGate } = await import("../../lib/sources/api/route-gate.ts");
const { protocolForSession } = await import("../../lib/shared/protocols.ts");

const VISIT = ["aave-v3-optimism", "compound-v3-optimism", "morpho-optimism", "morpho-arc"];
const FLAGS = Object.fromEntries(VISIT.map((s) => [s, protocolForSession(s)?.unlaunched === true]));
test.after(() => {
  for (const s of VISIT) {
    if (FLAGS[s]) protocolForSession(s).unlaunched = true;
    else delete protocolForSession(s).unlaunched;
  }
});

const reset = () => {
  api = { paths: [], inFlight: 0, peak: 0, started: 0, ended: 0, aborted: 0 };
  chainCalls = 0;
  route = () => null;
};

test("a many-family wallet read with the Liquidity section beside it holds the api host to four at once", async () => {
  reset();
  assert.equal(API_CONCURRENCY, 4);
  for (const s of VISIT) delete protocolForSession(s).unlaunched;
  summaryRows = WALLET_FAMILIES.flatMap(rowsOf);
  const [read, other, liquidity] = await Promise.all([
    readWalletUncached(W),
    // A second reader's wallet in the same process shares the cap.
    readWalletUncached(W2),
    readWalletLiquidity(W, undefined, Date.now()),
  ]);
  assert.equal(read.error, undefined);
  assert.equal(other.error, undefined);
  assert.equal(api.peak, API_CONCURRENCY, "never more than four at once, and four reached");
  assert.equal(api.ended, api.started, "every request completes");
  assert.equal(api.aborted, 0, "no request runs out its wait in the queue's time");
  assert.ok(chainCalls > 0, "the chain fallbacks ran");
  // Every kind of request the page makes went through the cap.
  const seen = new Set(api.paths);
  for (const p of [
    `/api/wallet/${W}/positions`,
    "/api/liquity-v1/positions",
    "/api/liquity-v1/stability-pool",
    "/api/liquity-v1/staking",
    "/api/liquity-v2/stability-pool",
    "/api/ebisu/stability-pool",
    "/api/reference/erc20",
    "/api/at-block/aave-v3/oracle-prices",
    "/api/at-block/aave-v3/position",
    "/api/at-block/compound/position",
    "/api/at-block/morpho/position",
    "/api/at-block/liquity-fork/state",
    "/api/oracle/liquity-v2",
    "/api/at-block/euler/positions",
    "/api/sky-savings/positions",
    "/api/alchemix/positions",
    "/api/fx/positions",
    "/api/frankencoin/positions",
    "/api/pwn/positions",
    "/api/polaris/positions",
    "/api/polaris/reserve-loans",
    "/api/polaris/stability-pool",
    "/api/vaults/positions",
    "/api/moonwell-base/positions",
    "/api/at-block/aave-v3-optimism/position",
    "/api/at-block/compound-v3-optimism/wallet",
    "/api/at-block/morpho-optimism/wallet",
    "/api/at-block/morpho-arc/wallet",
  ])
    assert.ok(seen.has(p), `${p} was asked`);
  assert.equal(liquidity.sources.length, 11);
  for (const s of liquidity.sources) assert.equal(s.state, "failed", `${s.key} answered 404 and still completed`);
});

test("a route-gate request frees its slot before the caller reads the chain, and is not retried", async () => {
  reset();
  const gate = routeGate();
  const connectionReset = () =>
    Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
    });
  route = (path) => (path === "/api/at-block/test/head" ? connectionReset() : null);
  let inFallback = 0;
  let allIn;
  const allInFallback = new Promise((r) => (allIn = r));
  const probes = [];
  // As many head reads as the cap has slots, each falling back to a stand-in chain read that
  // waits until every one of them is there and then asks the api host once more: the probe
  // gets a slot only where the route's slot was freed before the fallback.
  await inWalletRead(() =>
    Promise.all(
      Array.from({ length: API_CONCURRENCY }, async (_, i) => {
        const served = await gate.json(`k${i}`, "http://box.test/api/at-block/test/head", {});
        assert.equal(served, null);
        inFallback++;
        if (inFallback === API_CONCURRENCY) allIn();
        await allInFallback;
        // A separate request (a fresh wallet read's context), so it queues for a slot even where
        // this call still held one.
        const probe = inWalletRead(() =>
          apiHop(async () => (await fetch("http://box.test/api/at-block/test/probe")).status),
        );
        const late = pause(1000).then(() => "no slot within a second");
        probes.push(await Promise.race([probe, late]));
      }),
    ),
  );
  assert.deepEqual(probes, Array(API_CONCURRENCY).fill(404));
  assert.equal(
    api.paths.filter((p) => p === "/api/at-block/test/head").length,
    API_CONCURRENCY,
    "one try each, no retry",
  );
});

test("a route-gate request's wait runs from when its slot is granted", async () => {
  reset();
  const gate = routeGate();
  route = (path) => (path === "/api/at-block/test/slow" ? json({ ok: true }) : null);
  await inWalletRead(async () => {
    let free;
    const held = new Promise((r) => (free = r));
    // Every slot held for 300 ms; the route's wait is 200 ms.
    const holds = Array.from({ length: API_CONCURRENCY }, () => apiHop(() => held));
    const asked = gate.json("slow", "http://box.test/api/at-block/test/slow", {}, { timeoutMs: 200 });
    await pause(300);
    free();
    await Promise.all(holds);
    assert.deepEqual(await asked, { ok: true });
  });
});

test("outside a wallet read a route-gate request takes no slot", async () => {
  reset();
  const gate = routeGate();
  route = (path) => (path === "/api/at-block/test/explorer" ? json({ ok: true }) : null);
  let free;
  const held = new Promise((r) => (free = r));
  const holds = Array.from({ length: API_CONCURRENCY }, () => apiHop(() => held));
  assert.deepEqual(await gate.json("explorer", "http://box.test/api/at-block/test/explorer", {}), { ok: true });
  free();
  await Promise.all(holds);
});
