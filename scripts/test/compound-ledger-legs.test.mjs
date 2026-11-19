// Compound V3's flow legs name their price (rails-ops ui-jobs 743): the
// Comet's getPrice at the leg's block (an ETH-quoted Comet's composed with
// WETH/USD), an absorb's usdValue over its amount, or the nearest read's,
// both blocks named.
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

const { cometFlowPriceNote } = await import(ROOT + "lib/compound/comet-price-notes.ts");

test("a leg's price at its block, or the nearest read's with both blocks", () => {
  const base = { comet: "cUSDCv3", eventBlock: 21_000_000 };
  assert.equal(
    cometFlowPriceNote({ ...base, priceBlock: 21_000_000 }),
    "cUSDCv3's getPrice, in dollars at block 21,000,000",
  );
  assert.equal(
    cometFlowPriceNote({ ...base, priceBlock: 20_999_000 }),
    "cUSDCv3's getPrice, in dollars, price at block 20,999,000, the nearest read; this event is at block 21,000,000",
  );
});

const { cometUsdOf, cometEthFactorOf } = await import(ROOT + "lib/compound/at-block-prices.ts");
const { cometUsdPrice } = await import(ROOT + "lib/compound/comet-usd.ts");
const { legsProv } = await import(ROOT + "lib/shared/flows-timeline-provenance.ts");
const { centsOf } = await import(ROOT + "lib/shared/shown-usd.ts");

test("the card and the ledger give one price for an ETH-quoted Comet at one block", () => {
  const raw = "103245678"; // getPrice: 1.03245678 ETH
  const quote = "345678901234"; // WETH/USD: $3,456.78901234
  const ledger = cometUsdOf(raw, quote);
  const card = cometUsdPrice({ quoteUnit: "ETH" }, Number(raw) / 1e8, Number(quote) / 1e8);
  assert.equal(ledger, card.usd);
  assert.deepEqual(cometEthFactorOf(raw, quote), { price: 1.03245678, ethUsd: 3456.78901234 });
  assert.match(
    cometFlowPriceNote({ comet: "cWETHv3", priceBlock: 1, eventBlock: 1, factor: cometEthFactorOf(raw, quote) }),
    /^1\.032457 ETH \(cWETHv3's getPrice, in ETH\) × \$3,456\.789012 \(WETH\/USD, the Comet's WETH feed at the same block\) at block 1$/,
  );
});

test("an absorb's collateral leg is the log's usdValue, with its amount and no price", () => {
  // 1.23456789 WBTC: the amount at six decimals × a derived price would not
  // give back the log's figure; the leg states the figure.
  const usdValue = 137_174.165432;
  const leg = {
    bucket: "absorbed",
    amount: 1.23456789,
    symbol: "WBTC",
    price: null,
    usd: centsOf(usdValue),
    block: 21_000_000,
    priceNote: "usdValue in the AbsorbCollateral log, block 21,000,000",
    stated: true,
  };
  const prov = legsProv("Absorbed", "now", [leg]);
  const rows = Object.fromEntries(prov.inputs.map((i) => [i.label, i.value]));
  assert.equal(rows["WBTC at block 21,000,000 amount"], "1.234568 WBTC");
  assert.equal(rows["WBTC at block 21,000,000 value"], "$137,174.17");
  assert.equal(rows.sum, "$137,174.17");
  assert.ok(
    !prov.inputs.some((i) => i.label.endsWith(" price") || i.label.endsWith("× price")),
    "no price, no product",
  );
});
