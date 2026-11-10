// Saved Focus views (lib/shared/focus-views.ts): one state (a view in use or
// none, no empty view), "Use this view" saving a link or switching to the
// view that holds it, the edits, the tolerant read and the import's checks;
// ui-jobs 557.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  addView,
  adoptFocus,
  activeFocus,
  editActive,
  editView,
  isFocusViews,
  moveView,
  NO_VIEWS,
  readViews,
  removeView,
  renameView,
  restoreView,
  sameFocus,
} from "../../lib/shared/focus-views.ts";

const BOLD = { chain: 1, token: "0x6440f144b7e50d6a8439336510312d2f54beb01d", builtOn: true };
const WETH = { chain: 1, token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", builtOn: true };

test("a link naming nothing makes no view, and an empty focus is no view", () => {
  assert.deepEqual(adoptFocus(NO_VIEWS, { assets: [], chains: [] }, "x", "a", 1), NO_VIEWS);
  assert.deepEqual(addView(NO_VIEWS, { assets: [], chains: [] }, "x", "a", 1), NO_VIEWS);
});

test("same focus ignores order, not the built-on switch or chains", () => {
  assert.ok(sameFocus({ assets: [WETH, BOLD], chains: [8453, 1] }, { assets: [BOLD, WETH], chains: [1, 8453] }));
  assert.ok(!sameFocus({ assets: [BOLD], chains: [] }, { assets: [{ ...BOLD, builtOn: false }], chains: [] }));
  assert.ok(!sameFocus({ assets: [BOLD], chains: [] }, { assets: [BOLD], chains: [1] }));
});

test("using a link saves it first and in use, the earlier view kept", () => {
  const before = addView(NO_VIEWS, { assets: [WETH], chains: [] }, undefined, "a", 1);
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

test("rename, remove, move, and an edit that empties a view removes it", () => {
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
  assert.equal(s.active, "b");
  s = editActive(s, { assets: [], chains: [] }, "x", 3);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["a"],
  );
  assert.equal(s.active, null, "emptying the view in use turns Focus off");
  s = editView(s, "a", { assets: [], chains: [] });
  assert.deepEqual(s, NO_VIEWS);
});

test("a removed view comes back where it was, in use if it was", () => {
  let s = addView(NO_VIEWS, { assets: [WETH], chains: [] }, "W", "a", 1);
  s = addView(s, { assets: [BOLD], chains: [] }, "B", "b", 2, 1);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["a", "b"],
  );
  const gone = removeView(s, "b");
  assert.equal(gone.active, null);
  const back = restoreView(gone, s.views[1], 1, true);
  assert.deepEqual(back, s);
});

test("the store is read view by view: a malformed or empty view goes, the rest stay", () => {
  const raw = {
    views: [
      { id: "a", assets: [BOLD], chains: [], savedAt: 1 },
      { id: "b", assets: [{ chain: 1, token: "nope", builtOn: true }], chains: [], savedAt: 2 },
      { id: "c", assets: [], chains: [], savedAt: 3 },
      { id: "d", assets: [WETH], chains: [999], savedAt: 4 },
    ],
    active: "c",
  };
  const s = readViews(raw, (c) => c === 1 || c === 8453);
  assert.deepEqual(
    s.views.map((v) => v.id),
    ["a", "d"],
  );
  assert.deepEqual(s.views[1].chains, [], "an unknown chain is dropped");
  assert.equal(s.active, null);
  assert.deepEqual(readViews("junk"), NO_VIEWS);
});

test("one asset on two chains is one focus under a chain focus", () => {
  const BOLD_BASE = { chain: 8453, token: "0x03569cc076654f82679c4ba2124d64774781b01d", builtOn: true };
  const a = { ...BOLD, also: [{ chain: 8453, token: BOLD_BASE.token }] };
  const b = { ...BOLD_BASE, also: [{ chain: 1, token: BOLD.token }] };
  assert.ok(sameFocus({ assets: [a], chains: [1] }, { assets: [b], chains: [1] }));
  assert.ok(!sameFocus({ assets: [a], chains: [] }, { assets: [b], chains: [] }));
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
    { id: "f", name: "Nowhere", assets: [], chains: [999], savedAt: 9 },
  ];
  let n = 0;
  const { state, read, added } = mergeViews(
    here,
    file,
    () => `new${n++}`,
    9,
    (c) => c === 1 || c === 8453,
  );
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
