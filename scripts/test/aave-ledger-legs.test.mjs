// The Aave family's flow legs carry their parts (rails-ops ui-jobs 743): each
// leg's price as shown at its event's block, named as the market's oracle;
// a leg with no price at its block is unpriced, with no fallback to today's
// price; the legs rebuild their line to the cent.
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

const { focusEventsFromLegs } = await import(ROOT + "lib/aave-v3/flows-timeline.ts");
const { aaveV3PriceNote } = await import(ROOT + "lib/aave-v3/price-notes.ts");
const { shownUsd } = await import(ROOT + "lib/shared/shown-usd.ts");
const { legsProv } = await import(ROOT + "lib/shared/flows-timeline-provenance.ts");

const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const ev = (id, block, legs) => ({ id, blockNumber: block, timestamp: 1_700_000_000 + block, txHash: `0x${id}`, legs });
const EVENTS = [
  ev("a", 100, [{ symbol: "WBTC", address: WBTC, leg: "supplied", amount: 1.2345678, price: 98_765.43218765 }]),
  ev("b", 200, [{ symbol: "WBTC", address: WBTC, leg: "supplied", amount: 0.5 }]),
];
const note = (l, block) => aaveV3PriceNote("the market's AaveOracle", l.symbol, block);

test("an Aave leg carries its price at its block, named; one with no price there is unpriced", () => {
  const focus = focusEventsFromLegs(EVENTS, (e) => e.legs, { [WBTC]: 90_000 }, note);
  const [a] = focus[0].legs;
  assert.equal(a.usd, shownUsd(1.2345678, 98_765.43218765));
  assert.equal(a.block, 100);
  assert.equal(a.priceNote, "the market's AaveOracle getAssetPrice(WBTC) at block 100, USD with 8 decimals");
  const [b] = focus[1].legs;
  assert.equal(b.price, null, "today's price is no price at its block");
  assert.equal(b.usd, null);
  const prov = legsProv("Supplied", "now", [a]);
  assert.match(prov.inputs.find((i) => i.label === "WBTC at block 100 price").note, /block 100/);
});

test("without a price note the legs keep their raw figures (the adapter)", () => {
  const focus = focusEventsFromLegs(EVENTS, (e) => e.legs, { [WBTC]: 90_000 });
  assert.equal(focus[1].legs[0].usd, 0.5 * 90_000);
  assert.equal(focus[1].legs[0].price, undefined);
});
