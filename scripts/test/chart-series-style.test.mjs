// lib/shared/chart-series-style.ts: a line's style follows its key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DASHES, SERIES_SLOTS, nearestLine, seriesStyles } from "../../lib/shared/chart-series-style.ts";

const keys = (n) => Array.from({ length: n }, (_, i) => `1:0x${(i * 7919).toString(16).padStart(40, "0")}`);
const tag = (s) => `${s.slot}|${s.dash}`;

test("up to SERIES_SLOTS keys take distinct solid slots", () => {
  for (let n = 1; n <= SERIES_SLOTS; n++) {
    const m = seriesStyles(keys(n));
    assert.equal(new Set([...m.values()].map((s) => s.slot)).size, n);
    assert.ok([...m.values()].every((s) => s.dash === "solid"));
  }
});

test("every key on a chart gets a style of its own until the styles run out", () => {
  const n = SERIES_SLOTS * DASHES.length;
  const m = seriesStyles(keys(n));
  assert.equal(new Set([...m.values()].map(tag)).size, n);
  // Solids fill before any dash.
  const m5 = seriesStyles(keys(SERIES_SLOTS + 1));
  assert.equal([...m5.values()].filter((s) => s.dash === "solid").length, SERIES_SLOTS);
});

test("the style follows the key, whatever the order given", () => {
  const k = keys(7);
  const a = seriesStyles(k);
  const b = seriesStyles([...k].reverse());
  for (const id of k) assert.equal(tag(a.get(id)), tag(b.get(id)));
});

test("nearestLine takes the closest within reach", () => {
  const ys = [
    { id: "a", y: 10 },
    { id: "b", y: 40 },
    { id: "c", y: null },
  ];
  assert.equal(nearestLine(37, ys, 16), "b");
  assert.equal(nearestLine(25, ys, 10), null);
  assert.equal(nearestLine(12, ys, 16), "a");
});
