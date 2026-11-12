// RevealTip and the asset popover under the provenance inspector (ui-jobs 623):
// a tip gives its press to the trace only inside a pickable value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICKABLE_SELECTOR, tipYieldsToTrace } from "../../lib/shared/tip-yields.ts";

/** A stand-in element: `closest` answers the pickable selector when it sits in a pickable <Prov>. */
const el = (inPickable) => ({
  closest: (sel) => (sel === PICKABLE_SELECTOR && inPickable ? {} : null),
});

test("a label tip opens with the inspector armed", () => {
  assert.equal(tipYieldsToTrace(el(false), true), false);
});

test("a tip inside a pickable figure gives its press to the receipt", () => {
  assert.equal(tipYieldsToTrace(el(true), true), true);
});

test("disarmed, every tip opens", () => {
  assert.equal(tipYieldsToTrace(el(true), false), false);
  assert.equal(tipYieldsToTrace(el(false), false), false);
});

test("an unmounted tip yields nothing", () => {
  assert.equal(tipYieldsToTrace(null, true), false);
});
