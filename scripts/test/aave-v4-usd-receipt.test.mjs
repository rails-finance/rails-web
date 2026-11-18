// Aave V4's dollar receipts (rails-ops ui-jobs 743): every figure stands on
// an on-chain price and its rows rebuild it. Each amount at six decimals × its
// price as shown, each product to the cent, the figure their sum; an asset
// with no on-chain price draws no figure, and any total including it draws
// nothing; a Chainlink entry is named as Chainlink's; a peak names its price's
// block and its own; a line the oracle map leaves out takes its spoke's
// getReservePrice.
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

const { aaveV4UsdReceipt, aaveV4PeakReceipt } = await import(ROOT + "lib/aave-v4/usd-receipt.ts");
const { priceBook, pricedSum } = await import(ROOT + "lib/aave-v4/markets.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
/** Multiply each printed amount by its printed price, to the cent, and add. */
function rebuild(prov) {
  const byLabel = new Map(prov.inputs.map((i) => [i.label, i.value]));
  const legs = prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.slice(0, -" amount".length));
  let sum = 0;
  for (const l of legs) {
    const product = Math.round(num(byLabel.get(`${l} amount`)) * num(byLabel.get(`${l} price`)) * 100);
    if (legs.length > 1) assert.equal(Math.round(num(byLabel.get(`${l} amount × price`)) * 100), product, l);
    sum += product;
  }
  if (legs.length > 1) assert.equal(Math.round(num(byLabel.get("sum")) * 100), sum, "the sum row");
  return sum / 100;
}

const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const RETH = "0xae78736cd615f374d3085123a210448e74fc6393";
const OFF = "0x0000000000000000000000000000000000000abc";
const BTCX = "0x72dfb2e44f59c5ad2bafe84314e5b99a7cd5075e";
const MAP = {
  prices: {
    [WBTC]: { usd: 98_765.43218765, source: "iaave-oracle" },
    [DAI]: { usd: 0.99988166, source: "chainlink" },
    [RETH]: { usd: 2064.182987257171, source: "chainlink-eth-derived" },
  },
  block: 26_444_810,
};
const line = (underlying, symbol) => ({ underlying, symbol });
const STORED = {
  spokes: [{ name: "Main", lines: [line(WBTC), line(DAI), line(RETH), line(OFF), line(BTCX)] }],
  lines: [line(WBTC), line(DAI), line(RETH), line(OFF), line(BTCX)],
};

test("rows multiply out to the cent, a 7-decimal WBTC amount at a high price among them", () => {
  const book = priceBook(STORED, MAP, {});
  const sum = pricedSum(
    [
      { underlying: WBTC, symbol: "WBTC", tokens: 1.2345678 },
      { underlying: DAI, symbol: "DAI", tokens: 12_345.678912 },
      { underlying: RETH, symbol: "rETH", tokens: 3.5 },
    ],
    book,
  );
  const r = aaveV4UsdReceipt({
    what: "Supplied",
    rows: sum.rows.map((x) => ({
      symbol: x.symbol,
      address: x.underlying,
      amount: x.tokens,
      amountNote: "t",
      price: { usd: x.price.usd, source: x.price.source, block: x.price.block },
    })),
    face: "compact",
    via: "t",
  });
  assert.equal(rebuild(r.prov), r.usd);
  assert.equal(r.usd, sum.usd, "the drawn sum is the receipt's");
  assert.equal(r.prov.inputs.find((i) => i.label === "WBTC amount").value, "1.234568 WBTC");
  assert.match(r.prov.inputs.find((i) => i.label === "WBTC price").note, /getReservePrice\(WBTC\) at block 26,444,810/);
});

test("an asset with no on-chain price draws no figure, and any total including it draws nothing", () => {
  const book = priceBook(STORED, MAP, {});
  assert.equal(book(OFF), null, "no off-chain fallback");
  const sum = pricedSum(
    [
      { underlying: WBTC, symbol: "WBTC", tokens: 1 },
      { underlying: OFF, symbol: "OFFX", tokens: 5 },
    ],
    book,
  );
  assert.equal(sum.usd, null);
  assert.deepEqual(sum.unpriced, ["OFFX"]);
  const r = aaveV4UsdReceipt({
    what: "x",
    rows: [{ symbol: "0x0000…0abc", address: OFF, amount: 5, amountNote: "t", price: null }],
    face: "cents",
    via: "t",
  });
  assert.deepEqual(r, { prov: null, usd: null, missing: [OFF] }, "an unresolved symbol is named by address");
});

test("Chainlink entries are named as Chainlink reads", () => {
  const book = priceBook(STORED, MAP, {});
  const rows = [
    { underlying: DAI, symbol: "DAI", tokens: 10 },
    { underlying: RETH, symbol: "rETH", tokens: 1 },
  ].map((x) => {
    const p = book(x.underlying);
    return {
      symbol: x.symbol,
      amount: x.tokens,
      amountNote: "t",
      price: { usd: p.usd, source: p.source, block: p.block },
    };
  });
  const r = aaveV4UsdReceipt({ what: "x", rows, face: "cents", via: "t" });
  assert.equal(r.prov.inputs.find((i) => i.label === "DAI price").note, "Chainlink DAI/USD at block 26,444,810");
  assert.equal(
    r.prov.inputs.find((i) => i.label === "rETH price").note,
    "Chainlink rETH/ETH × ETH/USD at block 26,444,810",
  );
});

test("a line the oracle map leaves out takes its spoke's getReservePrice, its block and oracle named", () => {
  const book = priceBook(STORED, MAP, {
    [BTCX]: { usd: 62_505.49873552, block: 26_444_812, oracle: "0x99b2b6cea9c3d2fd8f4d90f86741c44b212a6127" },
  });
  const p = book(BTCX);
  assert.equal(p.source, "reserve");
  const r = aaveV4UsdReceipt({
    what: "x",
    rows: [
      {
        symbol: "BTCX",
        amount: 0.5,
        amountNote: "t",
        price: { usd: p.usd, source: p.source, block: p.block, oracle: p.oracle },
      },
      {
        symbol: "WBTC",
        amount: 0.1,
        amountNote: "t",
        price: { usd: book(WBTC).usd, source: "iaave-oracle", block: MAP.block },
      },
    ],
    face: "cents",
    via: "t",
  });
  const row = r.prov.inputs.find((i) => i.label === "BTCX price");
  assert.match(row.note, /getReservePrice\(BTCX\) at block 26,444,812/);
  assert.equal(row.contract.address, "0x99b2b6cea9c3d2fd8f4d90f86741c44b212a6127");
  assert.match(r.prov.summary, /each price at the block its row names/, "two blocks, each named on its row");
  assert.equal(rebuild(r.prov), r.usd);
});

test("a peak row names its price's block and the peak's", () => {
  const r = aaveV4PeakReceipt("The peak collateral", {
    block: 24_000_500,
    legs: [
      { symbol: "WETH", amount: 10.1234567, price: 3456.789123, priceBlock: 24_000_100 },
      { symbol: "WBTC", amount: 0.5, price: 98_000.5, priceBlock: 23_990_000 },
    ],
  });
  assert.equal(rebuild(r.prov), r.usd);
  assert.match(
    r.prov.inputs.find((i) => i.label === "WETH price").note,
    /price at block 24,000,100, this reserve's last event; the peak is at block 24,000,500/,
  );
  assert.equal(r.prov.inputs.find((i) => i.label === "WETH price").pclass, "oracle");
});
