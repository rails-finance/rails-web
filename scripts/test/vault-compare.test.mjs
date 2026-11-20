// lib/vaults/compare.ts: the selection, the Differences rule and the holder
// donut's slices (rails-ops ui-jobs 553 door 3, 779).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareHref,
  differs,
  donutSlices,
  parseCompareParam,
  pickedKeys,
  ringPath,
} from "../../lib/vaults/compare.ts";

const A = (n) => `1:0x${String(n).padStart(40, "0")}`;

test("?v= parses to at most four keys, once each, lowercased", () => {
  assert.deepEqual(parseCompareParam(` ${A(1)},${A(1).toUpperCase().replace("X", "x")},${A(2)} `), [A(1), A(2)]);
  assert.deepEqual(parseCompareParam([A(1), A(2), A(3), A(4), A(5)].join(",")), [A(1), A(2), A(3), A(4)]);
  assert.deepEqual(parseCompareParam(""), []);
  assert.deepEqual(parseCompareParam("junk"), ["junk"]);
  assert.equal(compareHref([A(1), A(2)]), `/vaults/compare?v=${A(1)},${A(2)}`);
});

test("the picker's slots: filled ones in order, once each, at most four", () => {
  assert.deepEqual(pickedKeys([A(2), null, A(1), A(2)]), [A(2), A(1)]);
  assert.deepEqual(pickedKeys([A(1), A(2), A(3), A(4), A(5)]), [A(1), A(2), A(3), A(4)]);
  assert.deepEqual(pickedKeys([null, null]), []);
});

test("a fact differs where any column prints another value, an absent one included", () => {
  assert.equal(differs(["USDC", "USDC", "USDC"]), false);
  assert.equal(differs(["USDC", "USDT"]), true);
  assert.equal(differs(["10%", null]), true);
  assert.equal(differs([null, null]), false);
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
