// lib/liquity-v2/redeemer-flows.ts: a redeemer's chart from its redemption
// days and BOLD's daily price (rails-server /api/liquity-v2/redeemer/:address/days
// and /api/liquity-v2/bold-prices/daily), and what the shared chart makes of it:
// the one-day rule, no state card between events, the row's rate figure. The
// days and prices are kings-cross's answers for 0xa07c…ab9e and 0xe8ad…9bc3,
// 19 Nov 2026, trimmed. Run: npm test

import { test } from "node:test";
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

const { BOLD_UNREAD_TEXT, boldPriceSeries, redeemerFocus, redeemerTimeline, unfilledThrough } = await import(
  "../../lib/liquity-v2/redeemer-flows.ts"
);
const { buildFlowModel } = await import("../../lib/shared/flows-timeline.ts");
const { flowsLife } = await import("../../lib/shared/flows-combined.ts");
const { flowMoment } = await import("../../lib/shared/flow-moment.ts");
const { fmtRateNum } = await import("../../lib/liquity/figure-format.ts");

const DAYS = [
  [20727, 40, 9, "120000000000000000000000"],
  [20729, 12, 3, "30500000000000000000000"],
  [20774, 6, 2, "48759439308214644366219"],
];
const PRICES = {
  source: "curve-usdc-bold",
  pool: "0xefc6516323fbd28e80b85a497b65a86243a54b3e",
  quoteSymbol: "USDC",
  from: 20727,
  to: 20774,
  filledFrom: { block: 23664495, day: 20387 },
  obs: [
    [20727, 0.9959146016197291, 26099664],
    [20728, 0.9954085616863263, 26107342],
    [20774, 0.9988463297909127, 26438006],
  ],
};
const ROW = {
  collateral_type: "WETH",
  trove_id: "1",
  bold_raw: "1000000000000000000000",
  coll_raw: "1",
  rate_raw: "5000000000000000",
  block_number: "26438006",
  block_timestamp: String(20774 * 86400 + 100),
  transaction_hash: "0xabc",
  transaction_index: 1,
  log_index: 7,
  contract_address: "0x1",
};

test("the chart stands alone: no bars, the span from the first redemption day to the last, closed there", () => {
  const t = redeemerTimeline(DAYS, PRICES);
  assert.equal(t.chartAlone, true);
  assert.equal(t.days.length, 3);
  assert.deepEqual(
    t.days.map((d) => [d.day, d.events, d.txs, d.tick]),
    [
      [20727, 40, 9, "redemption"],
      [20729, 52, 12, "redemption"],
      [20774, 58, 14, "redemption"],
    ],
  );
  assert.equal(t.today, 20775);
  assert.equal(t.totalEvents, 58);
  assert.equal(t.totalTxs, 14);
  assert.equal(t.words.close, "Last redemption");
  // Nothing is held: the life closes on its last day.
  assert.ok(t.days.every((d) => d.balances.every((b) => b.amount === 0)));
});

test("the line is BOLD's daily price at each point's block, inside the span", () => {
  const line = redeemerTimeline(DAYS, PRICES).shareLine;
  assert.equal(line.unitLabel, "USD");
  assert.equal(line.digits, 4);
  assert.deepEqual(line.series.points, PRICES.obs);
  assert.match(line.series.here.read, /at the end of block \{block\}/);
  assert.doesNotMatch(line.series.here.read, /before/);
  // A point outside the span is left out.
  assert.deepEqual(boldPriceSeries({ ...PRICES, obs: [[20700, 1, 1], ...PRICES.obs] }, 20727, 20774).points.length, 3);
  assert.equal(boldPriceSeries({ ...PRICES, obs: [] }, 20727, 20774), null);
});

test("days before the store's first are not read yet; a span inside it has none", () => {
  assert.equal(unfilledThrough(PRICES, 20727, 20774), null);
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: { block: 1, day: 20740 } }, 20727, 20774), 20739);
  // A store whose first day is past the span has read none of it: clamped to the last day.
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: { block: 1, day: 20800 } }, 20727, 20774), 20774);
  // No stored row, or a first row whose day is not mapped yet: the whole span is unread.
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: null }, 20727, 20774), 20774);
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: { block: 1, day: null } }, 20727, 20774), 20774);
  // A failed read says nothing about unread days.
  assert.equal(unfilledThrough(null, 20727, 20774), null);
  const s = boldPriceSeries({ ...PRICES, filledFrom: { block: 1, day: 20740 } }, 20727, 20774);
  assert.deepEqual(s.unread, { through: 20739, text: BOLD_UNREAD_TEXT });
  assert.equal(boldPriceSeries(PRICES, 20727, 20774).unread, undefined);
});

test("each listed row is a focus event under its Trove-timeline id", () => {
  const [e] = redeemerFocus([ROW], redeemerTimeline(DAYS, PRICES));
  assert.equal(e.id, "0xabc_7");
  assert.equal(e.tx, "0xabc");
  assert.equal(e.legs[0].amount, 1000);
  assert.equal(e.legs[0].symbol, "BOLD");
});

test("no days, no chart; no price answer or a span wholly unread, no line", () => {
  assert.equal(redeemerTimeline([], PRICES), null);
  assert.equal(redeemerTimeline(DAYS, null).shareLine, undefined);
  assert.equal(redeemerTimeline(DAYS, { ...PRICES, filledFrom: null, obs: [] }).shareLine, undefined);
});

test("the one-day rule: a redeemer of one day draws nothing; of two days, the chart", () => {
  const today = 20776;
  assert.equal(flowsLife(buildFlowModel(redeemerTimeline([DAYS[2]], PRICES)), today), "none");
  assert.equal(flowsLife(buildFlowModel(redeemerTimeline(DAYS, PRICES)), today), "full");
});

test("no state card between a redeemer's events: it holds no position", () => {
  const m = buildFlowModel(redeemerTimeline(DAYS, PRICES));
  assert.equal(m.chartAlone, true);
  // 20728 lies between the redemption days 20727 and 20729.
  assert.equal(flowMoment(m, [], 20729 * 86400 - 1), null);
});

test("the row's rate prints as the Trove card's: two places", () => {
  // rate_raw 1e18 = 100%: 35000000010000000 is 3.5000000010%; a batch member's 76000000000000003, 7.6%.
  assert.equal(fmtRateNum(Number(35000000010000000n) / 1e16), "3.50");
  assert.equal(fmtRateNum(Number(76000000000000003n) / 1e16), "7.60");
  assert.equal(fmtRateNum(Number(5000000000000000n) / 1e16), "0.50");
});
