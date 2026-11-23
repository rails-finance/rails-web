// A closed account side's small line leaves out the asset its figure is in
// once (rails-ops ui-jobs 803): two markets sharing the mark keep one icon.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { withoutFirst } from "../../lib/shared/asset-mark.ts";

const WBTC = { symbol: "WBTC", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" };
const USDC = { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" };

test("two markets sharing the main mark: one drops, the other stays", () => {
  assert.deepEqual(withoutFirst([WBTC, USDC, { ...WBTC }], WBTC), [USDC, WBTC]);
});

test("no main, or a main the list does not hold: every asset stays", () => {
  assert.deepEqual(withoutFirst([WBTC, USDC], undefined), [WBTC, USDC]);
  assert.deepEqual(withoutFirst([USDC], WBTC), [USDC]);
});
