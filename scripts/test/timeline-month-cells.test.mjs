// lib/shared/timeline-month-cells.ts: which months of the Date panel's grid a
// click may filter (rails-ops ui-jobs 764). A month is filtered on the page
// only where the loaded rows hold all of it; any other month is read from the
// index as a segment, or refused as not loaded. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { monthCountIsFloor, monthIdxOf, monthLoaded, monthWhollyHeld } from "../../lib/shared/timeline-month-cells.ts";

const day = (iso) => Date.parse(`${iso}T00:00:00Z`) / 1000;
const jun = monthIdxOf(day("2025-06-01"));
const jul = monthIdxOf(day("2025-07-01"));
const may = monthIdxOf(day("2025-05-01"));

test("with the index's days: a month is held only where every day of it is", () => {
  const life = new Map([
    [day("2025-05-20"), 3],
    [day("2025-06-02"), 4],
    [day("2025-06-20"), 1],
    [day("2025-07-04"), 2],
  ]);
  // The page holds 15 Jun onward: June is held in part, so it is a read.
  const held = [day("2025-06-15") + 3600, day("2025-07-04") + 7200];
  assert.equal(monthWhollyHeld(jul, life, held), true);
  assert.equal(monthWhollyHeld(jun, life, held), false);
  assert.equal(monthWhollyHeld(may, life, held), false);
  // Holding from 2 Jun (mid-day): the day counts whole, so June is held.
  assert.equal(monthWhollyHeld(jun, life, [day("2025-06-02") + 50_000, held[1]]), true);
  // No held span: the page holds the life.
  assert.equal(monthWhollyHeld(may, life, null), true);
});

test("without the index's days: a whole history is loaded in full", () => {
  const s = { windowMinIdx: jun, whole: true, priorDays: null };
  assert.equal(monthLoaded(jun, s), true);
  assert.equal(monthLoaded(jul, s), true);
  assert.equal(monthCountIsFloor(jun, s), false);
});

test("a cut list with no opening balance: its oldest month is refused, and its count a floor", () => {
  const s = { windowMinIdx: jun, whole: false, priorDays: null };
  assert.equal(monthLoaded(jun, s), false);
  assert.equal(monthLoaded(jul, s), true);
  assert.equal(monthLoaded(may, s), false);
  assert.equal(monthCountIsFloor(jun, s), true);
  assert.equal(monthCountIsFloor(jul, s), false);
});

test("a window with an opening balance: the cut month is loaded only where the opening holds none of it", () => {
  const inJune = { windowMinIdx: jun, whole: false, priorDays: [{ key: String(day("2025-06-03")), count: 5 }] };
  assert.equal(monthLoaded(jun, inJune), false);
  assert.equal(monthCountIsFloor(jun, inJune), false);
  const before = { windowMinIdx: jun, whole: false, priorDays: [{ key: String(day("2025-05-28")), count: 5 }] };
  assert.equal(monthLoaded(jun, before), true);
  assert.equal(monthLoaded(may, before), false);
});
