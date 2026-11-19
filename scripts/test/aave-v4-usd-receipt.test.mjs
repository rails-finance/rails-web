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
  const withBalances = aaveV4UsdReceipt({
    what: "x",
    rows: r.prov
      ? [
          { symbol: "BTCX", amount: 0.5, amountNote: "t", price: { usd: p.usd, source: p.source, block: p.block } },
          { symbol: "WBTC", amount: 0.1, amountNote: "t", price: { usd: 1, source: "iaave-oracle", block: MAP.block } },
        ]
      : [],
    face: "cents",
    via: "t",
    balanceBlock: 26_444_800,
  });
  assert.match(withBalances.prov.summary, /The balances stand at block 26,444,800\./, "the amounts' block named once");
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

const { calculateAaveEconomics } = await import(ROOT + "lib/aave-v4/spoke-cards.ts");
const ev = (n, eventType, reserveSymbol, amount, price) => ({
  id: `e${n}`,
  txHash: `0x${n}`,
  blockNumber: 1000 + n,
  timestamp: 1_700_000_000 + n,
  context: { protocol: "aave-v4", data: { eventType, reserveSymbol, amount: String(amount), price } },
});

test("the peak walk: on-chain stored prices, shown products, the blocks named, unpriced instants passed over", () => {
  const r = calculateAaveEconomics(
    [
      ev(1, "supply", "WETH", 2.1234567, { usd: 3000.123456, source: "iaave-oracle", block: 1001 }),
      ev(2, "supply", "WBTC", 0.5, { usd: 90_000.5, source: "iaave-oracle", block: 1002 }),
      // A DefiLlama price is no price: the instant holding XAUt is passed over.
      ev(3, "supply", "XAUt", 1, { usd: 2400, source: "defillama", block: 1003 }),
      ev(4, "borrow", "USDC", 1000, { usd: 0.9999, source: "iaave-oracle", block: 1004 }),
    ],
    undefined,
    undefined,
  );
  // The supply peak is the instant before XAUt arrived: WETH and WBTC.
  assert.deepEqual(
    r.peakSupply.legs.map((l) => [l.symbol, l.priceBlock]),
    [
      ["WETH", 1001],
      ["WBTC", 1002],
    ],
  );
  assert.equal(r.peakSupply.block, 1002);
  const receipt = aaveV4PeakReceipt("The peak collateral", r.peakSupply);
  assert.equal(receipt.usd, r.peakSupplyUsd, "the figure is the receipt's sum");
  assert.equal(rebuild(receipt.prov), r.peakSupplyUsd);
  assert.deepEqual(r.peakSupplyUnpriced, [], "an instant survived");
  assert.equal(r.peakDebt.legs[0].symbol, "USDC");
});

test("the peak walk: no instant priced draws no peak and names the reserve", () => {
  const r = calculateAaveEconomics(
    [ev(1, "borrow", "XAUt", 3, { usd: 2400, source: "stablecoin", block: 1001 })],
    undefined,
    undefined,
  );
  assert.equal(r.peakDebt, undefined);
  assert.equal(r.peakDebtUsd, 0);
  assert.deepEqual(r.peakDebtUnpriced, ["XAUt"]);
});

const { aaveV4SpokeSideUsd } = await import(ROOT + "lib/aave-v4/spoke-usd.ts");
const { aaveV4NoFigureLine } = await import(ROOT + "lib/aave-v4/price-notes.ts");
const { computeAaveLifetimeTotals } = await import(ROOT + "lib/aave-v4/lifetime-totals.ts");
const { shownUsd } = await import(ROOT + "lib/shared/shown-usd.ts");

test("before the oracle read lands, or once it fails, a held side draws no figure and says which", () => {
  const spoke = {
    supplyingSymbols: ["WETH"],
    borrowingSymbols: ["USDC"],
    supplyBreakdown: { collateralSymbols: ["WETH"] },
    supplyLegs: [],
    debtLegs: [],
    unpricedHoldings: [],
  };
  const pending = aaveV4SpokeSideUsd({ ...spoke, oracleRead: null }, "supply");
  assert.deepEqual(pending, { prov: null, usd: null, missing: ["WETH"], state: "pending" });
  assert.equal(aaveV4NoFigureLine(pending), "price read pending");
  const failedRead = { prices: {}, blockNumber: null, blockTimestamp: null, failed: true };
  const failed = aaveV4SpokeSideUsd({ ...spoke, oracleRead: failedRead }, "debt");
  assert.equal(failed.state, "failed");
  assert.equal(aaveV4NoFigureLine(failed), "no dollar figure: the price read did not answer");
  assert.equal(aaveV4SpokeSideUsd({ ...spoke, oracleRead: null }, "nonCollateral"), null, "the sub-line waits");
  assert.equal(aaveV4SpokeSideUsd({ ...spoke, supplyingSymbols: [], oracleRead: null }, "supply"), null);
});

test("lifetime flows: each outflow its shown product; an outflow with no on-chain price leaves no figure", () => {
  const r = calculateAaveEconomics(
    [
      ev(1, "supply", "WETH", 3, { usd: 3000.123456, source: "iaave-oracle", block: 1001 }),
      ev(2, "withdraw", "WETH", 1.2345678, { usd: 3100.5, source: "iaave-oracle", block: 1002 }),
      ev(3, "supply", "XAUt", 2, { usd: 2400, source: "defillama", block: 1003 }),
      ev(4, "withdraw", "XAUt", 1, null),
    ],
    undefined,
    undefined,
  );
  const weth = r.reserves.find((x) => x.symbol === "WETH");
  assert.equal(weth.withdrawnUsd, shownUsd(1.2345678, 3100.5));
  const xaut = r.reserves.find((x) => x.symbol === "XAUt");
  assert.deepEqual(xaut.unpricedFlows, ["withdrawn"]);
  assert.equal(xaut.withdrawnUsd, 0);
  const t = computeAaveLifetimeTotals(r.reserves, { "0x0": 1 });
  assert.ok(t.noFigure.includes("XAUt"), "the lifetime figures name XAUt and draw none");
});

const { aaveV4FlowReceipt } = await import(ROOT + "lib/aave-v4/usd-receipt.ts");
const { lifetimeFiguresState } = await import(ROOT + "lib/aave-v4/lifetime-totals.ts");

test("an outflow with no price at its own block takes no earlier event's; the priced ones rebuild with their blocks", () => {
  const r = calculateAaveEconomics(
    [
      ev(1, "supply", "WETH", 5, { usd: 3000.123456, source: "iaave-oracle", block: 1001 }),
      ev(2, "withdraw", "WETH", 1.2345678, { usd: 3100.5, source: "iaave-oracle", block: 1002 }),
      ev(3, "withdraw", "WETH", 0.5, { usd: 3205.987654, source: "chainlink", block: 1003 }),
      ev(4, "supply", "USDC", 100, { usd: 0.9999, source: "iaave-oracle", block: 1004 }),
      // No price at this block: the WETH-era or USDC supply price is not used.
      ev(5, "withdraw", "USDC", 40, null),
    ],
    undefined,
    undefined,
  );
  const usdc = r.reserves.find((x) => x.symbol === "USDC");
  assert.deepEqual(usdc.unpricedFlows, ["withdrawn"]);
  assert.equal(usdc.withdrawnUsd, 0);
  const weth = r.reserves.find((x) => x.symbol === "WETH");
  assert.equal(weth.withdrawnUsd, Math.round((shownUsd(1.2345678, 3100.5) + shownUsd(0.5, 3205.987654)) * 100) / 100);
  const receipt = aaveV4FlowReceipt("WETH withdrawn over the position's life", [
    { symbol: "WETH", legs: weth.flowLegs },
  ]);
  assert.equal(receipt.usd, weth.withdrawnUsd);
  assert.equal(rebuild(receipt.prov), weth.withdrawnUsd, "the rows multiply out to the drawn figure");
  const notes = receipt.prov.inputs.map((i) => i.note ?? "").join(" | ");
  assert.match(notes, /block 1,002/);
  assert.match(notes, /Chainlink WETH\/USD at block 1,003/);
});

test("the lifetime figures wait for the oracle read, and say so while pending and once failed", () => {
  assert.deepEqual(lifetimeFiguresState("pending", []), { draw: false, line: "price read pending" });
  assert.deepEqual(lifetimeFiguresState("failed", []), {
    draw: false,
    line: "no dollar figure: the price read did not answer",
  });
  assert.equal(lifetimeFiguresState("answered", ["XAUt"]).draw, false);
  assert.match(lifetimeFiguresState("answered", ["XAUt"]).line, /XAUt has no on-chain price/);
  assert.deepEqual(lifetimeFiguresState("answered", []), { draw: true });
});

// ── ui-jobs 743, Aave V4 follow-up ──
const { reserveLifetime, lifetimeSideBarUsd } = await import(ROOT + "lib/aave-v4/lifetime-totals.ts");
const { buildAaveV4SpokeCards } = await import(ROOT + "lib/aave-v4/spoke-cards.ts");
const { spokeToMarkdown } = await import(ROOT + "lib/aave-v4/spoke-to-markdown.ts");
const { priceKeyFor } = await import(ROOT + "lib/aave/prices.ts");

const stats = (o) => ({
  symbol: "WETH",
  supplied: 0,
  withdrawn: 0,
  borrowed: 0,
  repaid: 0,
  liquidatedDebt: 0,
  liquidatedCollateral: 0,
  withdrawnUsd: 0,
  repaidUsd: 0,
  liquidatedDebtUsd: 0,
  liquidatedCollateralUsd: 0,
  ...o,
});

test("interest is priced only while all of it is held, at the latest block's price, to the cent", () => {
  // Supplied 2, nothing left, the spoke now reports 2.0123456: all the interest is held.
  const held = reserveLifetime(stats({ supplied: 2, currentSupplied: 2.0123456 }), 3000.987654).supply;
  assert.equal(held.interestUsd, shownUsd(0.0123456, 3000.987654));
  assert.equal(held.heldUsd, shownUsd(2.0123456, 3000.987654));
  assert.equal(held.inflowUsd, Math.round((held.heldUsd - held.interestUsd) * 100) / 100);
  // Once anything has left, the interest has no price at its own block: no
  // interest figure and no Supplied figure apart from it; the gross stands.
  const left = reserveLifetime(
    stats({ supplied: 3, withdrawn: 1, withdrawnUsd: shownUsd(1, 2900), currentSupplied: 2.01 }),
    3000,
  ).supply;
  assert.equal(left.interestUsd, null);
  assert.equal(left.inflowUsd, null);
  assert.equal(left.grossUsd, Math.round((shownUsd(2.01, 3000) + shownUsd(1, 2900)) * 100) / 100);
});

test("a side bar draws no height from a partial: an unpriced asset or outflow leaves it without a figure", () => {
  assert.equal(lifetimeSideBarUsd([100.12, 50.01], []), 150.13);
  assert.equal(lifetimeSideBarUsd([100.12, 50.01], ["XAUt"]), null);
  assert.equal(lifetimeSideBarUsd([100.12, null], []), null);
});

test("an unpriced holding of any real size stops the lifetime figures and the peak", () => {
  const r = calculateAaveEconomics(
    [
      ev(1, "supply", "WETH", 1, { usd: 3000, source: "iaave-oracle", block: 1001 }),
      // 0.00005 tokens: under the old 0.0001 floor, which passed it over.
      ev(2, "supply", "XAUt", 0.00005, null),
    ],
    undefined,
    undefined,
  );
  const t = computeAaveLifetimeTotals(r.reserves, { "0x0": 1 });
  assert.ok(t.noFigure.includes("XAUt"));
  const alone = calculateAaveEconomics([ev(1, "supply", "XAUt", 0.00005, null)], undefined, undefined);
  assert.equal(alone.peakSupply, undefined);
  assert.deepEqual(alone.peakSupplyUnpriced, ["XAUt"]);
});

test("gas is stated in ETH, and not at all where an event has none recorded", () => {
  const gas = (e, eth) => ({ ...e, gas: { gasCostEth: eth, gasCostUsd: 99 } });
  const all = calculateAaveEconomics(
    [gas(ev(1, "supply", "WETH", 1, null), 0.0012), gas(ev(2, "withdraw", "WETH", 1, null), 0.0008)],
    undefined,
    undefined,
  );
  assert.ok(Math.abs(all.totalGasCostEth - 0.002) < 1e-12);
  assert.equal("totalGasCostUsd" in all, false);
  const some = calculateAaveEconomics(
    [gas(ev(1, "supply", "WETH", 1, null), 0.0012), ev(2, "withdraw", "WETH", 1, null)],
    undefined,
    undefined,
  );
  assert.equal(some.totalGasCostEth, null);
});

test("the markdown export writes no figure while the read is pending, once it has failed, or with an unpriced asset", () => {
  const events = [
    ev(1, "supply", "WETH", 2, { usd: 3000, source: "iaave-oracle", block: 1001 }),
    ev(2, "borrow", "USDC", 1000, { usd: 1, source: "iaave-oracle", block: 1002 }),
  ];
  const weth = priceKeyFor("WETH");
  const usdc = priceKeyFor("USDC");
  const prices = { [weth]: 3100.5, [usdc]: 0.9999 };
  const base = buildAaveV4SpokeCards(events, undefined, prices)[0];
  const md = (card, p = prices) =>
    spokeToMarkdown({
      spokeName: "Main",
      wallet: "0xabc",
      card,
      reserves: [],
      prices: p,
      events,
      generatedAt: new Date(0),
    });
  const answered = {
    prices: {
      [weth]: { usd: 3100.5, source: "iaave-oracle", symbol: "WETH" },
      [usdc]: { usd: 0.9999, source: "iaave-oracle", symbol: "USDC" },
    },
    blockNumber: 2000,
    blockTimestamp: 1,
  };
  const card = { ...base, weightedCollateralUsd: 5000, borrowingPowerUsd: 3000 };

  const pending = md({ ...card, oracleRead: null });
  assert.match(pending, /\*\*Collateral:\*\* price read pending supplied/);
  assert.match(pending, /\*\*Debt:\*\* price read pending/);
  assert.doesNotMatch(pending, /counts at the collateral factor|Borrowing power remaining/);

  const failed = md({ ...card, oracleRead: { prices: {}, blockNumber: null, blockTimestamp: null, failed: true } });
  assert.match(failed, /no dollar figure: the price read did not answer/);
  assert.doesNotMatch(failed, /counts at the collateral factor|Borrowing power remaining/);

  const unpriced = md({
    ...card,
    oracleRead: answered,
    unpricedHoldings: [{ symbol: "XAUt", side: "supply", collateralEnabled: true }],
  });
  assert.match(unpriced, /XAUt/);
  assert.doesNotMatch(unpriced, /counts at the collateral factor|Borrowing power remaining/);

  const drawn = md({ ...card, oracleRead: answered });
  assert.match(drawn, /counts at the collateral factor/);
  assert.match(drawn, /Borrowing power remaining/);
  // The peaks are the card's: its receipt's figure, the shown products summed.
  assert.match(drawn, /\*\*Peak supply:\*\* \$6,000/);
  assert.match(md({ ...card, peakSupply: undefined, peakSupplyUnpriced: ["XAUt"] }), /\*\*Peak supply:\*\* .*XAUt/);
});
