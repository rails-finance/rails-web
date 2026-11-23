// A closed Compound V3 card's supply-side peak head (rails-ops ui-jobs 803):
// "Peak collateral" leading with the asset picked by value (two or more) or
// the one asset, the lent base a captioned line after them; a wallet that
// only lent the base reads "Peak supplied" and leads with the base.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compoundPeakSupplyHead } from "../../lib/compound/peak-supply-head.ts";

const kinds = (h) => h.lines.map((l) => (l.kind === "collateral" ? `c${l.index}` : l.kind));

test("two or more collaterals with a lent base: picked by value, the base listed after its caption", () => {
  const h = compoundPeakSupplyHead(3, 120.5);
  assert.equal(h.label, "collateral");
  assert.deepEqual(h.lead, { kind: "pick" });
  assert.deepEqual(kinds(h), ["c0", "c1", "c2", "caption", "base"]);
});

test("two collaterals, no base: picked by value, no caption", () => {
  const h = compoundPeakSupplyHead(2, 0);
  assert.deepEqual(h.lead, { kind: "pick" });
  assert.deepEqual(kinds(h), ["c0", "c1"]);
});

test("one collateral plus the base: the collateral leads, the base a captioned line", () => {
  const h = compoundPeakSupplyHead(1, 40);
  assert.equal(h.label, "collateral");
  assert.deepEqual(h.lead, { kind: "collateral", index: 0 });
  assert.deepEqual(kinds(h), ["c0", "caption", "base"]);
});

test("base only: a supplied head leading with the base, no caption", () => {
  const h = compoundPeakSupplyHead(0, 40);
  assert.equal(h.label, "supplied");
  assert.deepEqual(h.lead, { kind: "base" });
  assert.deepEqual(kinds(h), ["base"]);
});

test("nothing recorded: no lines and nothing to lead with", () => {
  const h = compoundPeakSupplyHead(0, 0);
  assert.equal(h.lead, null);
  assert.deepEqual(h.lines, []);
});
