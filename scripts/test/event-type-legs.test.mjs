// lib/shared/event-filter-helpers.ts: an umbrella event type offered as its
// legs (rails-ops ui-jobs 735). An adjust passes while any of its legs is
// shown; a hidden umbrella key (a link from before the legs) hides them all;
// a folder whose header counts the umbrella cannot say how many pass while
// only some legs are hidden. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { getEventActionLegs, actionHidden, actionLegParent, actionLabel } = await import(
  "../../lib/shared/event-filter-helpers.ts"
);
const { folderMatchCount } = await import("../../lib/shared/timeline-folder-filter.ts");

/** A Liquity V2 adjust moving `coll` and `debt` (pre-scaled, as the context carries them). */
const adjust = (coll, debt) => ({
  id: `a-${coll}-${debt}`,
  timestamp: 1,
  actionType: "adjustTrove",
  context: {
    protocol: "liquity-v2-troves",
    data: {
      collateralType: "WETH",
      operation: "adjustTrove",
      troveOperation: { collChangeFromOperation: coll, debtChangeFromOperation: debt },
    },
  },
});

test("an adjust's legs are the row's verbs", () => {
  assert.deepEqual(getEventActionLegs(adjust(2, 500)), ["adjustTrove.addColl", "adjustTrove.borrow"]);
  assert.deepEqual(getEventActionLegs(adjust(-1, -300)), ["adjustTrove.withdrawColl", "adjustTrove.repay"]);
  assert.deepEqual(getEventActionLegs(adjust(0, -300)), ["adjustTrove.repay"]);
  assert.equal(actionLegParent("adjustTrove.repay"), "adjustTrove");
  assert.equal(actionLabel("adjustTrove.addColl"), "Added collateral");
});

test("an adjust passes while any of its legs is shown, and once", () => {
  const e = adjust(2, 500);
  assert.equal(actionHidden(e, new Set(["adjustTrove.addColl"])), false);
  assert.equal(actionHidden(e, new Set(["adjustTrove.addColl", "adjustTrove.borrow"])), true);
  // A link from before the legs hides the umbrella whole.
  assert.equal(actionHidden(e, new Set(["adjustTrove"])), true);
});

test("a folder counting the umbrella cannot say how many pass while it is split", () => {
  const folder = {
    count: 10,
    other: 0,
    counts: [{ key: "adjustTrove", count: 10 }],
    legs: [],
    byDay: [],
    firstAt: 0,
    lastAt: 1,
  };
  const axes = {
    hiddenActions: new Set(),
    hiddenAssets: new Set(),
    hiddenCounterparties: new Set(),
    dateRange: null,
  };
  assert.equal(folderMatchCount(folder, axes), 10);
  assert.equal(folderMatchCount(folder, { ...axes, splitActions: new Set(["adjustTrove"]) }), null);
});
