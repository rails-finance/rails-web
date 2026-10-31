// The listings' collateral split asks rails-server first (rails-ops
// TO-DO-infra-and-backend.md item 53, stage 1): `readAaveV3NotCollateral` and
// `readSparkNotCollateral` settle the split from
// `/api/at-block/aave-v3/collateral-split` when it answers, and read the Pool
// in a multicall when it cannot: no RAILS_API_URL, a refused connection, a
// non-2xx answer, 3 s without one. After the route fails the chain is read for
// 30 s without asking. Both paths give the same split.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, parseAbi } from "viem";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const API = "https://api.example";
const RPC = "https://rpc.example/v2/test";
process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = API;
process.env.ALCHEMY_URL = RPC;

const { readAaveV3NotCollateral } = await import(ROOT + "lib/sources/chain/aave-v3-position.ts");
const { readSparkNotCollateral } = await import(ROOT + "lib/sources/chain/spark-position.ts");

const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

const CORE = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";
const WALLET = "0x00000000000000000000000000000000000000aa";
// R1: id 0, LT 80%, e-mode category 1 in its word. R2: id 1, LT 0. R3: id 2, LT 75%, switch off.
const R1 = "0x0000000000000000000000000000000000000001";
const R2 = "0x0000000000000000000000000000000000000002";
const R3 = "0x0000000000000000000000000000000000000003";
const CONF = { [R1]: 8000n | (8000n << 16n) | (1n << 168n), [R2]: 0n, [R3]: 7000n | (7500n << 16n) };
const ID = { [R1]: 0, [R2]: 1, [R3]: 2 };
const USER_CONFIG = (1n << 1n) | (1n << 3n);
const SUPPLIED = [R1, R2, R3];
const EXPECTED = [R2, R3];

const ABI = parseAbi([
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const Z = "0x0000000000000000000000000000000000000000";

/** One Multicall3 aggregate3 answered from the Pool above. */
function aggregate(data) {
  const { args } = decodeFunctionData({ abi: multicall3Abi, data });
  const results = args[0].map((c) => {
    const call = decodeFunctionData({ abi: ABI, data: c.callData });
    const a0 = String(call.args[0]).toLowerCase();
    const r = (v) => ({
      success: true,
      returnData: encodeFunctionResult({ abi: ABI, functionName: call.functionName, result: v }),
    });
    if (call.functionName === "getUserConfiguration") return r(USER_CONFIG);
    if (call.functionName === "getUserEMode") return r(0n);
    return r({
      configuration: CONF[a0],
      liquidityIndex: 0n,
      currentLiquidityRate: 0n,
      variableBorrowIndex: 0n,
      currentVariableBorrowRate: 0n,
      currentStableBorrowRate: 0n,
      lastUpdateTimestamp: 0,
      id: ID[a0],
      aTokenAddress: Z,
      stableDebtTokenAddress: Z,
      variableDebtTokenAddress: Z,
      interestRateStrategyAddress: Z,
      accruedToTreasury: 0n,
      unbacked: 0n,
      isolationModeTotalDebt: 0n,
    });
  });
  return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: results });
}

const splitBody = (market) => ({
  market,
  head: { blockNumber: 500, blockTime: 1_760_000_000, readAt: "2026-10-31T12:00:00.000Z", provider: "keyless" },
  accounts: { [WALLET]: { config: String(USER_CONFIG), emodeId: 0 } },
  reserves: Object.fromEntries(SUPPLIED.map((r) => [r, { id: ID[r], configuration: String(CONF[r]) }])),
  emode: {},
});

function stubFetch(api) {
  const seen = { api: [], rpc: 0 };
  test.mock.method(globalThis, "fetch", async (url, init) => {
    const u = String(url);
    if (u.startsWith(API)) {
      seen.api.push(JSON.parse(init.body));
      const r = await api(init);
      if (r === "hang") {
        const keep = setInterval(() => {}, 1_000);
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => {
            clearInterval(keep);
            reject(init.signal.reason);
          });
        });
      }
      return r;
    }
    const body = JSON.parse(init.body);
    const one = (m) => {
      seen.rpc++;
      const result =
        m.method === "eth_call" ? aggregate(m.params[0].data) : m.method === "eth_chainId" ? "0x1" : "0x64";
      return { jsonrpc: "2.0", id: m.id, result };
    };
    const answer = Array.isArray(body) ? body.map(one) : one(body);
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  });
  return seen;
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test.beforeEach(() => {
  process.env.RAILS_API_URL = API;
  skew += 120_000;
});
test.afterEach(() => test.mock.restoreAll());

const aave = () => readAaveV3NotCollateral([{ wallet: WALLET, pool: CORE, supplied: SUPPLIED }], 1);
const spark = () => readSparkNotCollateral([{ wallet: WALLET, supplied: SUPPLIED }]);
const sorted = (s) => [...(s ?? [])].sort();

test("split: the route's inputs settle the split, and the chain is not read", async () => {
  const seen = stubFetch(async (init) => json(splitBody(JSON.parse(init.body).market)));
  assert.deepEqual(sorted((await aave()).get(`${CORE}:${WALLET}`)), EXPECTED);
  assert.deepEqual(sorted((await spark()).get(WALLET)), EXPECTED);
  assert.equal(seen.rpc, 0);
  assert.deepEqual(seen.api[0], { market: "core", wallets: [{ wallet: WALLET, supplied: SUPPLIED }] });
  assert.equal(seen.api[1].market, "spark");
});

test("split: a 502 reads the chain to the same split, and the route is not asked for 30 s", async () => {
  const seen = stubFetch(async () => json({ error: "proxy_error" }, 502));
  assert.deepEqual(sorted((await aave()).get(`${CORE}:${WALLET}`)), EXPECTED);
  assert.deepEqual(sorted((await spark()).get(WALLET)), EXPECTED);
  assert.equal(seen.api.length, 1, "the second reader found the route down");
  assert.ok(seen.rpc > 0);
});

test("split: a refused connection reads the chain", async () => {
  const seen = stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(sorted((await aave()).get(`${CORE}:${WALLET}`)), EXPECTED);
  assert.ok(seen.rpc > 0);
});

test("split: a route slower than 3 s reads the chain", async () => {
  const seen = stubFetch(async () => "hang");
  const t0 = Date.now();
  assert.deepEqual(sorted((await spark()).get(WALLET)), EXPECTED);
  const ms = Date.now() - t0;
  assert.ok(ms >= 2_900 && ms < 5_000, `fell back after ${ms} ms`);
  assert.ok(seen.rpc > 0);
});

test("split: a 400 refuses that request and the chain answers; no RAILS_API_URL reads the chain", async () => {
  const seen = stubFetch(async () => json({ error: "bad_request" }, 400));
  assert.deepEqual(sorted((await aave()).get(`${CORE}:${WALLET}`)), EXPECTED);
  assert.deepEqual(sorted((await aave()).get(`${CORE}:${WALLET}`)), EXPECTED);
  assert.equal(seen.api.length, 2, "a 400 is not the route down");
  delete process.env.RAILS_API_URL;
  const before = seen.api.length;
  assert.deepEqual(sorted((await spark()).get(WALLET)), EXPECTED);
  assert.equal(seen.api.length, before);
});
