// A definition leaf carries no class (rails-ops ui-jobs 669): the $1 face of a
// Liquity-family stablecoin is a constant the protocol defines, not a read, so
// "Debt after this event in USD" summarises as its read input's class alone.
// The rule is lib/shared/prov-class.ts, the one the receipt and the inspector's
// head run.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const C = await import("../../lib/shared/prov-class.ts");
const F = await import("../../lib/shared/flows-timeline-provenance.ts");

test("a derived figure with one Emitted input and one definition leaf summarises as Emitted", () => {
  const leaves = [
    { label: "debt", kind: "chain" },
    { label: "face", kind: "derived", definition: true },
  ];
  assert.equal(C.weakestClass(leaves), "emitted");
  assert.deepEqual(C.involvedClasses(leaves), ["emitted"]);
});

test("a leaf without the marker still counts, so an unmarked receipt reads as before", () => {
  const leaves = [
    { label: "debt", kind: "chain" },
    { label: "par", kind: "derived" },
  ];
  assert.equal(C.weakestClass(leaves), "indexed");
  assert.deepEqual(C.involvedClasses(leaves), ["emitted", "indexed"]);
});

test("a receipt of definitions alone has no read class", () => {
  assert.equal(C.weakestClass([{ label: "face", kind: "derived", definition: true }]), null);
  assert.deepEqual(C.involvedClasses([{ label: "face", kind: "derived", definition: true }]), []);
});

test("the event's debt in USD at face is Emitted, for every Liquity family's symbol", () => {
  for (const sym of ["BOLD", "LUSD", "ebUSD", "USDaf", "BD"])
    for (const which of ["before", "after"]) {
      const p = F.faceUsdProv(sym, "1,000", which);
      assert.deepEqual(C.involvedClasses(p.inputs), ["emitted"], `${sym} ${which}`);
      assert.ok(
        p.inputs.some((i) => i.label === "face" && i.definition),
        `${sym} ${which}: face leaf kept`,
      );
    }
});
