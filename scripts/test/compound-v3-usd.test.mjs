// Compound V3's dollar receipts (rails-ops ui-jobs 743), one shape for the card,
// the Arbitrum and Base strips and /wallet: each amount at six decimals × its
// Comet's getPrice as shown, the product to the cent, each side the sum; an
// ETH-quoted Comet's price one composed row; an unpriced asset draws no side
// figure; the balances' block and the prices' named where they differ.
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
  if (spec === "next/server") return next("next/server.js", ctx);
  // next build resolves server-only to its own guard; under plain node it is a no-op.
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
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

const { compoundSideUsd, cometUsdPrice, cometPricesUsd, cometPriceFactors } = await import(
  ROOT + "lib/compound/comet-usd.ts"
);
const { compoundArbitrumUsd } = await import(ROOT + "lib/compound-arbitrum/usd.ts");
const { cometHeadUsd } = await import(ROOT + "lib/wallet/comet-head-usd.ts");
const { shownUsd, shownComposedPrice } = await import(ROOT + "lib/shared/shown-usd.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const row = (prov, label) => prov.inputs.find((i) => i.label === label);
const raw = (n, d) => BigInt(Math.round(n * 10 ** Math.min(d, 9))) * 10n ** BigInt(Math.max(0, d - 9));

const view = (o = {}) => ({ marketLabel: "cUSDCv3", comet: "0xc3d688b66703497daa19211eedff47f25384cdc3", ...o });

test("rows multiply out to the cent, a 7-decimal amount at a high price among them", () => {
  const r = compoundSideUsd({
    what: "Collateral in USD",
    view: view({ priceByAddress: { "0xwbtc": 98765.432188 }, priceBlock: 21_000_000 }),
    legs: [{ symbol: "WBTC", address: "0xwbtc", amount: 0.1234567 }],
    balance: { source: "chain", block: 21_000_000 },
  });
  assert.equal(num(row(r.prov, "WBTC amount").value), 0.123457);
  assert.equal(r.usd, Math.round(0.123457 * 98765.432188 * 100) / 100);
  assert.match(r.prov.summary, /the price at block 21,000,000/);
});

test("cWETHv3's price is one composed row: getPrice in ETH × WETH in dollars, each as shown", () => {
  const price = shownComposedPrice(1.2123456789, 3012.345678);
  const r = compoundSideUsd({
    what: "Collateral in USD",
    view: view({
      marketLabel: "cWETHv3",
      priceByAddress: { "0xwsteth": price },
      priceFactors: { "0xwsteth": { eth: { price: 1.2123456789, ethUsd: 3012.345678 } } },
      priceBlock: 21_000_000,
    }),
    legs: [{ symbol: "wstETH", address: "0xwsteth", amount: 2.25 }],
    balance: { source: "chain", block: 21_000_000 },
  });
  assert.match(
    row(r.prov, "wstETH price").note,
    /^1\.212346 ETH \(cWETHv3's getPrice, in ETH\) × \$3,012\.345678 \(WETH\/USD/,
  );
  assert.equal(r.usd, shownUsd(2.25, price));
});

test("the same position gives the same cents on the card, the Arbitrum strip and /wallet", () => {
  const chain = {
    comet: "0x6f7d514bbd4aff3bcd1140b7344b32f063dee486",
    market: "weth",
    baseSymbol: "WETH",
    baseDecimals: 18,
    quoteUnit: "ETH",
    basePrice: 1,
    supplyBalanceRaw: "0",
    borrowBalanceRaw: String(raw(1.5, 18)),
    collateral: [
      {
        address: "0xwsteth",
        symbol: "wstETH",
        decimals: 18,
        balanceRaw: String(raw(2.2345678, 18)),
        price: 1.2123456789,
      },
    ],
    isLiquidatable: false,
  };
  const ethUsd = 3012.345678;
  // The card: the page's price map and factors, the side's receipt.
  const card = compoundSideUsd({
    what: "Collateral in USD",
    view: view({
      marketLabel: "cWETHv3",
      priceByAddress: cometPricesUsd(chain, "0xweth", ethUsd),
      priceFactors: cometPriceFactors(chain, "0xweth", ethUsd),
      priceBlock: 400_000_000,
    }),
    legs: [{ symbol: "wstETH", address: "0xwsteth", amount: 2.2345678 }],
    balance: { source: "chain", block: 400_000_000 },
  });
  const strip = compoundArbitrumUsd({ positions: [chain], ethUsd, blockNumber: 400_000_000 }).byComet.get(chain.comet);
  const wallet = cometHeadUsd(chain, ethUsd);
  assert.equal(card.usd, strip.collateralUsd);
  assert.equal(card.usd, wallet.collateralUsd);
  assert.equal(strip.borrowUsd, wallet.debtUsd);
  assert.equal(cometUsdPrice(chain, 1, ethUsd).usd, shownComposedPrice(1, ethUsd));
});

test("an unpriced asset draws no side figure and is named", () => {
  const r = compoundSideUsd({
    what: "Collateral in USD",
    view: view({ priceByAddress: { "0xwbtc": 98765.4 } }),
    legs: [
      { symbol: "WBTC", address: "0xwbtc", amount: 1 },
      { symbol: "COMP", address: "0xcomp", amount: 3 },
    ],
    balance: { source: "replay" },
  });
  assert.deepEqual(r, { missing: ["COMP"] });
});

test("both blocks are named where the balances and the prices stand apart; a replay names none", () => {
  const v = view({ priceByAddress: { "0xwbtc": 98765.4 }, priceBlock: 21_000_010 });
  const legs = [{ symbol: "WBTC", address: "0xwbtc", amount: 1 }];
  const apart = compoundSideUsd({ what: "x", view: v, legs, balance: { source: "chain", block: 21_000_000 } });
  assert.match(apart.prov.summary, /The balances stand at block 21,000,000 and the prices at block 21,000,010\./);
  const replay = compoundSideUsd({ what: "x", view: v, legs, balance: { source: "replay" } });
  assert.match(row(replay.prov, "WBTC amount").note, /a block this read does not name/);
});

test("on Base the composed row names the WETH read's own block beside the getPrice's", () => {
  const r = compoundSideUsd({
    what: "Collateral in USD",
    view: view({
      marketLabel: "cWETHv3",
      priceByAddress: { "0xcbeth": shownComposedPrice(1.0912345, 3012.345678) },
      priceFactors: { "0xcbeth": { eth: { price: 1.0912345, ethUsd: 3012.345678 } } },
      priceBlock: 22_000_000,
      wethFrom: "on cUSDCv3's WETH feed, read beside it at block 22,000,123",
    }),
    legs: [{ symbol: "cbETH", address: "0xcbeth", amount: 1.5 }],
    balance: { source: "chain", block: 22_000_000 },
  });
  assert.match(
    row(r.prov, "cbETH price").note,
    /getPrice, in ETH at block 22,000,000\) × \$3,012\.345678 \(WETH\/USD, on cUSDCv3's WETH feed, read beside it at block 22,000,123\)$/,
  );
});

const { readChainPrices } = await import(ROOT + "lib/sources/chain/compound-prices.ts");
const { COMPOUND_ARBITRUM_DEPLOYMENT } = await import(ROOT + "lib/compound-arbitrum/asset-catalog.ts");

test("the chain lane pins its read to one block and names it, as the Arbitrum route answers", async () => {
  const usdc = COMPOUND_ARBITRUM_DEPLOYMENT.markets.find((m) => m.quoteUnit === "USD");
  const calls = [];
  const client = {
    getBlockNumber: async () => 412_345_678n,
    multicall: async ({ contracts, blockNumber }) => {
      calls.push(blockNumber);
      return contracts.map((c) =>
        c.functionName === "baseTokenPriceFeed"
          ? { status: "success", result: "0x00000000000000000000000000000000000000f1" }
          : c.functionName === "getAssetInfoByAddress"
            ? { status: "success", result: { priceFeed: "0x00000000000000000000000000000000000000f2" } }
            : { status: "success", result: 99_987_000n },
      );
    },
  };
  const map = await readChainPrices(
    client,
    [{ comet: usdc.comet, baseToken: usdc.baseToken, collateral: [] }],
    COMPOUND_ARBITRUM_DEPLOYMENT,
  );
  assert.deepEqual(map.read, { blockNumber: 412_345_678 });
  assert.ok(calls.length > 0 && calls.every((b) => b === 412_345_678n), "every multicall at the pinned block");
});
