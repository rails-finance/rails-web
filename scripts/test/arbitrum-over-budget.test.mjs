// The api's 429 on the Arbitrum lane, end to end on the web side
// (rails-ops TO-DO-arbitrum-scoping.md item 27): the readers throw
// ApiOverBudget, the chain routes answer 429 with Retry-After, and
// fetchChainTimeline maps it to ChainTimelineOverBudget. A server render's
// read carries the signed hop pair; a route's read does not.
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as compound-base-holder-strip.test.mjs does.
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
  if (spec === "next/server") return next("next/server.js", ctx);
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

// fetch-with-auth reads the token when it loads.
process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = "https://api.example";

const { parseRetryAfter, ApiOverBudget } = await import(ROOT + "lib/api/api-over-budget.ts");
const { fetchChainTimeline, ChainTimelineOverBudget, ChainTimelineUnavailable } = await import(
  ROOT + "lib/api/fetch-chain-timeline.ts"
);
const { readerHopHeaders } = await import(ROOT + "lib/api/reader-ip.ts");
const { loadAaveV3ArbitrumTimeline } = await import(ROOT + "lib/sources/api/aave-v3-arbitrum-timeline.ts");
const { loadCompoundArbitrumTimeline } = await import(ROOT + "lib/sources/api/compound-arbitrum-timeline.ts");
const { loadMorphoArbitrumTimeline } = await import(ROOT + "lib/sources/api/morpho-arbitrum-timeline.ts");
const aaveRoute = await import(ROOT + "app/api/chain/aave-v3-arbitrum/timeline/route.ts");
const compoundRoute = await import(ROOT + "app/api/chain/compound-arbitrum/timeline/route.ts");
const morphoRoute = await import(ROOT + "app/api/chain/morpho-arbitrum/timeline/route.ts");

const WALLET = "0x4b1e00000000000000000000000000000000d618";
const IP = "203.0.113.7";

/** Replaces global fetch with one answering `status` (and `retryAfter`),
 *  recording each request's headers. */
function stubFetch(status, retryAfter) {
  const seen = [];
  test.mock.method(globalThis, "fetch", async (url, init) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers) });
    const headers = new Headers({ "content-type": "application/json" });
    if (retryAfter !== undefined) headers.set("retry-after", retryAfter);
    return new Response(JSON.stringify({ error: "x" }), { status, headers });
  });
  return seen;
}

test.beforeEach(() => {
  test.mock.method(console, "error", () => {});
});
test.afterEach(() => {
  test.mock.restoreAll();
});

test("Retry-After: seconds as given, 30 when absent or unparsed, at most 60", () => {
  assert.equal(parseRetryAfter("12"), 12);
  assert.equal(parseRetryAfter(null), 30);
  assert.equal(parseRetryAfter("soon"), 30);
  assert.equal(parseRetryAfter("600"), 60);
  assert.equal(parseRetryAfter("0"), 1);
  const now = Date.parse("2026-10-21T08:42:00Z");
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 08:42:36 GMT", now), 36);
});

test("fetchChainTimeline: a 429 throws ChainTimelineOverBudget with the route's wait", async () => {
  for (const [header, want] of [
    ["12", 12],
    [undefined, 30],
    ["120", 60],
  ]) {
    stubFetch(429, header);
    await assert.rejects(
      fetchChainTimeline({ wallet: WALLET, route: "/api/chain/aave-v3-arbitrum/timeline" }),
      (e) => e instanceof ChainTimelineOverBudget && e.retryAfterSeconds === want,
    );
    test.mock.restoreAll();
  }
});

test("fetchChainTimeline: a 503 stays ChainTimelineUnavailable", async () => {
  stubFetch(503);
  await assert.rejects(
    fetchChainTimeline({ wallet: WALLET, route: "/api/chain/aave-v3-arbitrum/timeline" }),
    (e) => e instanceof ChainTimelineUnavailable && !(e instanceof ChainTimelineOverBudget),
  );
});

const READERS = [
  ["aave", loadAaveV3ArbitrumTimeline],
  ["compound", loadCompoundArbitrumTimeline],
  ["morpho", loadMorphoArbitrumTimeline],
];

for (const [family, load] of READERS) {
  test(`${family} reader: a 429 throws ApiOverBudget carrying Retry-After`, async () => {
    stubFetch(429, "36");
    await assert.rejects(load(WALLET, IP), (e) => e instanceof ApiOverBudget && e.retryAfterSeconds === 36);
  });

  test(`${family} reader: any other failure is still null`, async () => {
    stubFetch(500);
    assert.equal(await load(WALLET, IP), null);
  });

  test(`${family} reader: a render's read carries the signed hop pair, a route's read does not`, async () => {
    let seen = stubFetch(500);
    await load(WALLET, IP, { render: true });
    const hop = readerHopHeaders(IP);
    assert.equal(seen[0].headers.get("x-rails-reader-ip"), IP);
    assert.equal(seen[0].headers.get("x-rails-ssr-reader-ip"), IP);
    assert.equal(seen[0].headers.get("x-rails-ssr-reader-sig"), hop["x-rails-ssr-reader-sig"]);
    assert.match(seen[0].headers.get("x-rails-ssr-reader-sig"), /^[0-9a-f]{64}$/);
    test.mock.restoreAll();
    test.mock.method(console, "error", () => {});

    seen = stubFetch(500);
    await load(WALLET, IP);
    assert.equal(seen[0].headers.get("x-rails-reader-ip"), IP);
    assert.equal(seen[0].headers.get("x-rails-ssr-reader-ip"), null);
    assert.equal(seen[0].headers.get("x-rails-ssr-reader-sig"), null);
  });
}

const ROUTES = [
  ["aave-v3-arbitrum", aaveRoute],
  ["compound-arbitrum", compoundRoute],
  ["morpho-arbitrum", morphoRoute],
];

function routeRequest(family) {
  const url = `https://rails.example/api/chain/${family}/timeline?wallet=${WALLET}`;
  const req = new Request(url, { headers: { "x-real-ip": IP } });
  // The route reads `nextUrl` off its NextRequest.
  return Object.assign(req, { nextUrl: new URL(url) });
}

for (const [family, route] of ROUTES) {
  test(`${family} route: the store's 429 passes through with Retry-After, uncached`, async () => {
    const seen = stubFetch(429, "36");
    const res = await route.GET(routeRequest(family));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "36");
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /max-age/);
    const body = await res.json();
    assert.equal(body.overBudget, true);
    assert.equal(typeof body.error, "string");
    // A bare route call names the reader and sends no hop pair.
    assert.equal(seen[0].headers.get("x-rails-reader-ip"), IP);
    assert.equal(seen[0].headers.get("x-rails-ssr-reader-sig"), null);
  });

  test(`${family} route: a store that is down stays 503`, async () => {
    stubFetch(500);
    const res = await route.GET(routeRequest(family));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).unavailable, true);
  });
}
