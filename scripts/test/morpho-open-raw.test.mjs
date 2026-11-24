// Morpho's open rule on a slot read (mig 515's `chain_open`): collateral above
// zero, or borrow shares above the 1e6 dust line. The wallet page's Morpho
// Base head read keeps the sweep's card, marked closed since the sweep, where
// the read says the pair is no longer open (lib/wallet/families/morpho-base.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { morphoOpenRaw } from "../../lib/morpho/position-legs.ts";

test("any collateral is open", () => {
  assert.equal(morphoOpenRaw("1", "0"), true);
  assert.equal(morphoOpenRaw("10145297660", "0"), true);
});

test("borrow shares are open only above the 1e6 dust line", () => {
  assert.equal(morphoOpenRaw("0", "1000000"), false);
  assert.equal(morphoOpenRaw("0", "1000001"), true);
});

test("a pair repaid and withdrawn is not open", () => {
  assert.equal(morphoOpenRaw("0", "0"), false);
  assert.equal(morphoOpenRaw("0", "999999"), false);
});

test("an empty or unreadable slot is not a holding", () => {
  assert.equal(morphoOpenRaw(null, undefined), false);
  assert.equal(morphoOpenRaw("", "x"), false);
});

test("a numeric serialised with a fraction reads its integer part", () => {
  assert.equal(morphoOpenRaw("0.0", "1000001.0"), true);
  assert.equal(morphoOpenRaw("0.9", "0"), false);
});
