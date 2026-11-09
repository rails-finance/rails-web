// lib/vaults/compare.ts: the selection, the column sort and the holder
// donut's slices (rails-ops ui-jobs 553, door 3).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareHref,
  donutSlices,
  mixedAssets,
  parseCompareParam,
  ringPath,
  sortColumns,
  toggleCompare,
} from "../../lib/vaults/compare.ts";

const A = (n) => `1:0x${String(n).padStart(40, "0")}`;

test("?v= parses to at most four keys, once each, lowercased", () => {
  assert.deepEqual(parseCompareParam(` ${A(1)},${A(1).toUpperCase().replace("X", "x")},${A(2)} `), [A(1), A(2)]);
  assert.deepEqual(parseCompareParam([A(1), A(2), A(3), A(4), A(5)].join(",")), [A(1), A(2), A(3), A(4)]);
  assert.deepEqual(parseCompareParam(""), []);
  assert.deepEqual(parseCompareParam("junk"), ["junk"]);
  assert.equal(compareHref([A(1), A(2)]), `/vaults/compare?v=${A(1)},${A(2)}`);
});

test("a fifth tick is refused; a held tick is removed", () => {
  let keys = [];
  for (const n of [1, 2, 3, 4]) keys = toggleCompare(keys, A(n)).keys;
  assert.equal(keys.length, 4);
  const fifth = toggleCompare(keys, A(5));
  assert.equal(fifth.refused, true);
  assert.deepEqual(fifth.keys, keys);
  const off = toggleCompare(keys, A(2));
  assert.equal(off.refused, false);
  assert.deepEqual(off.keys, [A(1), A(3), A(4)]);
});

const col = (id, f) => ({
  id,
  figures: { asset: "USDC", held: null, yearly30: null, range: null, withdrawable: null, ...f },
});

test("each sort orders columns by its figure, none last, ties by size", () => {
  const cols = [
    col("a", { held: 10, yearly30: 0.05, range: 0.01, withdrawable: 0.4 }),
    col("b", { held: 30, yearly30: null, range: null, withdrawable: null }),
    col("c", { held: 20, yearly30: 0.08, range: 0.002, withdrawable: 1 }),
    col("d", { held: 5, yearly30: 0.05, range: null, withdrawable: 0.4 }),
  ];
  const ids = (s) => sortColumns(cols, s).map((c) => c.id);
  assert.deepEqual(ids("size"), ["b", "c", "a", "d"]);
  assert.deepEqual(ids("yield"), ["c", "a", "d", "b"]);
  assert.deepEqual(ids("range"), ["c", "a", "b", "d"]);
  assert.deepEqual(ids("withdrawable"), ["c", "a", "d", "b"]);
  assert.deepEqual(
    cols.map((c) => c.id),
    ["a", "b", "c", "d"],
  );
});

test("size compares within one asset: assets first, A to Z", () => {
  const cols = [
    col("x", { asset: "USDT", held: 100 }),
    col("y", { asset: "USDC", held: 1 }),
    col("z", { asset: "USDC", held: 2 }),
  ];
  assert.deepEqual(
    sortColumns(cols, "size").map((c) => c.id),
    ["z", "y", "x"],
  );
  assert.equal(mixedAssets(cols), true);
  assert.equal(mixedAssets(cols.slice(1)), false);
});

test("donut: largest first, the rest one slice, turns end at one", () => {
  const s = donutSlices([
    { holder: "0xb", share: 0.1 },
    { holder: "0xa", share: 0.6 },
    { holder: "0xz", share: 0 },
  ]);
  assert.deepEqual(
    s.map((x) => x.holder),
    ["0xa", "0xb", null],
  );
  assert.ok(Math.abs(s[2].share - 0.3) < 1e-9);
  assert.equal(s[0].start, 0);
  assert.ok(Math.abs(s[s.length - 1].end - 1) < 1e-9);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].start, s[i - 1].end);
});

test("donut: at most six holders; a top set past the whole is scaled, no others", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ holder: `0x${i}`, share: 0.1 }));
  const s = donutSlices(many);
  assert.equal(s.filter((x) => x.holder != null).length, 6);
  assert.ok(Math.abs(s[s.length - 1].share - 0.4) < 1e-9);
  const over = donutSlices([
    { holder: "0xa", share: 0.7 },
    { holder: "0xb", share: 0.4 },
  ]);
  assert.equal(over.length, 2);
  assert.ok(Math.abs(over[1].end - 1) < 1e-9);
});

test("ring path: a whole ring is two halves; a sector is one closed path", () => {
  assert.equal(ringPath(60, 60, 50, 30, 0, 1).split("Z").length - 1, 2);
  const quarter = ringPath(60, 60, 50, 30, 0, 0.25);
  assert.match(quarter, /^M60 10A50 50 0 0 1 110 60L90 60A30 30 0 0 0 60 30Z$/);
});
