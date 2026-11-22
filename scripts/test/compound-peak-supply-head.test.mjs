// A closed Compound V3 card's supply-side peak head (rails-ops ui-jobs 803):
// the count is the collateral assets alone, the lent base a captioned line
// after them; a wallet that only lent the base reads "supply".
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compoundPeakSupplyHead } from "../../lib/compound/peak-supply-head.ts";

const kinds = (h) => h.lines.map((l) => (l.kind === "collateral" ? `c${l.index}` : l.kind));

test("two or more collaterals with a lent base: the count is the collaterals, the base listed after its caption", () => {
  const h = compoundPeakSupplyHead(3, 120.5);
  assert.equal(h.label, "collateral");
  assert.equal(h.count, 3);
  assert.deepEqual(kinds(h), ["c0", "c1", "c2", "caption", "base"]);
});

test("two collaterals, no base: counted, no caption", () => {
  const h = compoundPeakSupplyHead(2, 0);
  assert.equal(h.count, 2);
  assert.deepEqual(kinds(h), ["c0", "c1"]);
});

test("one collateral plus the base: no count, the amount and the captioned base as today", () => {
  const h = compoundPeakSupplyHead(1, 40);
  assert.equal(h.label, "collateral");
  assert.equal(h.count, null);
  assert.deepEqual(kinds(h), ["c0", "caption", "base"]);
});

test("base only: a supply head with the base line, no caption and no count", () => {
  const h = compoundPeakSupplyHead(0, 40);
  assert.equal(h.label, "supply");
  assert.equal(h.count, null);
  assert.deepEqual(kinds(h), ["base"]);
});

test("nothing recorded: no lines", () => {
  const h = compoundPeakSupplyHead(0, 0);
  assert.equal(h.count, null);
  assert.deepEqual(h.lines, []);
});
