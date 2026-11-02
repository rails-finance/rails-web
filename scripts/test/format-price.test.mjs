// formatPrice's adaptive decimals and groupDigits' thousands separators
// (ui-jobs 211). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice, groupDigits } from "../../lib/utils/format.ts";

test("formatPrice: two decimals from 1 up", () => {
  assert.equal(formatPrice(0), "0.00");
  assert.equal(formatPrice(1), "1.00");
  assert.equal(formatPrice(2725629.678), "2,725,629.68");
});

test("formatPrice: four significant digits below 1, two decimals at least", () => {
  assert.equal(formatPrice(0.9997), "0.9997");
  assert.equal(formatPrice(0.5), "0.50");
  assert.equal(formatPrice(0.0000312), "0.0000312");
  assert.equal(formatPrice(0.99996), "1.00");
  assert.equal(formatPrice(1e-9), "<0.00000001");
});

test("groupDigits: the integer part only", () => {
  assert.equal(groupDigits("1234567.123456789 USDC"), "1,234,567.123456789 USDC");
  assert.equal(groupDigits("−0.0001234 WETH"), "−0.0001234 WETH");
  assert.equal(groupDigits("12,345.6789 x"), "12,345.6789 x");
  assert.equal(groupDigits("999"), "999");
});

import { widenPair } from "../../lib/utils/format.ts";

test("widenPair: a before/after pair that prints alike widens to the decimals that differ", () => {
  assert.deepEqual(widenPair("55,258", "55,258", "55258.49", "55258.29"), {
    before: "55,258.49",
    after: "55,258.29",
  });
  assert.equal(widenPair("1", "2", "1", "2"), null);
  assert.equal(widenPair("5", "5", "5", "5"), null);
  assert.equal(widenPair("10.97M", "10.97M", "10967283.7", "10967284.1"), null);
});

import { formatExact } from "../../lib/utils/format.ts";

test("formatExact: float residue never prints; the token's decimals bound the fraction", () => {
  assert.equal(formatExact(133.47050099999979, 6), "133.470501");
  assert.equal(formatExact(133.47050099999979), "133.470501");
  assert.equal(formatExact(1713.0442325307367), "1,713.04423253074");
  assert.equal(formatExact(10133.465572, 6), "10,133.465572");
  assert.equal(formatExact(0.1 + 0.2), "0.3");
  assert.equal(formatExact(1.23456789, 4), "1.2346");
  assert.equal(formatExact(-1234.5), "-1,234.5");
  assert.equal(formatExact(0), "0");
  assert.equal(formatExact(1e-7), "0.0000001");
});
