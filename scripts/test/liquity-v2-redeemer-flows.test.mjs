// lib/liquity-v2/redeemer-flows.ts: a redeemer's chart from its redemption
// days and BOLD's daily price (rails-server /api/liquity-v2/redeemer/:address/days
// and /api/liquity-v2/bold-prices/daily). The days and prices are kings-cross's
// answers for 0xa07c…ab9e and 0xe8ad…9bc3, 19 Nov 2026, trimmed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOLD_UNREAD_TEXT,
  boldPriceSeries,
  redeemerFlows,
  unfilledThrough,
} from "../../lib/liquity-v2/redeemer-flows.ts";

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
  const f = redeemerFlows(DAYS, PRICES, [ROW]);
  const t = f.timeline;
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
  const line = redeemerFlows(DAYS, PRICES, []).timeline.shareLine;
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
  assert.equal(unfilledThrough(PRICES, 20727), null);
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: { block: 1, day: 20740 } }, 20727), 20739);
  assert.equal(unfilledThrough({ ...PRICES, filledFrom: null }, 20727), 20727);
  const s = boldPriceSeries({ ...PRICES, filledFrom: { block: 1, day: 20740 } }, 20727, 20774);
  assert.deepEqual(s.unread, { through: 20739, text: BOLD_UNREAD_TEXT });
  assert.equal(boldPriceSeries(PRICES, 20727, 20774).unread, undefined);
});

test("each listed row is a focus event under its Trove-timeline id", () => {
  const [e] = redeemerFlows(DAYS, PRICES, [ROW]).focus;
  assert.equal(e.id, "0xabc_7");
  assert.equal(e.tx, "0xabc");
  assert.equal(e.legs[0].amount, 1000);
  assert.equal(e.legs[0].symbol, "BOLD");
});

test("no days, no chart; no price answer, no line", () => {
  assert.equal(redeemerFlows([], PRICES, []), null);
  assert.equal(redeemerFlows(DAYS, null, []).timeline.shareLine, undefined);
});
