// A receipt's classes count as its content (rails-ops ui-jobs 669): when the
// live read lands with the same figure and words, a leaf's class moving from
// Indexed to State must re-register the receipt, and an identical entry must
// not (so <Prov>'s every-render registration cannot loop). The rule is
// lib/shared/prov-signature.ts, the one ReceiptRegistry runs.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { entrySig } = await import("../../lib/shared/prov-signature.ts");

const entry = (collClass) => ({
  id: "r1",
  value: "1,273,797.52",
  display: "$1,273,797.52",
  symbol: null,
  source: null,
  info: {
    kind: "chain-derived",
    summary: "Collateral value in USD — the collateral multiplied by Liquity's current price for WETH.",
    formula: "collateral × price",
    inputs: [
      { label: "collateral", value: "660.28 WETH", kind: "chain", pclass: collClass },
      { label: "price", value: "$1,929", kind: "chain-derived", pclass: "oracle" },
    ],
  },
});

test("a leaf's class moving from indexed to state changes the signature", () => {
  assert.notEqual(entrySig(entry("indexed")), entrySig(entry("state")));
});

test("an identical entry signs the same, so re-registering it is a no-op", () => {
  assert.equal(entrySig(entry("state")), entrySig(entry("state")));
});

test("the value's class, a definition marker and a scaling raw count too", () => {
  const base = entry("state");
  const sig = entrySig(base);
  assert.notEqual(sig, entrySig({ ...base, info: { ...base.info, pclass: "oracle" } }));
  assert.notEqual(sig, entrySig({ ...base, info: { ...base.info, scaling: { raw: "1", places: 18, why: "x" } } }));
  const def = {
    ...base,
    info: { ...base.info, inputs: [base.info.inputs[0], { ...base.info.inputs[1], definition: true }] },
  };
  assert.notEqual(sig, entrySig(def));
});
