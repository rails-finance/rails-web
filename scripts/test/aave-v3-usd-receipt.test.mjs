// Aave V3's dollar receipts (rails-ops ui-jobs 743): the rows as printed
// rebuild the figure. Each amount at six decimals × its AaveOracle price as
// shown, each product to the cent, the figure their sum; a reserve with no
// price draws no figure. The position card's (lib/aave-v3/usd-receipt.ts) and
// the market surface's (lib/shared/aave-market-provenance.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  // next build resolves \`server-only\` to its own guard; under plain node it is a no-op.
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (spec === "next/server") return next("next/server.js", ctx);
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    // A directory resolves to a same-named .ts beside it, then its index.ts.
    if (!existsSync(fileURLToPath(url)) || statSync(fileURLToPath(url)).isDirectory()) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { aaveV3UsdReceipt, aaveV3UsdOf, aaveV3LiqPriceReceipt } = await import(ROOT + "lib/aave-v3/usd-receipt.ts");
const { aaveMarketVocab, aaveMarketUsd } = await import(ROOT + "lib/shared/aave-market-provenance.ts");
const { aaveV3LiquidationRead } = await import(ROOT + "lib/aave-v3/chain-truth-tower.ts");
const { aaveOraclePricesResponse } = await import(ROOT + "lib/sources/api/aave-oracle-prices-route.ts");
const { resolveAaveOraclePrices, aaveOraclePriceBlockOf } = await import(
  ROOT + "lib/sources/chain/aave-oracle-prices.ts"
);

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const cents = (x) => Math.round(x * 100);
const ORACLE = { name: "Aave V3 IAaveOracle", address: "0x54586be62e3c3580375ae3723c145253060ca0c2" };
const WBTC = { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" };
const WETH = { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" };
const USDC = { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" };

const receipt = (reserves, prices, extra = {}) =>
  aaveV3UsdReceipt({
    what: "Collateral valued in US dollars",
    rows: { reserves, prices, priceBlock: 23_800_000, face: "compact", ...extra },
    oracle: ORACLE,
    amountNote: (s) => `${s} aToken balanceOf`,
    via: "test",
  });

/** Multiply each printed amount by its printed price, to the cent, and add. */
function rebuild(prov) {
  const byLabel = new Map(prov.inputs.map((i) => [i.label, i.value]));
  const tokens = prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.slice(0, -" amount".length));
  let sum = 0;
  for (const t of tokens) {
    const product = cents(num(byLabel.get(`${t} amount`)) * num(byLabel.get(`${t} price`)));
    if (tokens.length > 1) assert.equal(cents(num(byLabel.get(`${t} amount × price`))), product, `${t}'s product row`);
    sum += product;
  }
  if (tokens.length > 1) assert.equal(cents(num(byLabel.get("sum"))), sum, "the sum row");
  return sum / 100;
}

test("the card's rows rebuild its figure, a 7-decimal amount at a high price among them", () => {
  const reserves = [
    { ...WBTC, amount: 1.2345678 },
    { ...WETH, amount: 12.345678912 },
    { ...USDC, amount: 5_000.123456 },
  ];
  const prices = { [WBTC.address]: 98_765.43218765, [WETH.address]: 3_456.78912345, [USDC.address]: 0.99987654 };
  const r = receipt(reserves, prices);
  assert.ok(r);
  assert.equal(rebuild(r.prov), r.usd);
  assert.equal(aaveV3UsdOf({ reserves, prices, face: "cents" }), r.usd);
  // The 7-decimal amount prints at six, and the figure is built from that.
  const wbtc = r.prov.inputs.find((i) => i.label === "WBTC amount");
  assert.equal(wbtc.value, "1.234568 WBTC");
  assert.match(r.prov.inputs.find((i) => i.label === "WBTC price").note, /getAssetPrice\(WBTC\) at block 23,800,000/);
});

test("one reserve: the amount times the price is the figure", () => {
  const r = receipt([{ ...WBTC, amount: 0.0000071 }], { [WBTC.address]: 101_234.56789 });
  assert.equal(rebuild(r.prov), r.usd);
});

test("a listing's receipt names the balance's block and the price's", () => {
  const r = receipt(
    [{ ...WETH, amount: 2 }],
    { [WETH.address]: 3000 },
    { balanceBlock: 30_000_100, priceBlock: 30_000_250 },
  );
  assert.match(r.prov.summary, /balances stand at block 30,000,100 and the prices at block 30,000,250/);
});

test("a missing price or unread decimals draws no dollar figure", () => {
  const reserves = [
    { ...WETH, amount: 2 },
    { ...USDC, amount: 10 },
  ];
  assert.equal(receipt(reserves, { [WETH.address]: 3000 }), null);
  assert.equal(receipt(reserves, undefined), null);
  assert.equal(receipt(reserves, {}), null, "a failed price read answers {}");
  assert.equal(aaveV3UsdOf({ reserves, prices: { [WETH.address]: 3000 }, face: "cents" }), null);
  assert.equal(
    receipt([{ ...WETH, amount: 2, decimalsUnread: true }], { [WETH.address]: 3000 }),
    null,
    "unread decimals",
  );
});

test("the liquidation price is the shown price over the shown health factor", () => {
  const { prov, liqPrice } = aaveV3LiqPriceReceipt({
    symbol: "WETH",
    price: 3456.789123456,
    priceBlock: 1,
    hf: 1.234567891234,
    hfBlock: 1,
    oracle: ORACLE,
    pool: { name: "Pool" },
  });
  const [p, hf] = prov.inputs.map((i) => num(i.value));
  assert.equal(liqPrice, p / hf);
});

test("a market total lists every reserve by value, dust behind the toggle, and its rows sum to it", () => {
  const vocab = aaveMarketVocab("aave-v3", { blockNumber: 23_800_000, oracle: ORACLE.address });
  const rows = [
    { symbol: "USDC", tokens: 1_234_567_890.123456, price: 0.99991 },
    { symbol: "DUST", tokens: 0.000001, price: 0.5 },
    { symbol: "WBTC", tokens: 12_345.6789012, price: 98_765.4321 },
    { symbol: "NOPRICE", tokens: 5, price: null },
  ];
  const prov = vocab.marketTotalProv("supplied", rows);
  const total = aaveMarketUsd(rows);
  assert.equal(rebuild(prov), total);
  const order = prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.split(" ")[0]);
  assert.deepEqual(order, ["USDC", "WBTC", "DUST"]);
  assert.ok(prov.inputs.filter((i) => i.label.startsWith("DUST")).every((i) => i.dust));
  assert.ok(prov.inputs.filter((i) => !i.label.startsWith("DUST")).every((i) => !i.dust));
  assert.match(prov.summary, /no price for one reserve/);
});

test("the card's liquidation price is its receipt's", () => {
  const view = {
    wallet: "0x1",
    market: "core",
    status: "open",
    supplies: [{ ...WETH, decimals: 18, amount: 10.123456789, amountRaw: "10123456789000000000" }],
    borrows: [{ ...USDC, decimals: 6, amount: 12_000, amountRaw: "12000000000" }],
    peakSupplies: [],
    peakBorrows: [],
    liquidationCount: 0,
    txCount: 1,
    lastActivityAt: 0,
    priceByAddress: { [WETH.address]: 3456.789123456, [USDC.address]: 0.99987654 },
    healthFactor: 2.345678912345,
    chainHfStale: false,
  };
  const read = aaveV3LiquidationRead(view);
  assert.ok(read.single);
  const { liqPrice } = aaveV3LiqPriceReceipt({
    symbol: "WETH",
    price: read.single.price,
    hf: view.healthFactor,
    oracle: ORACLE,
    pool: { name: "Pool" },
  });
  assert.equal(read.single.liqPrice, liqPrice);
});

// A NextRequest's shape as the route body reads it.
const request = (qs) => ({ nextUrl: new URL(`http://x/api/chain/aave-v3/oracle-prices?${qs}`) });
const stubMap = (prices, block) =>
  Object.assign(new Map(prices), { blocks: new Map(block ? [[ORACLE.address, block]] : []) });

test("the oracle-prices route: ?block= is passed when valid, the answer is { prices, block }", async () => {
  const asked = [];
  const resolve = async (reqs, _chain, block) => {
    asked.push(block);
    return stubMap([[`${ORACLE.address}:${WETH.address}`, 3000]], block ?? 99);
  };
  const ok = await (
    await aaveOraclePricesResponse(request(`assets=${WETH.address}&block=123`), ORACLE.address, 1, "t", resolve)
  ).json();
  assert.deepEqual(ok, { prices: { [WETH.address]: 3000 }, block: 123 });
  for (const bad of ["block=abc", "block=-4", "block=1.5", "block=0", ""]) {
    const r = await (
      await aaveOraclePricesResponse(request(`assets=${WETH.address}&${bad}`), ORACLE.address, 1, "t", resolve)
    ).json();
    assert.equal(r.block, 99, `${bad || "no block"} reads at the latest, named`);
  }
  assert.deepEqual(asked, [123, undefined, undefined, undefined, undefined, undefined]);
});

test("the oracle-prices route: no assets, or a failed read, answers empty with a null block", async () => {
  const never = async () => assert.fail("no read without assets");
  const empty = await (await aaveOraclePricesResponse(request("assets=nope"), ORACLE.address, 1, "t", never)).json();
  assert.deepEqual(empty, { prices: {}, block: null });
  const fail = async () => {
    throw new Error("down");
  };
  const err = console.error;
  console.error = () => {};
  const failed = await (
    await aaveOraclePricesResponse(request(`assets=${WETH.address}`), ORACLE.address, 1, "t", fail)
  ).json();
  console.error = err;
  assert.deepEqual(failed, { prices: {}, block: null });
});

test("more than 40 assets: every chunk after the first is read at the first's block", async () => {
  const assets = Array.from({ length: 45 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
  const urls = [];
  const realFetch = globalThis.fetch;
  const realApi = process.env.RAILS_API_URL;
  process.env.RAILS_API_URL = "http://api.test";
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    urls.push(u);
    const asked = u.searchParams.get("assets").split(",");
    const block = Number(u.searchParams.get("block") ?? 500);
    return new Response(JSON.stringify({ block, prices: Object.fromEntries(asked.map((a) => [a, "100000000"])) }));
  };
  try {
    const map = await resolveAaveOraclePrices([{ oracle: ORACLE.address, assets }]);
    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get("block"), null, "the first chunk reads the latest");
    assert.equal(urls[1].searchParams.get("block"), "500", "the second reads at the first's block");
    assert.equal(map.size, 45);
    assert.equal(aaveOraclePriceBlockOf(map, ORACLE.address), 500);
  } finally {
    globalThis.fetch = realFetch;
    if (realApi == null) delete process.env.RAILS_API_URL;
    else process.env.RAILS_API_URL = realApi;
  }
});

test("more than 40 assets and a first chunk naming no block: the set is refused", async () => {
  const assets = Array.from({ length: 45 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
  let asked = 0;
  const realFetch = globalThis.fetch;
  const saved = { api: process.env.RAILS_API_URL, rpc: process.env.ALCHEMY_URL };
  process.env.RAILS_API_URL = "http://api.test";
  // No RPC: the multicall that takes a refused set answers nothing here.
  delete process.env.ALCHEMY_URL;
  globalThis.fetch = async (url) => {
    asked++;
    const a = new URL(String(url)).searchParams.get("assets").split(",");
    return new Response(JSON.stringify({ prices: Object.fromEntries(a.map((x) => [x, "100000000"])) }));
  };
  try {
    const map = await resolveAaveOraclePrices([{ oracle: ORACLE.address, assets }]);
    assert.equal(asked, 1, "no chunk is asked after an unnamed first");
    assert.equal(map.size, 0);
    assert.equal(aaveOraclePriceBlockOf(map, ORACLE.address), undefined);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [
      ["RAILS_API_URL", saved.api],
      ["ALCHEMY_URL", saved.rpc],
    ])
      if (v == null) delete process.env[k];
      else process.env[k] = v;
  }
});
