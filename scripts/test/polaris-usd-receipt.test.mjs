// Polaris's dollar receipts (rails-ops ui-jobs 743): each amount at six
// decimals × its price as shown, the product to the cent; pETH in dollars one
// composed row, the curve × the ETH/USD medianiser, each factor as shown and
// the block named; USDp at its $1 face, GOLDp at XAU/USD; the equity rebuilds
// from its rows; a missing price draws nothing.
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

const { polarisPethUsd, polarisDebtUsd, polarisEquity } = await import(ROOT + "lib/polaris/usd-receipt.ts");
const { shownComposedPrice } = await import(ROOT + "lib/shared/shown-usd.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const row = (prov, label) => prov.inputs.find((i) => i.label === label);
const BLOCK = 9_123_456;

test("collateral rows multiply out to the cent, a 7-decimal pETH at a high price among them", () => {
  const r = polarisPethUsd({
    what: "x",
    coll: 12.3456789,
    amountNote: "",
    curve: 2.8456789123,
    ethUsd: 3012.345678,
    block: BLOCK,
    via: "",
  });
  const amount = num(row(r.prov, "pETH amount").value);
  const price = num(row(r.prov, "pETH price").value);
  assert.equal(amount, 12.345679);
  assert.equal(price, shownComposedPrice(2.8456789123, 3012.345678));
  assert.equal(r.usd, Math.round(amount * price * 100) / 100);
});

test("pETH in dollars is one composed row, each factor shown and the block named", () => {
  const r = polarisPethUsd({
    what: "x",
    coll: 1,
    amountNote: "",
    curve: 2.8456789123,
    ethUsd: 3012.345678,
    block: BLOCK,
    via: "",
  });
  assert.equal(
    row(r.prov, "pETH price").note,
    "2.845679 ETH (the bonding curve's currentPrice(), pETH in ETH) × $3,012.345678 (ETH/USD, the medianiser's previewExternalPrice()), at block 9,123,456",
  );
});

test("USDp stands at its $1 face; GOLDp at XAU/USD at its block", () => {
  const usdp = polarisDebtUsd({ market: "usdp", debt: 1234.5678919, xauUsd: null, block: BLOCK, via: "" });
  assert.equal(row(usdp.prov, "USDp price").note, "$1 a USDp, by construction of the market's feed");
  assert.equal(usdp.usd, 1234.57);
  const gold = polarisDebtUsd({ market: "goldp", debt: 1.2345678, xauUsd: 2650.987654, block: BLOCK, via: "" });
  assert.match(
    row(gold.prov, "GOLDp price").note,
    /XAU\/USD, the medianiser's previewExternalPrice\(\), at block 9,123,456/,
  );
  assert.equal(gold.usd, Math.round(1.234568 * 2650.987654 * 100) / 100);
});

test("the equity rebuilds from its rows: to the cent on USDp, to six decimals on GOLDp", () => {
  const u = polarisEquity({
    market: "usdp",
    coll: 3.1234567,
    debt: 4000.1234567,
    pethInDebt: 8573.456789,
    block: BLOCK,
  });
  const worth = Math.round(3.123457 * 8573.456789 * 100) / 100;
  assert.equal(u.worth, worth);
  assert.equal(u.equity, Math.round((worth - 4000.123457) * 100) / 100);
  assert.match(row(u.equityProv, "pETH price").note, /previewPrice\(\), at block 9,123,456/);
  const g = polarisEquity({ market: "goldp", coll: 3.1234567, debt: 2.5, pethInDebt: 3.2345678, block: BLOCK });
  assert.equal(g.equity, Math.round((Math.round(3.123457 * 3.234568 * 1e6) / 1e6 - 2.5) * 1e6) / 1e6);
});

test("a missing price draws no figure", () => {
  assert.equal(
    polarisPethUsd({ what: "x", coll: 1, amountNote: "", curve: null, ethUsd: 3000, block: BLOCK, via: "" }),
    null,
  );
  assert.equal(polarisDebtUsd({ market: "goldp", debt: 1, xauUsd: null, block: BLOCK, via: "" }), null);
  assert.equal(polarisEquity({ market: "usdp", coll: 1, debt: 1, pethInDebt: null, block: BLOCK }), null);
});

const { polarisHolderStrip } = await import(ROOT + "lib/polaris/holder-strip.ts");

test("the holder strip and the card give the same position the same collateral cents", () => {
  const price = {
    curve: 3.1995223456,
    ethUsd: 1769.04123,
    pethUsd: 3.1995223456 * 1769.04123,
    pethInDebt: 5660.082591,
    xauUsd: 3820.145319,
  };
  const markets = {
    blockNumber: 12_165_707,
    chainStale: false,
    markets: [
      { market: "usdp", price },
      { market: "goldp", price },
    ],
  };
  const row = { market: "usdp", cdpId: "1", status: "open", coll: 0.0349341234, debt: 31.65, formerHold: false };
  const strip = polarisHolderStrip([row], 1, markets, 100);
  const stripUsd = strip.legs.find((l) => l.id === "collateral").figure.usd;
  const card = polarisPethUsd({
    what: "x",
    coll: row.coll,
    amountNote: "",
    curve: price.curve,
    ethUsd: price.ethUsd,
    block: markets.blockNumber,
    via: "",
  });
  assert.equal(stripUsd, card.usd);
  assert.match(
    strip.legs.find((l) => l.id === "collateral").figure.usdProv.inputs.find((i) => i.label === "pETH price").note,
    /currentPrice\(\), pETH in ETH\) × .*ETH\/USD.*at block 12,165,707/,
  );
});

const { shownPricesOf, polarisSheetUsd } = await import(ROOT + "lib/polaris/sheet-usd.ts");

test("the sheet's Last event row stands at the previous event's prices and names that event's block", () => {
  const prev = {
    market: "usdp",
    stableSymbol: "USDp",
    priceAtBlock: { pethInDebt: 5600.5, curve: 3.1234567, ethUsd: 1793.123456, xauUsd: null },
  };
  const r = polarisSheetUsd(shownPricesOf(prev), "Last event", "coll", 0.0349341, 12_100_000, "USDp");
  const price = r.prov.inputs.find((i) => i.label === "pETH price");
  assert.match(price.note, /at block 12,100,000$/);
  assert.equal(r.usd, Math.round(0.034934 * shownComposedPrice(3.1234567, 1793.123456) * 100) / 100);
  assert.match(r.prov.summary, /the price at block 12,100,000/);
});

test("the since-last-touch sheet's dollars are shown products at the head block's prices", async () => {
  const { shownPricesOf, polarisSheetUsd } = await import(ROOT + "lib/polaris/sheet-usd.ts");
  const { shownUsd, shownComposedPrice } = await import(ROOT + "lib/shared/shown-usd.ts");
  const head = 9_123_456;
  const to = { block: head, timestamp: 0, pethInDebt: 3_456.789, curve: 1.2345678, ethUsd: 2_800.123456 };
  const prices = shownPricesOf({ market: "usdp", stableSymbol: "USDp", priceAtBlock: to });
  // A 7-decimal amount at a high price.
  const r = polarisSheetUsd(prices, "The collateral at the feed", "coll", 12.3456789, head, "USDp");
  assert.equal(r.usd, shownUsd(12.3456789, shownComposedPrice(1.2345678, 2_800.123456)));
  assert.ok(JSON.stringify(r.prov).includes("9,123,456"), "the price names the head block");
  // GOLDp with no XAU/USD read: no price, no figure (never $0).
  const gold = shownPricesOf({
    market: "goldp",
    stableSymbol: "GOLDp",
    priceAtBlock: { ...to, curve: undefined, xauUsd: undefined },
  });
  assert.equal(gold.coll, null);
  assert.equal(gold.debt, null);
  assert.equal(polarisSheetUsd(gold, "The debt at the feed", "debt", 5, head, "GOLDp"), null);
});
