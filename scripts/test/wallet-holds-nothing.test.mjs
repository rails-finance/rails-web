// lib/wallet/holds-nothing.ts: a stored open position an owner read leaves out
// holds nothing at the index head the route states, only where that head is at
// or past the stored read's block; a route that states no head gives no block.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { holdsNothingSince } from "../../lib/wallet/holds-nothing.ts";

test("a stated index head at or past the stored read counts", () => {
  assert.equal(holdsNothingSince(26_478_900, 26_478_853), 26_478_900);
  assert.equal(holdsNothingSince(26_478_853, 26_478_853), 26_478_853);
});

test("a stated index head below the stored read does not", () => {
  assert.equal(holdsNothingSince(21_000_000, 26_478_853), undefined);
});

test("a route that states no index head gives no block", () => {
  assert.equal(holdsNothingSince(undefined, 26_478_853), undefined);
});

test("a stored read with no block gives no block", () => {
  assert.equal(holdsNothingSince(26_478_900, undefined), undefined);
});
