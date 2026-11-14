// Moonwell's Credit remaining (lib/moonwell/credit-remaining.ts), the figure the
// card's headline and the Base share card state. rails-ops ui-jobs 632, 644.
// Run: npm test
//
// The module imports lib/shared/capacity-share by extensionless relative
// specifier, so this file registers a resolver that adds the `.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { creditRemainingShare, creditRemainingText, creditRemainingStat } = await import(
  "../../lib/moonwell/credit-remaining.ts"
);

test("the docs' worked example: [$600 − $100] ÷ $600 = 83.3%", () => {
  assert.equal(creditRemainingStat(600, 100), "83.3%");
});

test("a shortfall reads negative with a true minus", () => {
  assert.equal(creditRemainingStat(500, 600), "−20.0%");
});

test("past 1,000× the limit the figure is the stated floor", () => {
  assert.equal(creditRemainingStat(1, 5_000), "below −99,900%");
  assert.equal(creditRemainingText(creditRemainingShare(0, 10)), "below −99,900%");
});

test("no debt states nothing", () => {
  assert.equal(creditRemainingStat(600, 0), null);
});
