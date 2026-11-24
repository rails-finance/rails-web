// lib/wallet/holds-nothing.ts: a stored open position a holder read leaves out
// holds nothing at the read's head block only where that block is at or past
// the stored read's. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { holdsNothingSince } from "../../lib/wallet/holds-nothing.ts";

test("a head block at or past the stored read counts", () => {
  assert.equal(holdsNothingSince(26_478_900, 26_478_853), 26_478_900);
  assert.equal(holdsNothingSince(26_478_853, 26_478_853), 26_478_853);
});

test("a head block below the stored read does not", () => {
  assert.equal(holdsNothingSince(21_000_000, 26_478_853), undefined);
});

test("an unknown block on either side does not", () => {
  assert.equal(holdsNothingSince(undefined, 26_478_853), undefined);
  assert.equal(holdsNothingSince(26_478_900, undefined), undefined);
});
