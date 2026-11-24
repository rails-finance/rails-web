// The same-block route's answer mapped to the asset page's (ui-jobs 818;
// lib/shared/asset-prices-now.ts). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { routePricesNow, scaledPrice, pricesNowSource, readPricesNow } = await import(
  "../../lib/shared/asset-prices-now.ts"
);

const line = (over) => ({
  lineId: "1:0xaa",
  price: "100000000",
  decimals: 8,
  stale: false,
  ok: true,
  read: "latestRoundData()",
  ...over,
});
const answer = (lines, over = {}) => ({
  chain: 1,
  token: "0xtoken",
  block: 26483745,
  timestamp: 1795000000,
  sameBlock: true,
  lines,
  ...over,
});

test("a price is scaled by its decimals: 8, 18 and a 36-digit composed case", () => {
  assert.equal(scaledPrice("100000000", 8), 1);
  assert.equal(scaledPrice("2500000000000000000000", 18), 2500);
  assert.equal(scaledPrice("999912340000000000", 18), 0.99991234);
  assert.equal(scaledPrice("1000000000000000000000000000000000000", 36), 1);
  assert.ok(Number.isNaN(scaledPrice("1.5", 8)));
});

test("a line takes the answer's block and time, sameBlock true, and its read", () => {
  const a = routePricesNow(answer([line({}), line({ lineId: "1:0xbb", price: "99990000", read: "latestAnswer()" })]));
  assert.equal(a.sameBlock, true);
  assert.equal(a.block, 26483745);
  assert.equal(a.timestamp, 1795000000);
  assert.equal(a.stub, undefined);
  for (const id of ["1:0xaa", "1:0xbb"]) {
    assert.equal(a.prices[id].block, 26483745);
    assert.equal(a.prices[id].timestamp, 1795000000);
  }
  assert.equal(a.prices["1:0xbb"].price, 0.9999);
  assert.equal(a.prices["1:0xbb"].read, "latestAnswer()");
});

test("a composed line is read at its 18 decimals", () => {
  const a = routePricesNow(
    answer([
      line({
        lineId: "1:0xcc",
        price: "999800000000000000",
        decimals: 18,
        read: "latestRoundData() × latestRoundData()",
        composed: { quote: "WETH/USD", quoteOracle: "0xq" },
      }),
    ]),
  );
  assert.equal(a.prices["1:0xcc"].price, 0.9998);
  assert.equal(a.prices["1:0xcc"].ok, true);
});

test("a not-read line is unread with the house sentence", () => {
  const a = routePricesNow(
    answer([line({ price: null, decimals: undefined, ok: false, reason: "not read", read: "" })]),
  );
  const p = a.prices["1:0xaa"];
  assert.equal(p.ok, false);
  assert.equal(p.price, null);
  assert.equal(p.reason, "The oracle returned no price at this block.");
  assert.equal(p.block, 26483745);
});

test("a stale line carries the flag; a stale round carries it at the top", () => {
  const a = routePricesNow(answer([line({ stale: true }), line({ lineId: "1:0xbb" })], { stale: true }));
  assert.equal(a.prices["1:0xaa"].stale, true);
  assert.equal(a.prices["1:0xbb"].stale, undefined);
  assert.equal(a.stale, true);
  assert.equal(routePricesNow(answer([line({})])).stale, undefined);
});

test("the client's choice by status: 200 route, 502 unread, anything else the stub", () => {
  assert.equal(pricesNowSource(200), "route");
  assert.equal(pricesNowSource(502), "unread");
  for (const s of [404, 400, 401, 500, 503, null]) assert.equal(pricesNowSource(s), "stub");
});

test("a missing stale is unknown, never fresh; freshness and hop are accepted", () => {
  const { stale: _s, ...noStale } = line({ lineId: "1:0xcc" });
  const a = routePricesNow(
    answer([
      noStale,
      line({ lineId: "1:0xdd", stale: undefined, freshness: "unknown" }),
      line({ lineId: "1:0xee", stale: undefined, freshness: "stale" }),
      line({ lineId: "1:0xff", freshness: "fresh", hop: 3600 }),
    ]),
  );
  assert.equal(a.prices["1:0xcc"].ok, true);
  assert.equal(a.prices["1:0xcc"].stale, undefined, "no claim either way");
  assert.equal(a.prices["1:0xdd"].stale, undefined);
  assert.equal(a.prices["1:0xee"].stale, true);
  assert.equal(a.prices["1:0xff"].stale, undefined);
});

test("the route's stopped reason reads as a sentence", () => {
  const a = routePricesNow(answer([line({ ok: false, price: null, reason: "stopped" })]));
  assert.equal(a.prices["1:0xaa"].reason, "The OSM is stopped.", "a stopped OSM names its state");
});

test("a route call that stalls to its deadline leaves the fallback its full time", async () => {
  let fallbackSignal = null;
  // AbortSignal.timeout's timer does not hold the event loop open; this one does.
  const keep = setTimeout(() => {}, 1000);
  const out = await readPricesNow({
    timeoutMs: 50,
    // The route never answers: it rejects when its signal aborts, as fetch does.
    route: (signal) =>
      new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: null, answer: null }))),
    fallback: async (signal) => {
      fallbackSignal = signal;
      await new Promise((r) => setTimeout(r, 20));
      return { from: "fallback", aborted: signal.aborted };
    },
    unread: () => ({ from: "unread" }),
  });
  assert.deepEqual(out, { from: "fallback", aborted: false }, "the fallback answers on a fresh deadline");
  assert.ok(fallbackSignal, "the fallback ran");
  clearTimeout(keep);
});

test("readPricesNow takes the route's answer on a 200 and reads nothing on a 502", async () => {
  const base = { timeoutMs: 1000, fallback: async () => "fallback", unread: () => "unread" };
  assert.equal(
    await readPricesNow({ ...base, route: async () => ({ status: 200, answer: "route" }) }),
    "route",
    "200 is the route",
  );
  assert.equal(
    await readPricesNow({ ...base, route: async () => ({ status: 502, answer: null }) }),
    "unread",
    "502 is unread",
  );
  assert.equal(
    await readPricesNow({ ...base, route: async () => ({ status: 404, answer: null }) }),
    "fallback",
    "404 falls back",
  );
});
