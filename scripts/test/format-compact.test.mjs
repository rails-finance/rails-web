// lib/shared/format-compact.ts `formatCompact`: K, M, B, T and Q at one
// decimal, two decimals below 1,000, a rounding that reaches the next unit
// reading in it. The module imports through `@/`, so this file resolves `@/`
// and extensionless paths as erc20-meta.test.mjs does.
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

const { formatCompact, formatCompactUsd } = await import(ROOT + "lib/shared/format-compact.ts");

test("K, M and B at one decimal", () => {
  assert.equal(formatCompact(277_800), "277.8K");
  assert.equal(formatCompact(2_100_000), "2.1M");
  assert.equal(formatCompact(1_300_000_000), "1.3B");
});

test("T from a trillion, Q from a quadrillion", () => {
  assert.equal(formatCompact(4.2e12), "4.2T");
  assert.equal(formatCompact(34.5e15), "34.5Q");
  assert.equal(formatCompact(34_512_345_678_901_234), "34.5Q");
  assert.equal(formatCompact(-7.25e12), "-7.3T");
  assert.equal(formatCompactUsd(1.5e12), "$1.5T");
});

test("past a thousand quadrillion the figure stays in Q", () => {
  assert.equal(formatCompact(1.2e18), "1,200.0Q");
});

test("a rounding that reaches the next unit reads in it", () => {
  assert.equal(formatCompact(999_960), "1.0M");
  assert.equal(formatCompact(999_960_000_000), "1.0T");
  assert.equal(formatCompact(999_960_000_000_000), "1.0Q");
});

test("below 1,000, two decimals", () => {
  assert.equal(formatCompact(932.594), "932.59");
  assert.equal(formatCompact(0), "0.00");
});
