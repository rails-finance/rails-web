// lib/shared/event-filter-helpers.ts: an umbrella event type offered as its
// legs (rails-ops ui-jobs 735). An adjust passes while any of its legs is
// shown, one with no leg only while every leg is kept, and a hidden umbrella
// key (a link from before the legs) hides them all. Run: npm test
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

const { getEventActionLegs, actionHidden, actionLegParent, actionLabel, settleActionHidden, LEGLESS } = await import(
  "../../lib/shared/event-filter-helpers.ts"
);

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

test("the hidden set settles against the legs a page offers", () => {
  const offered = new Map([["adjustTrove", ["adjustTrove.addColl", "adjustTrove.repay"]]]);
  // Some legs hidden: the leg-less adjusts go too, the umbrella stays.
  const some = settleActionHidden(new Set(["adjustTrove.repay"]), offered);
  assert.ok(some.has("adjustTrove" + LEGLESS));
  assert.ok(!some.has("adjustTrove"));
  // Every offered leg hidden: the umbrella is hidden, so a folder header
  // keyed by it reads hidden as loose events do.
  const all = settleActionHidden(new Set(["adjustTrove.addColl", "adjustTrove.repay"]), offered);
  assert.ok(all.has("adjustTrove"));
  // The umbrella from an older link hides each leg.
  const link = settleActionHidden(new Set(["adjustTrove"]), offered);
  assert.ok(link.has("adjustTrove.addColl") && link.has("adjustTrove.repay"));
});

test("an adjust with no leg shows only while every leg is kept", () => {
  // An adjustTrove whose row carries no TroveOperation figures.
  const none = { ...adjust(0, 0), context: { ...adjust(0, 0).context } };
  none.context.data = { collateralType: "WETH", operation: "adjustTrove" };
  assert.equal(getEventActionLegs(none), null);
  const offered = new Map([["adjustTrove", ["adjustTrove.addColl", "adjustTrove.repay"]]]);
  assert.equal(actionHidden(none, settleActionHidden(new Set(), offered)), false);
  assert.equal(actionHidden(none, settleActionHidden(new Set(["adjustTrove.addColl"]), offered)), true);
});
