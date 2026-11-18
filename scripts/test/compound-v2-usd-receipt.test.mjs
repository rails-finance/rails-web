// Compound V2's dollar receipts (rails-ops ui-jobs 743): the rows as printed
// rebuild the figure. Each amount at six decimals × the Comptroller oracle's
// price as shown, each product to the cent (six decimals in the oracle's ETH
// years), the figure their sum; the liquidation premium from the two shown
// legs; a Lifetime flows row priced from another row names both blocks; the
// position page draws no debt dollars without the live read.
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
register("data:text/javascript," + encodeURIComponent(hook));

const { compoundV2UsdReceipt, compoundV2DebtDollars } = await import(ROOT + "lib/compound-v2/usd-receipt.ts");
const { compoundV2LiquidationValues } = await import(ROOT + "lib/compound-v2/liquidation-values.ts");
const { liqSeizedValueProv, liqClearedValueProv } = await import(ROOT + "lib/compound-v2/event-provenance.ts");
const { ctokenFlowTimeline, replayCToken } = await import(ROOT + "lib/shared/ctoken-flows.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const r6 = (x) => Math.round(x * 1e6);

/** Multiply each printed amount by its printed price, to the unit, and add. */
function rebuild(prov, unit = 100) {
  const rows = prov.inputs.filter((i) => !["account", "block", "tx"].includes(i.label));
  const byLabel = new Map(rows.map((i) => [i.label, i.value]));
  const legs = rows.filter((i) => i.label.endsWith(" amount")).map((i) => i.label.slice(0, -" amount".length));
  let sum = 0;
  for (const l of legs) {
    const product = Math.round(num(byLabel.get(`${l} amount`)) * num(byLabel.get(`${l} price`)) * unit);
    if (legs.length > 1) assert.equal(Math.round(num(byLabel.get(`${l} amount × price`)) * unit), product, l);
    sum += product;
  }
  if (legs.length > 1) assert.equal(Math.round(num(byLabel.get("sum")) * unit), sum, "the sum row");
  return sum / unit;
}

const READ = { blockNumber: 23_900_000, oracle: "0x50ce56a3239671ab62f185704caedf626352741e" };
const PRICES = { wbtc: 98_765.43218765, wbtc2: 98_765.43218765, usdc: 0.99998, sai: 14.4263 };
const line = (market, symbol, cSymbol, amount) => ({ market, symbol, cSymbol, amount, amountNote: "test" });

test("the card's rows rebuild its figure, a 7-decimal WBTC amount and the two WBTC markets among them", () => {
  const r = compoundV2UsdReceipt({
    what: "Supplied in USD",
    lines: [
      line("wbtc", "WBTC", "cWBTC", 1.2345678),
      line("wbtc2", "WBTC", "cWBTC2", 0.5),
      line("usdc", "USDC", "cUSDC", 12_345.678912),
      line("sai", "SAI", "cSAI", 3),
    ],
    prices: PRICES,
    fixed: { sai: true },
    read: READ,
    face: "compact",
    via: "test",
  });
  assert.equal(rebuild(r.prov), r.usd);
  const labels = r.prov.inputs.map((i) => i.label);
  assert.ok(labels.includes("cWBTC amount") && labels.includes("cWBTC2 amount"), labels.join(" | "));
  assert.equal(r.prov.inputs.find((i) => i.label === "cWBTC amount").value, "1.234568 WBTC");
  assert.match(
    r.prov.inputs.find((i) => i.label === "cWBTC price").note,
    /^Comptroller oracle getUnderlyingPrice\(cWBTC\) at block 23,900,000$/,
  );
  assert.match(
    r.prov.inputs.find((i) => i.label === "SAI price").note,
    /getConfig\(cSAI\) at block 23,900,000 names no price feed/,
  );
  assert.equal(r.prov.contract.address, READ.oracle);
});

test("a missing price draws no figure", () => {
  const lines = [line("usdc", "USDC", "cUSDC", 10), line("dai", "DAI", "cDAI", 5)];
  const base = { what: "x", lines, fixed: {}, read: READ, face: "cents", via: "t" };
  assert.equal(compoundV2UsdReceipt({ ...base, prices: { usdc: 1 } }), null);
  assert.equal(compoundV2UsdReceipt({ ...base, prices: undefined }), null);
});

test("no debt dollars on the position page without the live read; the listing keeps them", () => {
  assert.equal(compoundV2DebtDollars(true, [{ live: true }, {}]), false);
  assert.equal(compoundV2DebtDollars(true, [{ live: true }]), true);
  assert.equal(compoundV2DebtDollars(false, [{}]), true);
});

// A liquidation: USDC debt cleared, cETH collateral seized.
const LIQ = {
  eventType: "liquidation",
  market: "usdc",
  marketSymbol: "USDC",
  collateralMarket: "eth",
  collateralSymbol: "ETH",
  raw: { seizeTokens: "5000000000", amount: "1200000000" },
  collateralExchangeRate: "200123456000000000000000000",
  incentive: "1080000000000000000",
};

test("the premium is worked out from the two shown legs, each rebuilt by its rows", () => {
  const ctx = {
    ...LIQ,
    priceNumeraire: "USD",
    collateralPriceNative: "1234567800000000000000",
    debtPriceNative: "999980000000000000000000000000",
  };
  const v = compoundV2LiquidationValues(ctx);
  const coords = { blockNumber: 15_000_000 };
  const seized = liqSeizedValueProv("ETH", "USD", coords, {
    amount: v.seizedUnderlying,
    price: v.collPrice,
    cSymbol: "cETH",
  });
  const cleared = liqClearedValueProv("USDC", "USD", coords, {
    amount: v.repaid,
    price: v.debtPrice,
    cSymbol: "cUSDC",
  });
  assert.equal(rebuild(seized), v.seizedValue);
  assert.equal(rebuild(cleared), v.clearedValue);
  assert.equal(v.seizedValue / v.clearedValue - 1, rebuild(seized) / rebuild(cleared) - 1);
});

test("an ETH-era leg stays in ETH, its product to six decimals from the shown rows", () => {
  const ctx = {
    ...LIQ,
    priceNumeraire: "ETH",
    collateralPriceNative: "1000000000000000000",
    debtPriceNative: "2512345678900000000000000000",
  };
  const v = compoundV2LiquidationValues(ctx);
  assert.equal(v.numeraire, "ETH");
  const coords = { blockNumber: 10_000_000 };
  const cleared = liqClearedValueProv("USDC", "ETH", coords, {
    amount: v.repaid,
    price: v.debtPrice,
    cSymbol: "cUSDC",
  });
  const price = cleared.inputs.find((i) => i.label === "USDC price");
  assert.match(price.value, / ETH$/);
  assert.match(price.note, /in ETH: before block 10,678,764/);
  assert.equal(rebuild(cleared, 1e6), v.clearedValue);
  assert.equal(r6(v.clearedValue), r6(1200 * 0.00251235), "1,200 USDC at 0.00251235 ETH");
});

test("a flows row priced from the nearest read names both blocks", () => {
  const row = (id, block, price) => ({
    id,
    ts: block * 12,
    block,
    kind: "mint",
    market: "usdc",
    symbol: "USDC",
    underlying: null,
    supplyBefore: block === 100 ? 0 : 10,
    supplyAfter: block === 100 ? 10 : 20,
    debtBefore: null,
    debtAfter: null,
    exchangeRate: 0.02,
    amount: 10,
    price,
  });
  const rows = [row("a", 100, 1.0001), row("b", 200, null)];
  const replayed = replayCToken(rows, { live: null });
  assert.equal(replayed[1].priceBlock, 100);
  const tl = ctokenFlowTimeline(rows, { vocab: { brand: "Compound", receipt: "t" }, now: 3000, live: null });
  const why = tl.days.flatMap((d) => d.unsure ?? []).find((u) => /this row is at block 200/.test(u.why))?.why;
  assert.match(why, /^price at block 100, the nearest read on this market; this row is at block 200/);
});
