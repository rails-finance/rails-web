// A Morpho position's Lifetime flows price once a UTC day (rails-ops
// TO-DO-ui-jobs.md item 687): the day's block is its last row's, a day whose
// last row carries a price needs no read, the cap keeps collateral days first,
// and the price route's loader reads the market's params once and one price()
// per block. The loader imports through `@/`, so this file resolves `@/` and
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
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));
process.env.ALCHEMY_URL = "https://rpc.example/v2/test";

const { morphoPriceDays, morphoPriceDayBlocks, morphoPriceChunks, morphoDayPriceMap, utcDay } = await import(
  ROOT + "lib/morpho/price-days.ts"
);
const { loadMorphoPricesAtBlocks } = await import(ROOT + "lib/sources/chain/morpho-prices.ts");

const DAY = 86_400;
// 1 Nov 2026 00:00:00 UTC.
const D0 = Date.UTC(2026, 10, 1) / 1000;
const row = (ts, block, o = {}) => ({ ts, block, price: null, collDelta: 1, ...o });

test("the day's block is its last row's, split at UTC midnight", () => {
  const rows = [
    row(D0 + 10, 100),
    row(D0 + 3_600, 105),
    row(D0 + DAY - 1, 110), // 23:59:59, the day's last
    row(D0 + DAY, 111), // 00:00:00 next day
    row(D0 + DAY + 50, 112),
  ];
  assert.deepEqual(
    morphoPriceDays(rows).map((d) => [d.day, d.block]),
    [
      [utcDay(D0), 110],
      [utcDay(D0) + 1, 112],
    ],
  );
  assert.deepEqual(morphoPriceDayBlocks(rows), [110, 112]);
});

test("several rows in one block: the day takes that block once", () => {
  const rows = [row(D0 + 5, 200), row(D0 + 9, 201), row(D0 + 9, 201, { collDelta: 0 })];
  assert.deepEqual(morphoPriceDayBlocks(rows), [201]);
});

test("a day whose last row carries a price needs no read; every row that day takes it", () => {
  const rows = [row(D0 + 5, 300), row(D0 + 50, 301, { price: 2.5 }), row(D0 + DAY + 5, 400)];
  assert.deepEqual(morphoPriceDayBlocks(rows), [400]);
  const map = morphoDayPriceMap(rows, new Map([[400, 3]]));
  assert.equal(map.get(300), 2.5);
  assert.equal(map.get(301), 2.5);
  assert.equal(map.get(400), 3);
});

test("rows take their day's read; a day not read is left out", () => {
  const rows = [row(D0 + 5, 500), row(D0 + 60, 510), row(D0 + DAY + 5, 600), row(D0 + 2 * DAY + 5, 700)];
  const map = morphoDayPriceMap(
    rows,
    new Map([
      [510, 1.1],
      [600, 1.2],
      [700, 0],
    ]),
  );
  assert.equal(map.get(500), 1.1, "an earlier row takes its day's last-row price");
  assert.equal(map.get(510), 1.1);
  assert.equal(map.get(600), 1.2);
  assert.equal(map.has(700), false, "a zero answer prices nothing");
});

test("the cap keeps collateral days first, newest first, and answers ascending", () => {
  const rows = [
    row(D0 + 5, 10, { collDelta: 0 }),
    row(D0 + DAY + 5, 20),
    row(D0 + 2 * DAY + 5, 30, { collDelta: 0 }),
    row(D0 + 3 * DAY + 5, 40),
    row(D0 + 4 * DAY + 5, 50),
  ];
  assert.deepEqual(morphoPriceDayBlocks(rows, 2), [40, 50]);
  assert.deepEqual(morphoPriceDayBlocks(rows, 4), [20, 30, 40, 50]);
  assert.deepEqual(morphoPriceDayBlocks(rows, 0), []);
  // 300 days of rows, the page's cap of 250.
  const many = Array.from({ length: 300 }, (_, i) => row(D0 + i * DAY, 1_000 + i));
  assert.equal(morphoPriceDayBlocks(many).length, 250);
});

test("requests hold at most 50 blocks, oldest first, so a new day changes only the last", () => {
  const blocks = Array.from({ length: 120 }, (_, i) => 1_000 + i);
  const a = morphoPriceChunks(blocks);
  assert.deepEqual(
    a.map((c) => c.length),
    [50, 50, 20],
  );
  const b = morphoPriceChunks([...blocks, 2_000]);
  assert.deepEqual(b.slice(0, 2), a.slice(0, 2));
  assert.deepEqual(morphoPriceChunks([5, 3, 3, 4]), [[3, 4, 5]]);
});

const MARKET = "0x" + "ab".repeat(32);
const ORACLE = "0x" + "11".repeat(20);
const stubClient = () => {
  const calls = [];
  return {
    calls,
    readContract: async (req) => {
      calls.push({ fn: req.functionName, block: req.blockNumber });
      if (req.functionName === "idToMarketParams")
        return ["0x" + "22".repeat(20), "0x" + "33".repeat(20), ORACLE, "0x" + "44".repeat(20), BigInt(86e16)];
      if (req.functionName === "price") {
        if (req.blockNumber === BigInt(7)) throw new Error("refused");
        // 1e36 scale, 6-decimal loan, 18-decimal collateral: 2000.5 loan per collateral.
        return BigInt(20005) * BigInt(10) ** BigInt(23);
      }
      throw new Error(`unexpected ${req.functionName}`);
    },
  };
};

test("the loader reads the params once, at the highest block, then one price() per block", async () => {
  const client = stubClient();
  const blocks = [9, 3, 5, 7];
  const r = await loadMorphoPricesAtBlocks(MARKET, blocks, undefined, {
    client,
    decimals: async () => [6, 18],
  });
  const fns = client.calls.map((c) => c.fn);
  assert.equal(fns.filter((f) => f === "idToMarketParams").length, 1);
  assert.equal(fns.filter((f) => f === "price").length, 4);
  assert.equal(client.calls.length, 1 + blocks.length, "nothing else is read");
  assert.equal(client.calls[0].block, BigInt(9));
  assert.deepEqual(
    r.prices.map(([b]) => b),
    [3, 5, 7, 9],
  );
  assert.equal(r.prices[0][1], 2000.5);
  assert.equal(r.prices[2][1], 0, "a refused price() answers 0");
});

test("a page of 120 event days in three requests costs one params read and 120 price() reads", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => [
    row(D0 + i * DAY + 5, 10_000 + 2 * i),
    row(D0 + i * DAY + 90, 10_001 + 2 * i),
  ]).flat();
  const client = stubClient();
  for (const chunk of morphoPriceChunks(morphoPriceDayBlocks(rows)))
    await loadMorphoPricesAtBlocks("0x" + "cd".repeat(32), chunk, undefined, { client, decimals: async () => [6, 18] });
  const fns = client.calls.map((c) => c.fn);
  assert.equal(fns.filter((f) => f === "price").length, 120);
  assert.equal(fns.filter((f) => f === "idToMarketParams").length, 1);
  assert.ok(
    client.calls.filter((c) => c.fn === "price").every((c) => Number(c.block) % 2 === 1),
    "each day's last row",
  );
});
