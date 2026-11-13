// Stars decide the profile menu (ui-jobs 652): lib/shared/sessions.ts
// `menuEntries`, `seedMenuStars`, a new entry starting starred, no cap, the
// once-per-browser seeding and an import from before 652; and the focus
// views' stars (lib/shared/focus-views.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARKS_BACKUP_VERSION,
  importBookmarks,
  loadBookmarks,
  loadSavedLinks,
  menuEntries,
  seedMenuStars,
  toggleBookmark,
  toggleSavedLink,
  toggleStar,
} from "../../lib/shared/sessions.ts";
import {
  addView,
  adoptFocus,
  menuViews,
  mergeViews,
  NO_VIEWS,
  readViews,
  seedViewStars,
  toggleViewStar,
} from "../../lib/shared/focus-views.ts";

// A browser's storage, enough for sessions.ts.
function browser(seed = {}) {
  const store = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.window = { dispatchEvent() {} };
  globalThis.Event = class {};
  return store;
}

const addr = (n) => `0x${String(n).padStart(40, "0")}`;
const wallet = (n, extra = {}) => ({
  kind: "wallet",
  key: addr(n),
  addresses: [addr(n)],
  ensNames: {},
  lastVisited: n,
  pinned: true,
  ...extra,
});
const link = (kind, n, extra = {}) => ({ kind, key: `/p/${n}`, name: `p${n}`, savedAt: n, ...extra });

test("the menu shows the starred and nothing else, every one, in order", () => {
  const rows = Array.from({ length: 8 }, (_, i) => link("view", i, i === 3 ? {} : { starred: true }));
  assert.deepEqual(
    menuEntries(rows).map((r) => r.key),
    ["/p/0", "/p/1", "/p/2", "/p/4", "/p/5", "/p/6", "/p/7"],
  );
  assert.deepEqual(menuEntries(rows.map(({ starred: _s, ...r }) => r)), []);
});

test("seeding stars each kind's first five where that kind has none, and keeps a kind's stars", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => wallet(i + 1)),
    link("position", 1),
    link("view", 1),
    link("view", 2, { starred: true }),
  ];
  const out = seedMenuStars(rows);
  assert.deepEqual(
    out.filter((r) => r.kind === "wallet").map((r) => !!r.starred),
    [true, true, true, true, true, false, false],
  );
  assert.equal(out.find((r) => r.kind === "position").starred, true);
  assert.deepEqual(
    out.filter((r) => r.kind === "view").map((r) => !!r.starred),
    [false, true],
  );
});

test("an old store is seeded once; then a new entry starts starred and stars have no cap", () => {
  const store = browser({
    "rails-saved": JSON.stringify([...Array.from({ length: 6 }, (_, i) => wallet(i + 1)), link("view", 1)]),
    "rails-bookmarks-migrated": "1",
    "rails-bookmarks-ordered": "1",
  });
  assert.deepEqual(
    loadBookmarks().map((w) => !!w.starred),
    [true, true, true, true, true, false],
  );
  assert.equal(store.get("rails-saved-stars-652"), "1");
  // The sixth takes a star: no refusal.
  assert.equal(toggleStar("wallet", addr(6)), true);
  assert.equal(menuEntries(loadBookmarks()).length, 6);
  // Unstarring the view empties its kind, and a second load does not reseed it.
  assert.equal(toggleStar("view", "/p/1"), false);
  assert.equal(menuEntries(loadSavedLinks("view")).length, 0);
  // New bookmarks of each kind arrive starred.
  toggleBookmark(addr(9), null);
  assert.equal(loadBookmarks()[0].starred, true);
  toggleSavedLink({ kind: "position", key: "/p/9", name: "p9" });
  assert.equal(loadSavedLinks("position")[0].starred, true);
  toggleSavedLink({ kind: "view", key: "/p/8", name: "p8" });
  assert.deepEqual(
    menuEntries(loadSavedLinks("view")).map((r) => r.key),
    ["/p/8"],
  );
});

test("an import from before 652 is read with its stars seeded; a current file's stars stand", () => {
  browser({ "rails-saved": "[]", "rails-saved-stars-652": "1" });
  const old = { version: 3, exportedAt: "", bookmarks: Array.from({ length: 7 }, (_, i) => link("position", i)) };
  importBookmarks(JSON.stringify(old));
  assert.equal(menuEntries(loadSavedLinks("position")).length, 5);

  browser({ "rails-saved": "[]", "rails-saved-stars-652": "1" });
  const now = {
    version: BOOKMARKS_BACKUP_VERSION,
    exportedAt: "",
    bookmarks: Array.from({ length: 7 }, (_, i) => link("position", i, i < 6 ? { starred: true } : {})),
  };
  importBookmarks(JSON.stringify(now));
  assert.equal(menuEntries(loadSavedLinks("position")).length, 6);
});

const BOLD = { chain: 1, token: "0x6440f144b7e50d6a8439336510312d2f54beb01d", builtOn: true };
const WETH = { chain: 1, token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", builtOn: true };

test("seeding skips a wallet row that is not a bookmark (pinned: false)", () => {
  const rows = [wallet(1, { pinned: false }), ...Array.from({ length: 6 }, (_, i) => wallet(i + 2))];
  assert.deepEqual(
    seedMenuStars(rows).map((r) => !!r.starred),
    [false, true, true, true, true, true, false],
  );
});

test("an import from before 652 seeds only the rows new to this browser", () => {
  browser({
    "rails-saved": JSON.stringify([link("position", 1), wallet(1)]),
    "rails-saved-stars-652": "1",
  });
  // The reader keeps position 1 and wallet 1 unstarred here.
  const old = {
    version: 3,
    exportedAt: "",
    bookmarks: [link("position", 1), link("position", 2), wallet(1, { kind: undefined }), wallet(2)],
  };
  importBookmarks(JSON.stringify(old));
  const positions = loadSavedLinks("position");
  assert.equal(positions.find((r) => r.key === "/p/1").starred, undefined);
  assert.equal(positions.find((r) => r.key === "/p/2").starred, true);
  const wallets = loadBookmarks();
  assert.equal(wallets.find((r) => r.key === addr(1)).starred, undefined);
  assert.equal(wallets.find((r) => r.key === addr(2)).starred, true);
});

test("a new focus view starts starred; a star toggles and survives a read", () => {
  let s = addView(NO_VIEWS, { assets: [WETH], chains: [] }, undefined, "a", 1);
  s = adoptFocus(s, { assets: [BOLD], chains: [] }, "B", "b", 2);
  assert.deepEqual(
    menuViews(s).map((v) => v.id),
    ["b", "a"],
  );
  s = { ...toggleViewStar(s, "b"), active: null };
  assert.deepEqual(
    menuViews(readViews(JSON.parse(JSON.stringify(s)))).map((v) => v.id),
    ["a"],
  );
});

test("the view in use is listed while it is unstarred, so Focus can be turned off", () => {
  let s = addView(NO_VIEWS, { assets: [WETH], chains: [] }, undefined, "a", 1);
  s = addView(s, { assets: [BOLD], chains: [] }, undefined, "b", 2, 1);
  s = { ...toggleViewStar(toggleViewStar(s, "a"), "b"), active: null };
  assert.deepEqual(menuViews(s), []);
  s = { ...s, active: "b" };
  assert.deepEqual(
    menuViews(s).map((v) => v.id),
    ["b"],
  );
  // Starred, it lists once; with Focus off, an unstarred view goes.
  assert.deepEqual(
    menuViews(toggleViewStar(s, "b")).map((v) => v.id),
    ["b"],
  );
  assert.deepEqual(menuViews({ ...s, active: null }), []);
});

test("a store from before 652 stars the view the menu offered", () => {
  const starredIds = (s) => s.views.filter((v) => v.starred).map((v) => v.id);
  const views = {
    views: [
      { id: "a", assets: [WETH], chains: [], savedAt: 1 },
      { id: "b", assets: [BOLD], chains: [], savedAt: 2 },
      { id: "c", assets: [], chains: [1], savedAt: 3 },
    ],
    active: "c",
  };
  assert.deepEqual(starredIds(seedViewStars(views, "b")), ["b"]);
  assert.deepEqual(starredIds(seedViewStars(views, null)), ["c"]);
  assert.deepEqual(starredIds(seedViewStars({ ...views, active: null }, "gone")), ["a"]);
  const starred = { ...views, views: views.views.map((v) => (v.id === "a" ? { ...v, starred: true } : v)) };
  assert.equal(seedViewStars(starred, "b"), starred);
});

test("an import keeps the file's view stars, or stars what a file from before 652 adds", () => {
  const file = [
    { id: "x", assets: [WETH], chains: [], savedAt: 1, starred: true },
    { id: "y", assets: [BOLD], chains: [], savedAt: 2 },
  ];
  const id = () => "n";
  assert.deepEqual(
    menuViews(mergeViews(NO_VIEWS, file, id, 5).state).map((v) => v.id),
    ["x"],
  );
  assert.deepEqual(
    menuViews(mergeViews(NO_VIEWS, file, id, 5, undefined, true).state).map((v) => v.id),
    ["x", "y"],
  );
});
