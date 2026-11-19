// Where an IPOR Fusion market row links (lib/ipor-fusion/market-links.ts):
// the covered explorer resolved to a real href on each chain, or null.
// The modules import through `@/`, resolved as chain-launch.test.mjs does.
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
    if (!/\\.[a-z]+$/.test(url)) {
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

const { marketRailsHref } = await import("../../lib/ipor-fusion/market-links.ts");
const { marketInfo } = await import("../../lib/ipor-fusion/markets.ts");
const V = "0x2775e695be91352af6c066e308d52a84b694f0ed";

test("each chain's covered market resolves to its explorer at the vault", () => {
  assert.equal(marketRailsHref(marketInfo("1"), 1, V), `/ethereum/aave-v3?q=${V}`);
  assert.equal(marketRailsHref(marketInfo("1"), 8453, V), `/base/aave-v3?q=${V}`);
  assert.equal(marketRailsHref(marketInfo("14"), 42161, V)?.startsWith("/arbitrum/morpho"), true);
  assert.equal(marketRailsHref(marketInfo("53"), 1, V), `/ethereum/uniswap-v4/${V}`);
  assert.equal(marketRailsHref(marketInfo("33"), 8453, V), `/base/aerodrome/${V}`);
});

test("Euler V2 on Arbitrum and Base resolves, Ethereum does not", () => {
  assert.ok(marketRailsHref(marketInfo("11"), 42161, V)?.startsWith("/arbitrum/euler-v2"));
  assert.ok(marketRailsHref(marketInfo("11"), 8453, V)?.startsWith("/base/euler-v2"));
  assert.equal(marketRailsHref(marketInfo("11"), 1, V), null);
});

test("an uncovered market resolves to nothing", () => {
  assert.equal(marketRailsHref(marketInfo("30"), 8453, V), null);
  assert.equal(marketRailsHref(marketInfo("16"), 1, V), null);
  assert.equal(marketRailsHref(marketInfo("13"), 8453, V), null);
});
