// Morpho Blue's dollar receipts (rails-ops ui-jobs 743): the rows as printed
// rebuild the figure. Each amount at six decimals × its price as shown, each
// product to the cent, the figure their sum; the collateral at one composed
// price row, the market oracle's price × the loan token's dollar price, each
// factor as shown. A total is drawn only where every held market is priced.
// The Arbitrum dollar line's (lib/morpho-arbitrum/usd.ts) and the family's
// (lib/morpho/usd-receipt.ts).
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
    if (!existsSync(fileURLToPath(url))) {
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

const { morphoArbitrumUsd, morphoArbitrumSideReceipt } = await import(ROOT + "lib/morpho-arbitrum/usd.ts");
const { morphoComposedPrice } = await import(ROOT + "lib/morpho/usd-receipt.ts");
const { shownPrice } = await import(ROOT + "lib/shared/holder-usd-receipt.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const cents = (x) => Math.round(x * 100);

/** Multiply each printed amount by its printed price, to the cent, and add. */
function rebuild(prov) {
  const byLabel = new Map(prov.inputs.map((i) => [i.label, i.value]));
  const legs = prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.slice(0, -" amount".length));
  let sum = 0;
  for (const l of legs) {
    const product = cents(num(byLabel.get(`${l} amount`)) * num(byLabel.get(`${l} price`)));
    if (legs.length > 1) assert.equal(cents(num(byLabel.get(`${l} amount × price`))), product, `${l}'s product row`);
    sum += product;
  }
  if (legs.length > 1) assert.equal(cents(num(byLabel.get("sum"))), sum, "the sum row");
  return sum / 100;
}

const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const WBTC = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f";
const EURC = "0x0000000000000000000000000000000000000e0c";
const market = (id, over) => ({
  marketId: id,
  loanToken: USDC,
  loanSymbol: "USDC",
  collateralSymbol: "WETH",
  currentSupply: 0,
  currentDebt: 0,
  collateral: 0,
  oraclePrice: 0,
  chainStale: false,
  ...over,
});
const READ = {
  blockNumber: 400_123_456,
  loanUsd: { [USDC]: 0.99987654, [WBTC]: 98_765.43218765 },
};
const POSITIONS = [
  market("0x01", { collateralSymbol: "WETH", currentSupply: 12_345.6789123, currentDebt: 5_000.123456 }),
  market("0x02", { collateralSymbol: "wstETH", currentSupply: 99.999999 }),
  market("0x03", { loanToken: WBTC, loanSymbol: "WBTC", collateralSymbol: "USDC", currentSupply: 1.2345678 }),
];

test("Arbitrum: a side's rows rebuild its figure, two USDC markets and a 7-decimal WBTC amount among them", () => {
  const r = morphoArbitrumSideReceipt(READ, POSITIONS, "supply");
  assert.ok(r);
  assert.equal(rebuild(r.prov), r.usd);
  const labels = r.prov.inputs.filter((i) => i.label.endsWith(" amount")).map((i) => i.label);
  assert.equal(new Set(labels).size, labels.length, "two USDC markets name their rows apart");
  assert.equal(r.prov.inputs.find((i) => i.label === "WBTC amount").value, "1.234568 WBTC");
  assert.match(r.prov.inputs.find((i) => i.label === "WBTC price").note, /getAssetPrice\(WBTC\) at block 400,123,456/);
  // The visit's total is the same sum.
  assert.equal(morphoArbitrumUsd({ positions: POSITIONS, loanUsd: READ.loanUsd }).totals.supplyUsd, r.usd);
});

test("the composed collateral row multiplies out from its two shown factors", () => {
  const p = market("0x04", { collateralSymbol: "WETH", collateral: 3.1234567, oraclePrice: 3456.7891234567 });
  const r = morphoArbitrumSideReceipt(READ, [p], "collateral");
  const row = r.prov.inputs.find((i) => i.label === "WETH price");
  const composed = morphoComposedPrice(p.oraclePrice, READ.loanUsd[USDC]);
  assert.equal(composed, shownPrice(shownPrice(p.oraclePrice) * shownPrice(READ.loanUsd[USDC])));
  assert.equal(num(row.value), composed);
  // The note prints both factors as shown, and the product of the two is the row.
  const m = row.note.match(/: ([0-9,.]+) USDC \(the market oracle's price\(\) at block 400,123,456\) × \$([0-9.]+) \(/);
  assert.ok(m, row.note);
  assert.equal(shownPrice(num(m[1]) * num(m[2])), composed);
  assert.match(row.note, /getAssetPrice\(USDC\) at block 400,123,456/);
  assert.equal(rebuild(r.prov), r.usd);
});

test("one unpriced market: no total, the priced market keeps its dollars, the unpriced one is named", () => {
  const positions = [
    ...POSITIONS,
    market("0x05", { loanToken: EURC, loanSymbol: "EURC", collateralSymbol: "WETH", currentSupply: 10 }),
  ];
  const u = morphoArbitrumUsd({ positions, loanUsd: READ.loanUsd });
  assert.equal(u.unpriced, 1);
  assert.deepEqual(u.unpricedPairs, ["EURC / WETH"]);
  assert.equal(morphoArbitrumSideReceipt(READ, positions, "supply"), null, "no total");
  const one = morphoArbitrumSideReceipt(READ, [positions[0]], "supply");
  assert.ok(one && one.usd > 0, "the priced market's dollars stand");
});

test("a missing price draws no figure", () => {
  assert.equal(morphoArbitrumSideReceipt({ ...READ, loanUsd: {} }, POSITIONS, "supply"), null);
  assert.equal(morphoArbitrumSideReceipt({ ...READ, loanUsd: undefined }, POSITIONS, "debt"), null);
  const noOracle = market("0x06", { collateral: 2, oraclePrice: 0 });
  assert.equal(morphoArbitrumSideReceipt(READ, [noOracle], "collateral"), null, "collateral with no oracle price");
  assert.equal(morphoArbitrumUsd({ positions: [noOracle], loanUsd: READ.loanUsd }).unpriced, 1);
});
