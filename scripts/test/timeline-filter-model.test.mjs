// components/shared/timeline-filter-model.ts: the timeline's axes as the
// listings' filter model (rails-ops ui-jobs 735). An axis that hides every
// key it offers is a set pill ("Type None"), a one-option axis hidden by a
// link keeps a pill, and a write is judged against the keys the hook holds,
// so removing the pill or Clear all undoes either, and a key no option offers. Run: npm test
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

const { timelineFilterModel, clearTimelineFilters, NONE_SHOWN } = await import(
  "../../components/shared/timeline-filter-model.ts"
);
const { groupDimensions, pillFor } = await import("../../components/shared/filter-bar/pill-model.ts");

/** A stand-in for useTimelineEvents' state: the type and asset axes over
 *  `hidden`, and a log of the writes the model makes. */
function state({ types, assets = [], hidden = [], stale = [] }) {
  const log = [];
  const opts = (keys) => keys.map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1) }));
  const visible = (keys) => new Set(keys.filter((k) => !hidden.includes(k)));
  return {
    log,
    tl: {
      hiddenKeys: {
        action: [...hidden.filter((k) => types.includes(k)), ...stale],
        asset: hidden.filter((k) => assets.includes(k)),
        counterparty: [],
        version: [],
      },
      eventOptions: opts(types),
      visibleActionKeys: visible(types),
      toggleHiddenAction: (k) => log.push(["hide", k]),
      resetHiddenActions: () => log.push(["reset", "type"]),
      assetOptions: opts(assets),
      visibleAssetKeys: visible(assets),
      toggleHiddenAsset: (k) => log.push(["hide", k]),
      resetHiddenAssets: () => log.push(["reset", "asset"]),
      versionOptions: [],
      visibleVersionKeys: new Set(),
      toggleHiddenVersion: () => {},
      resetHiddenVersions: () => {},
      counterpartyOptions: [],
      visibleCounterpartyKeys: new Set(),
      toggleHiddenCounterparty: () => {},
      resetHiddenCounterparties: () => {},
    },
  };
}

const typePill = (m) => pillFor(groupDimensions(m.dimensions, m.filters)[0], m.filters);

test("an axis with every type hidden is a set pill reading None", () => {
  const { tl } = state({ types: ["supply", "borrow"], hidden: ["supply", "borrow"] });
  const m = timelineFilterModel(tl);
  assert.deepEqual(m.filters.type, [NONE_SHOWN]);
  const pill = typePill(m);
  assert.equal(pill.state, "set");
  assert.equal(pill.value, "None");
});

test("removing the None pill, or Clear all, shows every type again", () => {
  const { tl, log } = state({ types: ["supply", "borrow"], hidden: ["supply", "borrow"] });
  const m = timelineFilterModel(tl);
  clearTimelineFilters(m);
  assert.deepEqual(log, [["reset", "type"]]);
});

test("a one-option axis a link hides keeps a pill to undo it", () => {
  const shown = timelineFilterModel(state({ types: ["supply"] }).tl);
  assert.equal(shown.dimensions.length, 0);
  const { tl, log } = state({ types: ["supply"], hidden: ["supply"] });
  const m = timelineFilterModel(tl);
  assert.equal(m.dimensions.length, 1);
  assert.equal(typePill(m).value, "None");
  m.onChange({ ...m.filters, type: [] });
  assert.deepEqual(log, [["reset", "type"]]);
});

test("a write that changes nothing the hook hides makes no write", () => {
  const { tl, log } = state({ types: ["supply", "borrow", "repay"], hidden: ["repay"] });
  const m = timelineFilterModel(tl);
  assert.deepEqual(m.filters.type, ["supply", "borrow"]);
  m.onChange({ ...m.filters, type: ["borrow", "supply"] });
  assert.deepEqual(log, []);
  m.onChange({ ...m.filters, type: ["supply"] });
  assert.deepEqual(log, [
    ["reset", "type"],
    ["hide", "borrow"],
    ["hide", "repay"],
  ]);
});

test("ticking a type on a None pill keeps that type alone", () => {
  const { tl, log } = state({ types: ["supply", "borrow"], hidden: ["supply", "borrow"] });
  const m = timelineFilterModel(tl);
  const dim = m.dimensions[0];
  m.onChange(dim.set(m.filters, [NONE_SHOWN, "borrow"]));
  assert.deepEqual(log, [
    ["reset", "type"],
    ["hide", "supply"],
  ]);
});

test("Clear all clears a hidden key no option offers", () => {
  // A leg key from a link, on a page that offers its umbrella whole.
  const { tl, log } = state({ types: ["adjustTrove", "openTrove"], stale: ["adjustTrove.repay"] });
  const m = timelineFilterModel(tl);
  assert.equal(typePill(m).state, "unset");
  clearTimelineFilters(m);
  assert.deepEqual(log, [["reset", "type"]]);
});
