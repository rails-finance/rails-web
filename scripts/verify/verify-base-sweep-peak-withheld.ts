// A wallet the server flags as plumbing states no peak on the Base SWEEP path too.
// Run: `npx tsx --experimental-test-module-mocks --test scripts/verify/verify-base-sweep-peak-withheld.ts`
// ----------------------------------------------------------------------------
// OFFLINE. No chain endpoint and no API is contacted: `lib/sources/chain/rpc`
// is replaced by a fake client that answers from the fixture logs below, and
// `fetch` is replaced by a fake index. Run it anywhere, with no .env.local.
//
// What is under test is the fallback in the four Base timeline routes
// (app/api/chain/{compound-base,aave-v3-base,seamless,moonwell-base}/timeline):
// when the index answers but cannot vouch for the whole history, the route
// sweeps the chain, and the sweep's replay must honour the plumbing flag the
// index answer named (`peakWithheld` / `peakWithheldMarkets`, rails-server
// 1fcf255), as the index replay does (web ea269ca7). rails-ops decision 0024,
// amendment 2026-09-21.
//
// Each lane runs twice over the same fixture: once with the index naming the
// flag, once without. The unflagged run is the control — it proves the fixture
// produces a peak, so a zero on the flagged run is the flag and not an empty
// replay. The index answers `coverage: null` on both, which is "not whole", so
// both runs reach the sweep; `source: "sweep"` on the response confirms it.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodeAbiParameters, encodeEventTopics, parseAbi, toEventSelector } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = "0x00000000000000000000000000000000000c0ffe";
const OTHER = "0x000000000000000000000000000000000000beef";
const TX = `0x${"ab".repeat(32)}`;

interface FakeLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

// ── The fake chain ─────────────────────────────────────────────────────────
// Per lane, the fixture sets these; the fake client reads them.
let HEAD = 0;
let LOGS: FakeLog[] = [];
let RECEIPT_LOGS: FakeLog[] = [];
let RESERVES: { asset: string; aToken: string }[] = [];
let MTOKENS: { mtoken: string; underlying: string }[] = [];
let rpcCalls = 0;

const topicMatches = (want: string | string[] | null | undefined, got: string | undefined): boolean => {
  if (want == null) return true;
  const g = (got ?? "").toLowerCase();
  return Array.isArray(want) ? want.some((w) => w.toLowerCase() === g) : want.toLowerCase() === g;
};

const fakeClient = {
  getBlockNumber: async () => {
    rpcCalls++;
    return BigInt(HEAD);
  },
  request: async ({ method, params }: { method: string; params: [Record<string, unknown>] }) => {
    rpcCalls++;
    if (method !== "eth_getLogs") throw new Error(`fake client: unexpected ${method}`);
    const f = params[0] as { address?: string | string[]; topics: (string | string[] | null)[] };
    const addrs =
      f.address == null ? null : (Array.isArray(f.address) ? f.address : [f.address]).map((a) => a.toLowerCase());
    return LOGS.filter(
      (l) =>
        (addrs == null || addrs.includes(l.address.toLowerCase())) &&
        f.topics.every((t, i) => topicMatches(t, l.topics[i])),
    );
  },
  getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
    rpcCalls++;
    return { number: blockNumber, timestamp: BigInt(1_750_000_000) };
  },
  getTransaction: async () => {
    rpcCalls++;
    return { from: W };
  },
  getTransactionReceipt: async () => {
    rpcCalls++;
    return {
      from: W,
      logs: RECEIPT_LOGS.map((l) => ({
        ...l,
        logIndex: Number(l.logIndex),
        transactionIndex: Number(l.transactionIndex),
        blockNumber: BigInt(l.blockNumber),
      })),
    };
  },
  readContract: async ({ functionName }: { functionName: string }) => {
    rpcCalls++;
    if (functionName === "getReservesList") return RESERVES.map((r) => r.asset);
    if (functionName === "getAllMarkets") return MTOKENS.map((m) => m.mtoken);
    if (functionName === "oracle" || functionName === "rewardDistributor") return OTHER;
    throw new Error(`fake client: unexpected readContract ${functionName}`);
  },
  multicall: async ({ contracts }: { contracts: { address: string; functionName: string; args?: unknown[] }[] }) => {
    rpcCalls++;
    return contracts.map((c) => {
      switch (c.functionName) {
        case "symbol":
          return { status: "success", result: "TKN" };
        case "decimals":
          return { status: "success", result: 6 };
        case "getReserveData": {
          const r = RESERVES.find((x) => x.asset.toLowerCase() === String(c.args?.[0]).toLowerCase());
          return r ? { status: "success", result: { aTokenAddress: r.aToken } } : { status: "failure" };
        }
        case "underlying": {
          const m = MTOKENS.find((x) => x.mtoken.toLowerCase() === c.address.toLowerCase());
          return m ? { status: "success", result: m.underlying } : { status: "failure" };
        }
        default:
          return { status: "failure", error: new Error(`fake client: ${c.functionName}`) };
      }
    });
  },
};

mock.module(pathToFileURL(path.join(ROOT, "lib/sources/chain/rpc.ts")).href, {
  namedExports: {
    chainClient: () => fakeClient,
    alchemyClient: () => fakeClient,
    chainBatchClient: () => fakeClient,
    chainLogsClient: () => fakeClient,
    isRateLimited: () => false,
  },
});

// ── The fake index ─────────────────────────────────────────────────────────
// Answers every /timeline read with no rows and no coverage row — "not whole",
// so the route falls back to the sweep — carrying the flag this run sets.
let INDEX_FLAG: { peakWithheld?: "plumbing" | null; peakWithheldMarkets?: string[] } = {};
process.env.RAILS_API_URL = "http://index.invalid";
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  if (!u.startsWith("http://index.invalid/")) throw new Error(`fake fetch: unexpected ${u}`);
  return new Response(
    JSON.stringify({
      wallet: W,
      rows: [],
      totalEvents: 0,
      truncated: false,
      transfersCaptured: true,
      coverage: null,
      router: OTHER,
      ...INDEX_FLAG,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

const hex = (n: number) => `0x${n.toString(16)}`;
const topicOf = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
const logAt = (block: number, logIndex: number, address: string, topics: string[], data: string): FakeLog => ({
  address,
  topics,
  data,
  blockNumber: hex(block),
  logIndex: hex(logIndex),
  transactionHash: TX,
  transactionIndex: "0x0",
});

async function callRoute(routeFile: string): Promise<Record<string, unknown>> {
  const { NextRequest } = await import("next/server");
  const { GET } = (await import(pathToFileURL(path.join(ROOT, routeFile)).href)) as {
    GET: (r: InstanceType<typeof NextRequest>) => Promise<Response>;
  };
  const res = await GET(new NextRequest(`http://localhost/x?wallet=${W}`));
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(res.status, 200, `route answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Every string value under `key` anywhere in the body — the wire keeps the
 *  replay's peak fields by name, and this does not depend on where. */
function valuesOf(body: unknown, key: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (k === key && (typeof x === "string" || typeof x === "number")) out.push(String(x));
        walk(x);
      }
  };
  walk(body);
  return out;
}

const sourceOf = (body: Record<string, unknown>) => (body.coverage as { source?: string } | undefined)?.source;
const anyPositive = (xs: string[]) => xs.some((x) => BigInt(x) > BigInt(0));

// ── Compound V3 Base: per market ────────────────────────────────────────────
test("Compound V3 Base sweep withholds the peak on a flagged market", async () => {
  const { COMPOUND_BASE_DEPLOYMENT, COMPOUND_BASE_DEPLOY_BLOCK } = await import("@/lib/compound-base/asset-catalog");
  const m = COMPOUND_BASE_DEPLOYMENT.markets[0];
  const abi = parseAbi([
    "event Supply(address indexed from, address indexed dst, uint256 amount)",
    "event Withdraw(address indexed src, address indexed to, uint256 amount)",
  ]);
  const amt = encodeAbiParameters([{ type: "uint256" }], [BigInt(5_000_000_000)]);
  HEAD = COMPOUND_BASE_DEPLOY_BLOCK + 100;
  LOGS = [
    logAt(
      HEAD - 10,
      1,
      m.comet,
      encodeEventTopics({ abi, eventName: "Supply", args: { from: OTHER, dst: W } }) as string[],
      amt,
    ),
    logAt(
      HEAD - 10,
      2,
      m.comet,
      encodeEventTopics({ abi, eventName: "Withdraw", args: { src: W, to: OTHER } }) as string[],
      amt,
    ),
  ];

  INDEX_FLAG = { peakWithheldMarkets: [] };
  const control = await callRoute("app/api/chain/compound-base/timeline/route.ts");
  assert.equal(sourceOf(control), "sweep", "the control run did not reach the sweep");
  assert.ok(anyPositive(valuesOf(control, "lentBaseRaw")), "control: the fixture should replay a peak");

  INDEX_FLAG = { peakWithheldMarkets: [m.key] };
  const flagged = await callRoute("app/api/chain/compound-base/timeline/route.ts");
  assert.equal(sourceOf(flagged), "sweep");
  const peaks = valuesOf(flagged, "lentBaseRaw");
  assert.ok(peaks.length > 0, "flagged: no peak field on the response at all");
  assert.ok(!anyPositive(peaks), `flagged market ${m.key}: the sweep stated a peak ${peaks.join(",")}`);
});

// ── Aave V3 Base and Seamless: per wallet ───────────────────────────────────
const POOL_ABI = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
]);

for (const lane of [
  {
    name: "Aave V3 Base",
    route: "app/api/chain/aave-v3-base/timeline/route.ts",
    catalog: "@/lib/aave-v3-base/asset-catalog",
    pool: "AAVE_V3_BASE_POOL",
    deploy: "AAVE_V3_BASE_DEPLOY_BLOCK",
  },
  {
    name: "Seamless",
    route: "app/api/chain/seamless/timeline/route.ts",
    catalog: "@/lib/seamless/asset-catalog",
    pool: "SEAMLESS_POOL",
    deploy: "SEAMLESS_DEPLOY_BLOCK",
  },
]) {
  test(`${lane.name} sweep withholds the peak on a flagged wallet`, async () => {
    const cat = (await import(lane.catalog)) as Record<string, unknown>;
    const pool = String(cat[lane.pool]);
    const deployBlock = Number(cat[lane.deploy]);
    const reserve = "0x00000000000000000000000000000000000a55e7";
    RESERVES = [{ asset: reserve, aToken: "0x00000000000000000000000000000000000a70c1" }];
    HEAD = deployBlock + 100;
    LOGS = [
      logAt(
        HEAD - 10,
        1,
        pool,
        encodeEventTopics({
          abi: POOL_ABI,
          eventName: "Supply",
          args: { reserve, onBehalfOf: W, referralCode: 0 },
        }) as string[],
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [W, BigInt(7_000_000_000)]),
      ),
      logAt(
        HEAD - 10,
        2,
        pool,
        encodeEventTopics({ abi: POOL_ABI, eventName: "Withdraw", args: { reserve, user: W, to: W } }) as string[],
        encodeAbiParameters([{ type: "uint256" }], [BigInt(7_000_000_000)]),
      ),
    ];

    INDEX_FLAG = { peakWithheld: null };
    const control = await callRoute(lane.route);
    assert.equal(sourceOf(control), "sweep", "the control run did not reach the sweep");
    assert.ok(anyPositive(valuesOf(control, "peakSuppliedRaw")), "control: the fixture should replay a peak");

    INDEX_FLAG = { peakWithheld: "plumbing" };
    const flagged = await callRoute(lane.route);
    assert.equal(sourceOf(flagged), "sweep");
    const peaks = valuesOf(flagged, "peakSuppliedRaw");
    assert.ok(!anyPositive(peaks), `flagged wallet: the sweep stated a peak ${peaks.join(",")}`);
  });
}

// ── Moonwell Base: per wallet ───────────────────────────────────────────────
test("Moonwell Base sweep withholds the peak on a flagged wallet", async () => {
  const { MOONWELL_BASE_DEPLOY_BLOCK, MOONWELL_BASE_REWARD_DISTRIBUTOR } = await import(
    "@/lib/moonwell-base/asset-catalog"
  );
  const mtoken = "0x00000000000000000000000000000000000e7001";
  MTOKENS = [{ mtoken, underlying: "0x00000000000000000000000000000000000e7002" }];
  HEAD = MOONWELL_BASE_DEPLOY_BLOCK + 100;
  // The anchor the sweep finds the transaction by, then the receipt it expands.
  LOGS = [
    logAt(
      HEAD - 10,
      3,
      MOONWELL_BASE_REWARD_DISTRIBUTOR,
      [
        toEventSelector("DisbursedSupplierRewards(address,address,address,uint256)"),
        topicOf(mtoken),
        topicOf(W),
        topicOf(OTHER),
      ],
      encodeAbiParameters([{ type: "uint256" }], [BigInt(1)]),
    ),
  ];
  RECEIPT_LOGS = [
    logAt(
      HEAD - 10,
      1,
      mtoken,
      [toEventSelector("Mint(address,uint256,uint256)")],
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
        [W, BigInt(9_000_000_000), BigInt(450_000_000_000)],
      ),
    ),
  ];

  INDEX_FLAG = { peakWithheld: null };
  const control = await callRoute("app/api/chain/moonwell-base/timeline/route.ts");
  assert.equal(sourceOf(control), "sweep", "the control run did not reach the sweep");
  assert.ok(anyPositive(valuesOf(control, "peakSupplyPrincipalRaw")), "control: the fixture should replay a peak");

  INDEX_FLAG = { peakWithheld: "plumbing" };
  const flagged = await callRoute("app/api/chain/moonwell-base/timeline/route.ts");
  assert.equal(sourceOf(flagged), "sweep");
  const peaks = valuesOf(flagged, "peakSupplyPrincipalRaw");
  assert.ok(peaks.length > 0, "flagged: no peak field on the response at all");
  assert.ok(!anyPositive(peaks), `flagged wallet: the sweep stated a peak ${peaks.join(",")}`);
});

test("the fake client answered the sweeps", () => {
  assert.ok(rpcCalls > 0, "the fake client was never called — the sweep did not run");
});
