// lib/shared/timeline-dates.ts: how a position timeline picks a day (rails-ops
// ui-jobs 764). The Date pill is drawn where no Lifetime flows chart ties to
// the timeline, held back while the page's panel reads, and gone once the
// chart's cursor ties. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  flowsPatch,
  resetMonthOnTie,
  tieDropped,
  timelineDates,
  withoutLoneTo,
} from "../../lib/shared/timeline-dates.ts";

const cursor = { endTs: 1_700_000_000, word: "14 Nov '23", live: false };

test("no store on the page: the pill from the first render", () => {
  // Sky Savings, an Alchemix V2 position.
  assert.equal(timelineDates(null, false), "pill");
  assert.equal(timelineDates(null, true), "pill");
});

test("a store, before hydration or while the panel reads: waiting", () => {
  assert.equal(timelineDates({ cursor: null, flows: null }, false), "waiting");
  assert.equal(timelineDates({ cursor: null, flows: "waiting" }, false), "waiting");
  assert.equal(timelineDates({ cursor: null, flows: "waiting" }, true), "waiting");
});

test("the chart's cursor ties: chart, whatever the panel says", () => {
  assert.equal(timelineDates({ cursor, flows: "waiting" }, true), "chart");
  assert.equal(timelineDates({ cursor, flows: "settled" }, true), "chart");
  assert.equal(timelineDates({ cursor, flows: null }, false), "chart");
});

test("settled with no cursor, or no panel said after hydration: the pill", () => {
  // A one-day life, the price chart alone, a bars-only scrubber, no panel.
  assert.equal(timelineDates({ cursor: null, flows: "settled" }, true), "pill");
  assert.equal(timelineDates({ cursor: null, flows: null }, true), "pill");
});

test("useFlowsWaiting's steps: waiting before paint, settled after effects and on unmount", () => {
  // Mount while reading: the layout step says waiting; the effect step leaves it.
  assert.equal(flowsPatch("layout", true, null), "waiting");
  assert.equal(flowsPatch("effect", true, "waiting"), null);
  // The read lands: the layout step says nothing (the cursor's effect comes
  // first), the effect step settles.
  assert.equal(flowsPatch("layout", false, "waiting"), null);
  assert.equal(flowsPatch("effect", false, "waiting"), "settled");
  // Mount already settled (a page whose flows are in hand).
  assert.equal(flowsPatch("layout", false, null), null);
  assert.equal(flowsPatch("effect", false, null), "settled");
  // Unmount while reading settles, so a page left waiting never holds the pill.
  assert.equal(flowsPatch("unmount", false, "waiting"), "settled");
  assert.equal(flowsPatch("unmount", false, "settled"), null);
  // Nothing written where the store already says it.
  assert.equal(flowsPatch("layout", true, "waiting"), null);
});

test("the tie drops only from chart", () => {
  assert.equal(tieDropped("chart", "pill"), true);
  assert.equal(tieDropped("chart", "waiting"), true);
  assert.equal(tieDropped("chart", "chart"), false);
  assert.equal(tieDropped("waiting", "chart"), false);
  assert.equal(tieDropped("waiting", "pill"), false);
  assert.equal(tieDropped("pill", "pill"), false);
});

test("on the tie, a month the grid read or is reading goes; the cut's month stays", () => {
  const base = { tied: true, month: null, loading: null, askedByCut: false };
  assert.equal(resetMonthOnTie({ ...base, month: 24_300 }), true);
  assert.equal(resetMonthOnTie({ ...base, loading: 24_301 }), true);
  assert.equal(resetMonthOnTie({ ...base, month: 24_300, askedByCut: true }), false);
  assert.equal(resetMonthOnTie({ ...base, loading: 24_301, askedByCut: true }), false);
  assert.equal(resetMonthOnTie({ ...base, tied: false, month: 24_300 }), false);
  assert.equal(resetMonthOnTie(base), false);
});

test("a lone ?to= goes once the timeline settles on the pill", () => {
  assert.equal(withoutLoneTo("?to=2025-06-15", "pill"), "");
  assert.equal(withoutLoneTo("?hide=Transfer&to=2025-06-15", "pill"), "?hide=Transfer");
  // A range stays; so does a lone `to` while waiting or tied (the chart's cut).
  assert.equal(withoutLoneTo("?from=2025-06-01&to=2025-06-15", "pill"), null);
  assert.equal(withoutLoneTo("?to=2025-06-15", "waiting"), null);
  assert.equal(withoutLoneTo("?to=2025-06-15", "chart"), null);
  assert.equal(withoutLoneTo("?hide=Transfer", "pill"), null);
  assert.equal(withoutLoneTo("", "pill"), null);
});
