// The api-first head clients' failure paths (rails-ops TO-DO-infra-and-backend.md
// item 53, stages 7 and 8, and Sky's drip): `headReadsClient`, `vaultHeadClient`
// and `readSkyDrip` read the
// chain whenever rails-server cannot answer — no RAILS_API_URL, a refused
// connection, a non-2xx answer, a head slower than 3 s, a block the api did
// not name — and, after the route fails, read the chain for 30 s without
// asking it. A refusal of one request (409, 400) is not the route down.
// A block any read left for the chain carries no rails-server stamp, so its
// receipts keep "@ head".
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as arbitrum-over-budget.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

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

const { headReadsClient } = await import(ROOT + "lib/sources/api/head-reads-client.ts");
const { vaultHeadClient } = await import(ROOT + "lib/sources/api/vault-head-client.ts");
const { readSkyDrip } = await import(ROOT + "lib/sources/chain/sky-savings-drip.ts");

// Each test starts two minutes after the last: past the 30 s down window, the
// 5 s head reuse and the 90 s a named block is read at the api.
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
const { serverHeadStampAt } = await import(ROOT + "lib/sources/api/server-head-stamps.ts");

const ERC20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];
const TOKEN = "0x6b175474e89094c44da98b954eedeac495271d0f";
const HOLDER = "0x000000000000000000000000000000000000dead";
const read = (blockNumber) => ({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [HOLDER], blockNumber });
const word = (n) => "0x" + n.toString(16).padStart(64, "0");

/** The chain answers 7 to every eth_call and names block 100; the api answers 42. */
const CHAIN_HEAD = 100n;
const SERVER_HEAD = 500;
const headBody = (block = SERVER_HEAD) => ({
  blockNumber: block,
  blockTimestamp: 1_760_000_000,
  head: { blockTime: 1_760_000_000, readAt: "2026-10-31T12:00:00.000Z", provider: "keyless" },
});

/**
 * Replaces global fetch. `api(path, init)` answers rails-server's requests (a
 * Response, a thrown error, or "hang" to wait for the abort); the chain's
 * JSON-RPC requests are answered here and recorded as [method, blockParam].
 */
function stubFetch(api) {
  const seen = { api: [], rpc: [] };
  test.mock.method(globalThis, "fetch", async (url, init) => {
    const u = String(url);
    if (u.startsWith(API)) {
      const p = u.slice(API.length);
      seen.api.push(p);
      const r = await api(p, init);
      if (r === "hang") {
        // AbortSignal.timeout's timer does not hold the event loop open.
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
      seen.rpc.push([
        m.method,
        m.method === "eth_call" ? m.params[1] : m.method === "eth_getCode" ? m.params[1] : null,
      ]);
      const result =
        m.method === "eth_blockNumber"
          ? "0x" + CHAIN_HEAD.toString(16)
          : m.method === "eth_chainId"
            ? "0x1"
            : m.method === "eth_call"
              ? word(7)
              : m.method === "eth_getCode"
                ? "0x6001"
                : null;
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
test.afterEach(() => {
  test.mock.restoreAll();
});

// ── headReadsClient ─────────────────────────────────────────────────────────

test("head reads: the api's block and answers when it answers", async () => {
  const seen = stubFetch(async (p, init) => {
    if (p.startsWith("/api/at-block/head/block")) return json(headBody());
    const { reads } = JSON.parse(init.body);
    return json({ blockNumber: SERVER_HEAD, answers: reads.map(() => ({ success: true, returnData: word(42) })) });
  });
  const c = headReadsClient(1);
  assert.equal(await c.getBlockNumber(), BigInt(SERVER_HEAD));
  assert.equal(await c.readContract(read()), 42n);
  assert.deepEqual(seen.rpc, []);
  assert.equal(serverHeadStampAt(1, SERVER_HEAD)?.provider, "keyless");
});

test("head reads: a refused connection reads the chain, and the api is not asked for 30 s", async () => {
  const seen = stubFetch(async () => {
    throw new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
  });
  const c = headReadsClient(1);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(await c.readContract(read()), 7n);
  assert.equal(await c.readContract(read()), 7n);
  assert.equal(seen.api.length, 1);
  assert.ok(seen.rpc.some(([m]) => m === "eth_call"));
});

test("head reads: a non-2xx head reads the chain and marks the route down", async () => {
  const seen = stubFetch(async () => json({ error: "proxy_error" }, 502));
  const c = headReadsClient(1);
  assert.equal(await c.readContract(read()), 7n);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(seen.api.length, 1);
});

test("head reads: a head slower than 3 s reads the chain", async () => {
  const seen = stubFetch(async () => "hang");
  const c = headReadsClient(1);
  const t0 = Date.now();
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  const ms = Date.now() - t0;
  assert.ok(ms >= 2_900 && ms < 5_000, `fell back after ${ms} ms`);
  assert.equal(await c.readContract(read()), 7n);
  assert.equal(seen.api.length, 1);
});

test("head reads: a round the api refuses (409) reads the chain at the same block and keeps asking", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/head/block") ? json(headBody()) : json({ error: "block_not_named" }, 409),
  );
  const c = headReadsClient(1);
  assert.equal(await c.readContract(read()), 7n);
  assert.deepEqual(
    seen.rpc.filter(([m]) => m === "eth_call"),
    [["eth_call", "0x1f4"]],
  );
  assert.equal(serverHeadStampAt(1, SERVER_HEAD), undefined, "a block the chain read keeps @ head");
  await c.readContract(read());
  assert.equal(seen.api.filter((p) => p.startsWith("/api/at-block/head/reads")).length, 2);
});

test("head reads: a failed round (502) reads the chain at the same block, then the chain for 30 s", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/head/block") ? json(headBody()) : json({ error: "proxy_error" }, 502),
  );
  const c = headReadsClient(1);
  assert.equal(await c.readContract(read()), 7n);
  assert.deepEqual(
    seen.rpc.filter(([m]) => m === "eth_call"),
    [["eth_call", "0x1f4"]],
  );
  skew += 5_100; // past the head's 5 s reuse
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(seen.api.length, 2);
});

test("head reads: a block the api did not name is the chain's, at that block", async () => {
  const seen = stubFetch(async () => json(headBody()));
  const c = headReadsClient(1);
  assert.equal(await c.readContract(read(123n)), 7n);
  assert.deepEqual(seen.api, []);
  assert.deepEqual(seen.rpc, [["eth_call", "0x7b"]]);
});

test("head reads: no RAILS_API_URL reads the chain", async () => {
  delete process.env.RAILS_API_URL;
  const seen = stubFetch(async () => json(headBody()));
  const c = headReadsClient(1);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(await c.readContract(read()), 7n);
  assert.deepEqual(seen.api, []);
});

// ── vaultHeadClient ─────────────────────────────────────────────────────────

test("vault reads: a named block's code from the api; an unnamed block's from the chain", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/vault/head")
      ? json(headBody())
      : json({ blockNumber: SERVER_HEAD, answers: [{ hex: "0xfe" }] }),
  );
  const c = vaultHeadClient(1);
  const b = await c.getBlockNumber();
  assert.equal(b, BigInt(SERVER_HEAD));
  assert.equal(await c.getCode({ address: TOKEN, blockNumber: b }), "0xfe");
  assert.equal(await c.getCode({ address: TOKEN, blockNumber: 123n }), "0x6001");
  assert.deepEqual(seen.rpc, [["eth_getCode", "0x7b"]]);
});

test("vault reads: a refused connection reads the chain, and the api is not asked for 30 s", async () => {
  const seen = stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  const c = vaultHeadClient(1);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(seen.api.length, 1);
});

test("vault reads: a failed round reads the chain at the same block and marks the route down", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/vault/head") ? json(headBody()) : json({ error: "proxy_error" }, 502),
  );
  const c = vaultHeadClient(1);
  const b = await c.getBlockNumber();
  assert.equal(await c.getCode({ address: TOKEN, blockNumber: b }), "0x6001");
  assert.deepEqual(seen.rpc, [["eth_getCode", "0x1f4"]]);
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  assert.equal(seen.api.length, 2);
});

test("vault reads: a refused round (409) is not the route down", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/vault/head") ? json(headBody()) : json({ error: "block_not_named" }, 409),
  );
  const c = vaultHeadClient(1);
  const b = await c.getBlockNumber();
  assert.equal(await c.getCode({ address: TOKEN, blockNumber: b }), "0x6001");
  assert.equal(await c.getBlockNumber(), BigInt(SERVER_HEAD));
  assert.equal(seen.api.length, 3);
});

test("vault reads: a head slower than 3 s reads the chain", async () => {
  stubFetch(async () => "hang");
  const c = vaultHeadClient(1);
  const t0 = Date.now();
  assert.equal(await c.getBlockNumber(), CHAIN_HEAD);
  const ms = Date.now() - t0;
  assert.ok(ms >= 2_900 && ms < 5_000, `fell back after ${ms} ms`);
});

test("vault reads: no RAILS_API_URL reads the chain", async () => {
  delete process.env.RAILS_API_URL;
  const seen = stubFetch(async () => json(headBody()));
  assert.equal(await vaultHeadClient(1).getBlockNumber(), CHAIN_HEAD);
  assert.deepEqual(seen.api, []);
});

// ── readSkyDrip (the at-block store's chi and rho, census W-SK1) ─────────────

const DRIP_BLOCK = 23_000_000;

test("sky drip: rails-server's chi and rho when it answers, and no chain read", async () => {
  const seen = stubFetch(async (p) =>
    p.startsWith("/api/at-block/sky-savings/drip")
      ? json({ block: DRIP_BLOCK, chi: "1071234567890123456789012345", rho: 1_761_000_000 })
      : json({}, 404),
  );
  assert.deepEqual(await readSkyDrip(DRIP_BLOCK), {
    chi: "1071234567890123456789012345",
    rho: 1_761_000_000,
    readBy: "rails-server",
  });
  assert.deepEqual(seen.api, [`/api/at-block/sky-savings/drip?block=${DRIP_BLOCK}`]);
  assert.deepEqual(seen.rpc, []);
});

test("sky drip: a failed route (502) reads the chain at the block, then the chain for 30 s", async () => {
  const seen = stubFetch(async () => json({ error: "Failed" }, 502));
  assert.deepEqual(await readSkyDrip(DRIP_BLOCK), { chi: "7", rho: 7, readBy: "chain" });
  assert.ok(seen.rpc.every(([m, b]) => m !== "eth_call" || b === "0x" + DRIP_BLOCK.toString(16)));
  await readSkyDrip(DRIP_BLOCK);
  assert.equal(seen.api.length, 1, "down for 30 s after a 5xx");
});

test("sky drip: an answer for another block, a refused connection or no RAILS_API_URL reads the chain", async () => {
  let seen = stubFetch(async () => json({ block: DRIP_BLOCK + 1, chi: "1", rho: 1 }));
  assert.equal((await readSkyDrip(DRIP_BLOCK))?.readBy, "chain");
  test.mock.restoreAll();
  skew += 120_000;
  seen = stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal((await readSkyDrip(DRIP_BLOCK))?.readBy, "chain");
  test.mock.restoreAll();
  skew += 120_000;
  delete process.env.RAILS_API_URL;
  seen = stubFetch(async () => json({ block: DRIP_BLOCK, chi: "1", rho: 1 }));
  assert.equal((await readSkyDrip(DRIP_BLOCK))?.readBy, "chain");
  assert.equal(seen.api.length, 0);
});
