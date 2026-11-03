// rails-server's `/api/at-block/names` and `/api/at-block/tx/log-address`
// clients (lib/sources/api/names-at-block.ts, event-panels-at-block.ts): a
// name is taken from the server only where it found one, a reverse batch asks
// once per 50 addresses, and a log-address 404 is the answer "no such log"
// without marking the route down.
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
process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = API;
// No chain endpoint answers in these tests: a chain read would show as a non-API fetch.
process.env.ENS_RPC_URL = "http://127.0.0.1:9";

const { serverNameAddress, serverEnsNames } = await import(ROOT + "lib/sources/api/names-at-block.ts");
const { serverLogAddress } = await import(ROOT + "lib/sources/api/event-panels-at-block.ts");
const { lookUpEnsAddress, resolveEnsNames } = await import(ROOT + "lib/ens/resolve-ens.ts");

const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(answer) {
  const seen = [];
  test.mock.method(globalThis, "fetch", async (url) => {
    seen.push(String(url));
    return answer(new URL(String(url)));
  });
  return seen;
}

test.beforeEach(() => {
  skew += 120_000; // past the 30 s down window
});
test.afterEach(() => test.mock.restoreAll());

const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const forward = (status, answer) => () =>
  json({ chainId: 1, block: 300, blockTimestamp: 1, results: [{ name: "x.eth", answer, status }] });

test("forward: found is the answer", async () => {
  stubFetch(forward("found", ADDR));
  assert.equal(await serverNameAddress(1, "x.eth"), ADDR);
});

for (const status of ["none", "offchain", "failed"]) {
  test(`forward: ${status} is no answer`, async () => {
    stubFetch(forward(status, status === "none" ? null : ADDR));
    assert.equal(await serverNameAddress(1, "x.eth"), null);
  });
}

test("forward: another chain's body is no answer", async () => {
  stubFetch(() => json({ chainId: 8453, results: [{ name: "x.base.eth", answer: ADDR, status: "found" }] }));
  assert.equal(await serverNameAddress(1, "x.eth"), null);
});

test("lookUpEnsAddress: a found name reads no chain, and the second ask reads nothing", async () => {
  const seen = stubFetch(forward("found", ADDR));
  assert.deepEqual(await lookUpEnsAddress("found-once.eth"), { address: ADDR, failed: false });
  assert.deepEqual(await lookUpEnsAddress("found-once.eth"), { address: ADDR, failed: false });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].startsWith(API + "/api/at-block/names?chain=1&name=found-once.eth"));
});

const addr = (i) => "0x" + i.toString(16).padStart(40, "0");

test("reverse: one request per 50 addresses; only found names kept", async () => {
  const seen = stubFetch((u) => {
    const asked = u.searchParams.get("addresses").split(",");
    return json({
      chainId: 1,
      block: 300,
      blockTimestamp: 1,
      results: asked.map((a, i) => ({
        address: a,
        answer: i % 2 ? null : `n${a.slice(-3)}.eth`,
        status: i % 2 ? "none" : "found",
      })),
    });
  });
  const list = Array.from({ length: 120 }, (_, i) => addr(i + 1));
  const got = await serverEnsNames(list);
  assert.equal(seen.length, 3);
  assert.equal(got.size, 60);
  assert.equal(got.get(addr(1)), `n${addr(1).slice(-3)}.eth`);
  assert.equal(got.has(addr(2)), false);
});

test("resolveEnsNames: all found asks the server once and no chain", async () => {
  const list = [addr(9001), addr(9002)];
  const seen = stubFetch((u) =>
    json({
      chainId: 1,
      block: 300,
      blockTimestamp: 1,
      results: u.searchParams
        .get("addresses")
        .split(",")
        .map((a) => ({ address: a, answer: `${a.slice(-4)}.eth`, status: "found" })),
    }),
  );
  assert.deepEqual(await resolveEnsNames(list), { [list[0]]: "2329.eth", [list[1]]: "232a.eth" });
  assert.deepEqual(await resolveEnsNames(list), { [list[0]]: "2329.eth", [list[1]]: "232a.eth" });
  assert.equal(seen.length, 1);
});

const TX = "0x" + "ab".repeat(32);

test("log-address: an answer is the address", async () => {
  stubFetch(() => json({ chainId: 8453, tx: TX, logIndex: 7, address: "0xAbC0000000000000000000000000000000000001" }));
  assert.equal(await serverLogAddress(8453, TX, 7), "0xabc0000000000000000000000000000000000001");
});

test("log-address: a 404 is null and keeps the route up", async () => {
  const seen = stubFetch(() => json({ error: "The receipt holds no log at that index" }, 404));
  assert.equal(await serverLogAddress(8453, TX, 9999), null);
  assert.equal(await serverLogAddress(8453, TX, 9999), null);
  assert.equal(seen.length, 2);
});

test("log-address: a 5xx is undefined and marks the route down", async () => {
  const seen = stubFetch(() => json({ error: "proxy_error" }, 502));
  assert.equal(await serverLogAddress(8453, TX, 7), undefined);
  assert.equal(await serverLogAddress(8453, TX, 7), undefined);
  assert.equal(seen.length, 1);
});

test("log-address: a 400 is undefined (the receipt is read)", async () => {
  stubFetch(() => json({ error: "bad" }, 400));
  assert.equal(await serverLogAddress(8453, TX, 7), undefined);
});
