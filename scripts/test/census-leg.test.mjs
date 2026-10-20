// lib/home/census-leg.ts against stubbed coverage answers.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fetchCensusCount } from "../../lib/home/census-leg.ts";

const URL_ = "https://api.example/api/aave-v3-arbitrum/coverage";

/** A `get` that answers every call with `body` as JSON at `status`. */
function stub(body, status = 200) {
  return async () => new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Bad" });
}

function census(over = {}) {
  return {
    census: {
      wallets: 1200,
      open: 300,
      complete: true,
      walkedFromBlock: 7742429,
      walkedThroughBlock: 516611478,
      checkedBlock: 516611478,
      checkedAt: "2026-10-20T00:00:00Z",
      lastError: null,
      ...over,
    },
  };
}

// The failure paths log on purpose; keep the test output quiet.
test.beforeEach(() => {
  test.mock.method(console, "error", () => {});
});

test("a complete census is counted: open, and closed as wallets minus open", async () => {
  assert.deepEqual(await fetchCensusCount("aave-v3-arbitrum", URL_, stub(census())), { open: 300, closed: 900 });
});

test("no census yet (absent or null) is pending", async () => {
  const absent = await fetchCensusCount("aave-v3-arbitrum", URL_, stub({ protocol: "aave-v3-arbitrum" }));
  assert.ok(absent && "pending" in absent);
  const nul = await fetchCensusCount("aave-v3-arbitrum", URL_, stub({ census: null }));
  assert.ok(nul && "pending" in nul);
});

test("an incomplete census is pending and names the block it reached", async () => {
  const r = await fetchCensusCount("aave-v3-arbitrum", URL_, stub(census({ complete: false })));
  assert.ok(r && "pending" in r);
  assert.match(r.pending, /516611478/);
});

test("a complete census with open still null is pending", async () => {
  const r = await fetchCensusCount("aave-v3-arbitrum", URL_, stub(census({ open: null })));
  assert.ok(r && "pending" in r);
});

test("a failed or malformed answer is null", async () => {
  assert.equal(await fetchCensusCount("aave-v3-arbitrum", URL_, stub({}, 500)), null);
  assert.equal(await fetchCensusCount("aave-v3-arbitrum", URL_, stub(census({ wallets: "many" }))), null);
  const throws = async () => {
    throw new Error("network");
  };
  assert.equal(await fetchCensusCount("aave-v3-arbitrum", URL_, throws), null);
});

test("wallets below open does not reconcile and is null", async () => {
  assert.equal(await fetchCensusCount("aave-v3-arbitrum", URL_, stub(census({ wallets: 10, open: 20 }))), null);
});
