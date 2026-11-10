// Saved Focus views (lib/shared/focus-views.ts): the first read from the older
// single focus, "Use this view" saving a link or switching to the view that
// holds it, and the edits; ui-jobs 557.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptFocus,
  activeFocus,
  editActive,
  isFocusViews,
  migrateFocus,
  moveView,
  NO_VIEWS,
  pruneEmpty,
  removeView,
  renameView,
  sameFocus,
} from "../../lib/shared/focus-views.ts";

const BOLD = { chain: 1, token: "0x6440f144b7e50d6a8439336510312d2f54beb01d", builtOn: true };
const WETH = { chain: 1, token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", builtOn: true };

test("an older focus that is on becomes one view in use; off, none", () => {
  const s = migrateFocus({ assets: [WETH, BOLD], chains: [] }, "a", 1);
  assert.equal(s.views.length, 1);
  assert.equal(s.active, "a");
  assert.equal(s.views[0].name, undefined);
  assert.ok(isFocusViews(s));
  assert.deepEqual(migrateFocus({ assets: [], chains: [] }, "a", 1), NO_VIEWS);
  assert.deepEqual(migrateFocus(null, "a", 1), NO_VIEWS);
});

test("same focus ignores order, not the built-on switch or chains", () => {
  assert.ok(sameFocus({ assets: [WETH, BOLD], chains: [8453, 1] }, { assets: [BOLD, WETH], chains: [1, 8453] }));
  assert.ok(!sameFocus({ assets: [BOLD], chains: [] }, { assets: [{ ...BOLD, builtOn: false }], chains: [] }));
  assert.ok(!sameFocus({ assets: [BOLD], chains: [] }, { assets: [BOLD], chains: [1] }));
});

test("using a link saves it first and in use, the earlier view kept", () => {
  const before = migrateFocus({ assets: [WETH], chains: [] }, "a", 1);
  const s = adoptFocus(before, { assets: [BOLD], chains: [1] }, " My stables ", "b", 2);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["b", "a"],
  );
  assert.equal(s.active, "b");
  assert.equal(s.views[0].name, "My stables");
});

test("using a link already saved switches to it, no second copy, its name kept or filled", () => {
  let s = adoptFocus(NO_VIEWS, { assets: [WETH, BOLD], chains: [] }, undefined, "a", 1);
  s = adoptFocus(s, { assets: [BOLD], chains: [] }, "Mine", "b", 2);
  const again = adoptFocus(s, { assets: [BOLD, WETH], chains: [] }, "Shared name", "c", 3);
  assert.equal(again.views.length, 2);
  assert.equal(again.active, "a");
  assert.equal(again.views.find((v) => v.id === "a").name, "Shared name");
  const named = adoptFocus(again, { assets: [BOLD], chains: [] }, "Other", "d", 4);
  assert.equal(named.views.find((v) => v.id === "b").name, "Mine");
});

test("an edit goes into the view in use, or makes one when none is", () => {
  let s = editActive(NO_VIEWS, { assets: [], chains: [] }, "a", 1);
  assert.deepEqual(s, NO_VIEWS);
  s = editActive(NO_VIEWS, { assets: [BOLD], chains: [] }, "a", 1);
  assert.equal(s.active, "a");
  s = editActive(s, { assets: [BOLD, WETH], chains: [] }, "b", 2);
  assert.equal(s.views.length, 1);
  assert.deepEqual(activeFocus(s).assets, [BOLD, WETH]);
});

test("rename, remove, move and prune", () => {
  let s = adoptFocus(NO_VIEWS, { assets: [WETH], chains: [] }, undefined, "a", 1);
  s = adoptFocus(s, { assets: [BOLD], chains: [] }, "B", "b", 2);
  s = renameView(s, "a", "  Wrapped ");
  assert.equal(s.views.find((v) => v.id === "a").name, "Wrapped");
  s = renameView(s, "a", "");
  assert.equal("name" in s.views.find((v) => v.id === "a"), false);
  s = moveView(s, "b", 5);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["a", "b"],
  );
  s = editActive(s, { assets: [], chains: [] }, "x", 3);
  s = pruneEmpty(s);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["a"],
  );
  assert.equal(s.active, null);
  s = removeView(s, "a");
  assert.deepEqual(s, NO_VIEWS);
});

test("an import adds views the reader lacks, names an unnamed match, keeps the view in use", async () => {
  const { mergeViews } = await import("../../lib/shared/focus-views.ts");
  const USDC = { chain: 1, token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", builtOn: false };
  const here = { views: [{ id: "a", assets: [BOLD], chains: [], savedAt: 1 }], active: "a" };
  const file = [
    { id: "a", name: "Bold things", assets: [BOLD], chains: [], savedAt: 5 },
    { id: "a", name: "My stables", assets: [USDC], chains: [8453], savedAt: 6 },
    { id: "z", name: "Dup", assets: [USDC], chains: [8453], savedAt: 7 },
    { id: "e", assets: [], chains: [], savedAt: 8 },
    { nonsense: true },
  ];
  let n = 0;
  const { state, read, added } = mergeViews(here, file, () => `new${n++}`, 9);
  assert.equal(read, 2);
  assert.equal(added, 1);
  assert.equal(state.active, "a");
  assert.equal(state.views.length, 2);
  assert.equal(state.views[0].name, "Bold things");
  assert.equal(state.views[1].name, "My stables");
  assert.equal(state.views[1].id, "new0");
  assert.ok(isFocusViews(state));
  assert.deepEqual(
    mergeViews(here, undefined, () => "x", 1),
    { state: here, read: 0, added: 0 },
  );
});

test("an import never renames a view the reader named", async () => {
  const { mergeViews } = await import("../../lib/shared/focus-views.ts");
  const here = { views: [{ id: "a", name: "Mine", assets: [WETH], chains: [], savedAt: 1 }], active: null };
  const { state } = mergeViews(
    here,
    [{ id: "b", name: "Theirs", assets: [WETH], chains: [], savedAt: 2 }],
    () => "x",
    3,
  );
  assert.equal(state.views[0].name, "Mine");
  assert.equal(state.active, null);
});
