// A receipt's formula names only operands its input rows carry (rails-ops
// ui-jobs 618): "Debt after this event in USD" named the token ("BOLD × $1")
// beside an input labelled "debt", and the dev build flagged "Untraced input:
// BOLD". The rule is lib/shared/prov-untraced.ts, the one the receipt runs.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { untracedInputs } = await import("../../lib/shared/prov-untraced.ts");
const Q = await import("../../lib/liquity/trove-queue-provenance.ts");
const F = await import("../../lib/shared/flows-timeline-provenance.ts");
const E = await import("../../lib/liquity/economics-provenance.ts");

// The receipt's leaves: its inputs less the block and tx chips (classifyValue).
const untraced = (p) =>
  untracedInputs(
    p.formula,
    (p.inputs ?? []).filter((i) => !["block", "tx"].includes(i.label.toLowerCase())),
  );

test("the rule flags a token the inputs do not carry", () => {
  assert.deepEqual(untraced({ formula: "BOLD × $1", inputs: [{ label: "debt" }] }), ["BOLD"]);
  assert.deepEqual(untraced({ formula: "shares × rate", inputs: [{ label: "borrowShares" }, { label: "rate" }] }), []);
});

test("the debt's dollars at face trace every operand, for every Liquity family's symbol", () => {
  for (const sym of ["BOLD", "LUSD", "ebUSD", "USDaf", "BD"])
    for (const which of ["before", "after"]) {
      const p = F.faceUsdProv(sym, "1,000", which);
      assert.deepEqual(untraced(p), [], `${sym} ${which}`);
      assert.equal(p.kind, "derived");
    }
});

test("the queue receipts read as State and trace their operands", () => {
  for (const t of ["WETH", "wstETH", "rETH"]) {
    const ps = [Q.troveDebtInFrontProv(t), Q.troveTrovesAheadProv(t), Q.troveQueueShareProv(t)];
    for (const p of ps) {
      assert.equal(p.pclass, "state");
      assert.deepEqual(untraced(p), []);
      assert.match(p.via, /Rails's backend/);
    }
    for (const i of ps[2].inputs) assert.equal(i.pclass, "state");
  }
});

test("the Lifetime flows receipts trace their operands", () => {
  const all = Object.entries(E).flatMap(([k, v]) => (typeof v === "function" ? [[k, v("WETH")]] : [[k, v]]));
  assert.ok(all.length > 10);
  for (const [k, p] of all) assert.deepEqual(untraced(p), [], k);
  for (const side of ["collateral", "debt"]) {
    for (const p of [
      F.flowRemainderProv("Remainder", side, "the event"),
      F.flowOpeningProv("Opening", side),
      F.flowInterestUsdProv("Interest", "the event"),
      F.ledgerAssetUsdProv("Interest", "WETH", "the event", "interest"),
      F.ledgerAssetUsdProv("Market move", "WETH", "the event", "market"),
    ])
      assert.deepEqual(untraced(p), []);
  }
});
