// The four api-first position clients' failure paths (rails-ops
// TO-DO-infra-and-backend.md item 53): the Aave V3 position, lender (Compound,
// Moonwell, Morpho), Liquity-fork and Aave V4 at-block clients wait 3 s for
// rails-server, read the chain when it cannot answer, and after the route
// fails read the chain for 30 s without asking it. A 400 or 409 refuses one
// request and is not the route down. The wait and the window are
// lib/sources/api/route-gate.ts; the clock is skewed between cases as
// head-reads-fallback.test.mjs does.
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

const { serverAaveV3HeadFigures } = await import(ROOT + "lib/sources/api/aave-v3-position-head.ts");
const { withServerHead } = await import(ROOT + "lib/sources/api/lender-position-head.ts");
const { serverLiquityForkBranches } = await import(ROOT + "lib/sources/api/liquity-fork-head.ts");
const { serverAaveV4HealthFactorAround } = await import(ROOT + "lib/sources/api/aave-v4-at-block.ts");

const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

const WALLET = "0x000000000000000000000000000000000000dead";
const CLIENTS = {
  "aave v3 position": () => serverAaveV3HeadFigures("core", WALLET),
  lender: () =>
    withServerHead({ kind: "compound", family: "compound-v3", deployment: "usdc", wallet: WALLET }, async () => ({
      chainStale: false,
    })),
  "liquity fork": () => serverLiquityForkBranches({ protocol: "ebisu", chainId: 1, branches: {} }),
  "aave v4 at block": () => serverAaveV4HealthFactorAround(WALLET, WALLET, 100),
};

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Replaces global fetch: `api()` answers (a Response, a throw, or "hang" until the abort). */
function stubFetch(api) {
  const seen = [];
  test.mock.method(globalThis, "fetch", async (url, init) => {
    seen.push(String(url));
    const r = await api();
    if (r !== "hang") return r;
    // AbortSignal.timeout's timer does not hold the event loop open.
    const keep = setInterval(() => {}, 1_000);
    return new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        clearInterval(keep);
        reject(init.signal.reason);
      });
    });
  });
  return seen;
}

test.beforeEach(() => {
  process.env.RAILS_API_URL = API;
  skew += 120_000; // past the 30 s down window
});
test.afterEach(() => {
  test.mock.restoreAll();
});

for (const [name, call] of Object.entries(CLIENTS)) {
  test(`${name}: a refused connection is null, and the api is not asked for 30 s`, async () => {
    const seen = stubFetch(async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      });
    });
    assert.equal(await call(), null);
    assert.equal(await call(), null);
    assert.equal(seen.length, 1);
  });

  test(`${name}: a 5xx is null and marks the route down`, async () => {
    const seen = stubFetch(async () => json({ error: "proxy_error" }, 502));
    assert.equal(await call(), null);
    assert.equal(await call(), null);
    assert.equal(seen.length, 1);
  });

  test(`${name}: a 429 marks the route down`, async () => {
    const seen = stubFetch(async () => json({ error: "rate_limited" }, 429));
    await call();
    await call();
    assert.equal(seen.length, 1);
  });

  test(`${name}: an answer slower than 3 s is null after 3 s, and marks the route down`, async () => {
    const seen = stubFetch(async () => "hang");
    const t0 = Date.now();
    assert.equal(await call(), null);
    const ms = Date.now() - t0;
    assert.ok(ms >= 2_900 && ms < 5_000, `fell back after ${ms} ms`);
    const t1 = realNow();
    assert.equal(await call(), null);
    assert.ok(realNow() - t1 < 100, "the second ask waits for nothing");
    assert.equal(seen.length, 1);
  });

  test(`${name}: a 400 refuses that request and keeps asking`, async () => {
    const seen = stubFetch(async () => json({ error: "bad_request" }, 400));
    assert.equal(await call(), null);
    assert.equal(await call(), null);
    assert.equal(seen.length, 2);
  });

  test(`${name}: the route is asked again once the 30 s window has passed`, async () => {
    const seen = stubFetch(async () => json({ error: "proxy_error" }, 503));
    await call();
    skew += 29_000;
    await call();
    assert.equal(seen.length, 1);
    skew += 2_000;
    await call();
    assert.equal(seen.length, 2);
  });

  test(`${name}: no RAILS_API_URL is null without a request`, async () => {
    delete process.env.RAILS_API_URL;
    const seen = stubFetch(async () => json({}, 200));
    assert.equal(await call(), null);
    assert.deepEqual(seen, []);
  });
}
