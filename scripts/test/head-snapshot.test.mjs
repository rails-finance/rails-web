// lib/sources/api/head-snapshot.ts (ui-jobs 467): a loader rails-server
// answered at one block posts its rounds once, after the response; a run with
// a round missing its id, or any read on the chain, posts nothing; when the
// server and the chain both fail the loader is replayed over the stored
// snapshot, and with no snapshot the caller gets the loader's own answer.
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as head-reads-fallback.test.mjs does.
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
  // Outside a request scope Next's after() throws; the module then runs the POST by itself.
  if (spec === "next/server")
    return { url: "data:text/javascript,export function after() { throw new Error('outside a request'); }", shortCircuit: true };
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const API = "https://api.example";
const RPC = "https://rpc.example/v2/test";
process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = API;
process.env.ALCHEMY_URL = RPC;

const { withHeadSnapshot } = await import(ROOT + "lib/sources/api/head-snapshot.ts");
/** The POST runs past the answer: let it land. */
const headSnapshotPosts = () => new Promise((r) => setTimeout(r, 25));
const { encodeFunctionData } = await import("viem");

// Each test starts two minutes after the last: past every down window, head
// reuse and named-block window.
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

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
const word = (n) => "0x" + n.toString(16).padStart(64, "0");
const DATA = encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [HOLDER] });
// One surface per test: a surface posts at most once a minute.
let n = 0;
let SCOPE;
const SERVER_HEAD = 500;
const headBody = () => ({
  blockNumber: SERVER_HEAD,
  blockTimestamp: 1_760_000_000,
  head: { blockTime: 1_760_000_000, readAt: "2026-10-31T12:00:00.000Z", provider: "keyless" },
});
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The loader under test: the head block and one balance read at it. */
const loader = async (client) => {
  const block = await client.getBlockNumber();
  const balance = await client.readContract({
    address: TOKEN,
    abi: ERC20,
    functionName: "balanceOf",
    args: [HOLDER],
    blockNumber: block,
  });
  return { block: Number(block), balance };
};

/** `api(path, init)` answers rails-server; the chain answers 7, or fails when `chainDown`. */
function stubFetch(api, { chainDown = false } = {}) {
  const seen = { api: [], posts: [], rpc: 0 };
  test.mock.method(globalThis, "fetch", async (url, init) => {
    const u = String(url);
    if (u.startsWith(API)) {
      const p = u.slice(API.length);
      seen.api.push(p);
      if (p === "/api/at-block/head/snapshot" && init?.method === "POST") seen.posts.push(JSON.parse(init.body));
      return api(p, init);
    }
    seen.rpc++;
    if (chainDown) return new Response("down", { status: 503 });
    const body = JSON.parse(init.body);
    const one = (m) => ({
      jsonrpc: "2.0",
      id: m.id,
      result: m.method === "eth_blockNumber" ? "0x64" : m.method === "eth_chainId" ? "0x1" : word(7),
    });
    return json(Array.isArray(body) ? body.map(one) : one(body));
  });
  return seen;
}

/** rails-server answering the head and every round with 42, and `round` when given. */
const liveApi = (round) => async (p, init) => {
  if (p.startsWith("/api/at-block/head/block")) return json(headBody());
  if (p === "/api/at-block/head/reads") {
    const { reads } = JSON.parse(init.body);
    return json({
      blockNumber: SERVER_HEAD,
      answers: reads.map(() => ({ success: true, returnData: word(42) })),
      ...(round ? { round } : {}),
    });
  }
  if (p === "/api/at-block/head/snapshot")
    return json({ chainId: 1, surface: SCOPE.surface, blockNumber: SERVER_HEAD, reads: 1 });
  return json({ error: "not_found" }, 404);
};

const snapshot = () => ({
  chainId: 1,
  surface: SCOPE.surface,
  blockNumber: 400,
  blockTimestamp: 1_759_999_000,
  readAt: "2026-10-31T11:43:20.000Z",
  provider: "keyless",
  reads: [{ kind: "call", to: TOKEN, data: DATA }],
  answers: [{ success: true, returnData: word(99) }],
});

/** rails-server down for live reads, answering the snapshot GET with `snap` (or 404). */
const downApi = (snap) => async (p) => {
  if (p.startsWith("/api/at-block/head/snapshot?")) return snap ? json(snap) : json({ error: "no_snapshot" }, 404);
  return json({ error: "proxy_error" }, 502);
};

test.beforeEach(() => {
  process.env.RAILS_API_URL = API;
  skew += 120_000;
  SCOPE = { surface: `test:ethereum:s${++n}`, chainId: 1 };
});
test.afterEach(() => {
  test.mock.restoreAll();
});

test("head snapshot: a run rails-server answered posts its rounds once", async () => {
  const seen = stubFetch(liveApi("r-1"));
  const a = await withHeadSnapshot(SCOPE, loader, () => true);
  assert.deepEqual(a.value, { block: SERVER_HEAD, balance: 42n });
  assert.equal(a.stored, undefined);
  await headSnapshotPosts();
  assert.deepEqual(seen.posts, [{ chain: 1, surface: SCOPE.surface, block: SERVER_HEAD, rounds: ["r-1"] }]);
  assert.equal(seen.rpc, 0);
  // A second run within the minute posts nothing more.
  await withHeadSnapshot(SCOPE, loader, () => true);
  await headSnapshotPosts();
  assert.equal(seen.posts.length, 1);
});

test("head snapshot: rounds without a `round` id post nothing", async () => {
  const seen = stubFetch(liveApi(undefined));
  const a = await withHeadSnapshot(SCOPE, loader, () => true);
  assert.equal(a.value.balance, 42n);
  await headSnapshotPosts();
  assert.deepEqual(seen.posts, []);
});

test("head snapshot: a run the chain answered posts nothing", async () => {
  const seen = stubFetch(downApi(null));
  const a = await withHeadSnapshot(SCOPE, loader, () => true);
  assert.deepEqual(a.value, { block: 100, balance: 7n });
  await headSnapshotPosts();
  assert.deepEqual(seen.posts, []);
  assert.ok(!seen.api.some((p) => p.startsWith("/api/at-block/head/snapshot")));
});

test("head snapshot: the server and the chain failing replays the stored snapshot", async () => {
  stubFetch(downApi(snapshot()), { chainDown: true });
  const a = await withHeadSnapshot(SCOPE, loader, () => true);
  assert.deepEqual(a.value, { block: 400, balance: 99n });
  assert.deepEqual(a.stored, {
    blockNumber: 400,
    blockTimestamp: 1_759_999_000,
    readAt: "2026-10-31T11:43:20.000Z",
    provider: "keyless",
  });
});

test("head snapshot: an unusable answer (a loader's stale stub) replays the snapshot", async () => {
  stubFetch(downApi(snapshot()), { chainDown: true });
  const stub = async (client) => {
    try {
      return { ...(await loader(client)), stale: false };
    } catch {
      return { stale: true };
    }
  };
  const a = await withHeadSnapshot(SCOPE, stub, (v) => !v.stale);
  assert.deepEqual(a.value, { block: 400, balance: 99n, stale: false });
  assert.equal(a.stored?.blockNumber, 400);
});

test("head snapshot: no snapshot (404) gives the loader's own answer", async () => {
  stubFetch(downApi(null), { chainDown: true });
  await assert.rejects(withHeadSnapshot(SCOPE, loader, () => true));
  skew += 120_000;
  const stub = async (client) => {
    try {
      return await loader(client);
    } catch {
      return { stale: true };
    }
  };
  const a = await withHeadSnapshot(SCOPE, stub, (v) => !v.stale);
  assert.deepEqual(a.value, { stale: true });
  assert.equal(a.stored, undefined);
});

test("head snapshot: a snapshot missing a read the loader makes gives the loader's own answer", async () => {
  stubFetch(downApi({ ...snapshot(), reads: [], answers: [] }), { chainDown: true });
  await assert.rejects(withHeadSnapshot(SCOPE, loader, () => true));
});
