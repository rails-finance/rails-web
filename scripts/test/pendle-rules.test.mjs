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

// ui-jobs 750: the SY of PLP-sBOLD-4FEB2027 (0xa73f…5981) read exchangeRate() 0
// at block 26,445,225, 18 Nov 2026; the backend sent each leg's value as null.
import { assetValues, syRateZero } from "../../lib/pendle/rules.ts";

const NULL_VALUES = { pt: null, yt: null, lp: null, interest: "0", total: null };

test("an SY rate of 0 reads as zero; an unread or positive rate does not", () => {
  assert.equal(syRateZero({ syToAsset: "0" }), true);
  assert.equal(syRateZero({ syToAsset: null }), false);
  assert.equal(syRateZero({ syToAsset: "1053120000000000000" }), false);
  assert.equal(syRateZero({ syToAsset: "not a number" }), false);
});

test("with the SY at 0, every leg read is worth 0 and so is the total", () => {
  const p = {
    marks: { syToAsset: "0" },
    balances: { pt: "553347548552065387122364", yt: "564951316802534963313539", lp: "0" },
    ytInterest: { sy: "0", asset: "0" },
    value: { asset: NULL_VALUES },
  };
  assert.deepEqual(assetValues(p), { pt: "0", yt: "0", lp: "0", interest: "0", total: "0" });
});

test("with the SY at 0, an unread balance stays unread and no total is drawn", () => {
  const p = {
    marks: { syToAsset: "0" },
    balances: { pt: "5", yt: null, lp: "0" },
    ytInterest: { sy: "0", asset: "0" },
    value: { asset: NULL_VALUES },
  };
  assert.deepEqual(assetValues(p), { pt: "0", yt: null, lp: "0", interest: "0", total: null });
});

test("with the SY above 0, the backend's values stand", () => {
  const asset = { pt: "10", yt: "2", lp: null, interest: "0", total: null };
  const p = {
    marks: { syToAsset: "1000000000000000000" },
    balances: { pt: "10", yt: "2", lp: null },
    ytInterest: { sy: "0", asset: "0" },
    value: { asset },
  };
  assert.equal(assetValues(p), asset);
});
