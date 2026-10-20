// lib/shared/size-dimensions.ts: the old Debt dropdown's values read as a
// Debt range, and a selection becomes the four USD fetch bounds (rails-ops
// ui-jobs 354). Run: npm test
//
// The helper imports the range codec through `@/`, so this file registers a
// resolver for the alias (and the extensionless specifier) before loading it.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { debtRangeFromUrl, usdBounds, sizeDimensions } = await import("../../lib/shared/size-dimensions.ts");

test("the old dropdown's values read as their Debt range", () => {
  assert.deepEqual(debtRangeFromUrl(["borrowing"]), ["1-"]);
  assert.deepEqual(debtRangeFromUrl(["supply-only"]), ["-0"]);
  assert.deepEqual(debtRangeFromUrl(["collateral-only"]), ["-0"]);
});

test("a range value passes through in canonical form", () => {
  assert.deepEqual(debtRangeFromUrl(["1000-50000"]), ["1000-50000"]);
  assert.deepEqual(debtRangeFromUrl(["50000-1000"]), ["1000-50000"]);
  assert.deepEqual(debtRangeFromUrl(["-0"]), ["-0"]);
  assert.deepEqual(debtRangeFromUrl(["junk"]), []);
  assert.deepEqual(debtRangeFromUrl([]), []);
});

test("usdBounds: both sides, one side, none", () => {
  assert.deepEqual(usdBounds({ debt: ["1000-50000"], coll: ["10000-"] }), {
    minDebtUsd: 1000,
    maxDebtUsd: 50000,
    minCollUsd: 10000,
    maxCollUsd: undefined,
  });
  assert.deepEqual(usdBounds({ debt: ["-0"], coll: [] }), {
    minDebtUsd: undefined,
    maxDebtUsd: 0,
    minCollUsd: undefined,
    maxCollUsd: undefined,
  });
  assert.deepEqual(usdBounds({ debt: [], coll: [] }), {
    minDebtUsd: undefined,
    maxDebtUsd: undefined,
    minCollUsd: undefined,
    maxCollUsd: undefined,
  });
});

test("the Debt dimension writes the alias as its range and reads `state` as an alias", () => {
  const [debt, coll] = sizeDimensions({
    getDebt: (f) => f.debt,
    setDebt: (f, d) => ({ ...f, debt: d }),
    getColl: (f) => f.coll,
    setColl: (f, c) => ({ ...f, coll: c }),
    debtAliases: ["state"],
  });
  assert.equal(debt.param, "debt");
  assert.deepEqual(debt.aliases, ["state"]);
  assert.equal(coll.param, "coll");
  assert.deepEqual(debt.set({ debt: [], coll: [] }, ["borrowing"]).debt, ["1-"]);
  assert.equal(debt.chipLabel(["1000-50000"], []), "Debt: $1K–$50K");
  assert.equal(coll.chipLabel(["10000-"], []), "Collateral: ≥ $10K");
});
