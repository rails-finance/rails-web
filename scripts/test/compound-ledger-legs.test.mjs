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
  const base = { comet: "cUSDCv3", quoteUnit: "USD", from: "read", eventBlock: 21_000_000 };
  assert.equal(
    cometFlowPriceNote({ ...base, priceBlock: 21_000_000 }),
    "cUSDCv3's getPrice, in dollars at block 21,000,000",
  );
  assert.equal(
    cometFlowPriceNote({ ...base, priceBlock: 20_999_000 }),
    "cUSDCv3's getPrice, in dollars, price at block 20,999,000, the nearest read; this event is at block 21,000,000",
  );
  assert.match(
    cometFlowPriceNote({ ...base, comet: "cWETHv3", quoteUnit: "ETH", priceBlock: 21_000_000 }),
    /getPrice in ETH × WETH\/USD at the same block at block 21,000,000/,
  );
  assert.match(
    cometFlowPriceNote({ ...base, from: "absorb", priceBlock: 21_000_000 }),
    /AbsorbCollateral usdValue ÷ its amount/,
  );
});
