// lib/pendle/rules.ts: when a position holds PT, and when a pool is empty (ui-jobs 654).

import test from "node:test";
import assert from "node:assert/strict";
import { emptyPool, ptHolding } from "../../lib/pendle/rules.ts";

test("a PT balance of 0 reads as none held", () => {
  assert.equal(ptHolding({ balances: { pt: "0", yt: "5", lp: null } }), "none");
});

test("an unread PT balance is unread, not none held", () => {
  assert.equal(ptHolding({ balances: { pt: null, yt: null, lp: null } }), "unread");
});

test("a positive PT balance is held", () => {
  assert.equal(ptHolding({ balances: { pt: "2501807902686770625", yt: "0", lp: "0" } }), "held");
});

test("an active pool under 0.000001 SY is empty", () => {
  // STRCx-26NOV2026, 0x0c8b…6d2f, 13 Nov 2026: 1,901 wei of SY at 18 decimals.
  assert.equal(emptyPool(false, { sy: "1901" }, 18), true);
});

test("an active pool at or over 0.000001 SY is not empty", () => {
  assert.equal(emptyPool(false, { sy: "1000000000000" }, 18), false);
  assert.equal(emptyPool(false, { sy: "6451748594008080924203" }, 18), false);
});

test("a matured or unread-expiry market is never empty, nor one with no liquidity read", () => {
  assert.equal(emptyPool(true, { sy: "1901" }, 18), false);
  assert.equal(emptyPool(null, { sy: "1901" }, 18), false);
  assert.equal(emptyPool(false, null, 18), false);
  assert.equal(emptyPool(false, { sy: "1901" }, null), false);
});

test("the threshold follows the SY's decimals", () => {
  assert.equal(emptyPool(false, { sy: "0" }, 6), true);
  assert.equal(emptyPool(false, { sy: "1" }, 6), false);
});
