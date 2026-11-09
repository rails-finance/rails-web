// lib/vaults/lost-assets.ts and the dust floor in lib/vaults/yield.ts (rails-ops
// ui-jobs 543, 542). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { hasLostAssets, heldAssetsRaw, lostAssetsSentence } from "../../lib/vaults/lost-assets.ts";
import { MEASURABLE_MIN_ASSETS_RAW, tooSmallToMeasure } from "../../lib/vaults/yield.ts";

const lost = (total, l) => hasLostAssets(total, l, tooSmallToMeasure);

test("1% of totalAssets is the threshold", () => {
  assert.equal(lost("1000000", "10000"), true);
  assert.equal(lost("1000000", "9999"), false);
  // EVST at block 26,373,156: 2.62 of 10,182.36 USDC, 0.026%.
  assert.equal(lost("10182360000", "2620000"), false);
  // IMF-USDS: 819,088.91 of 819,973.68 USDS.
  assert.equal(lost("819973680000000000000000", "819088910000000000000000"), true);
  // gtusdcf: all of it.
  assert.equal(lost("1911711490000", "1911711490000"), true);
});

test("absent or zero lostAssets is no standing", () => {
  assert.equal(lost("1000000", null), false);
  assert.equal(lost("1000000", "0"), false);
  assert.equal(lost(null, "10"), false);
  assert.equal(lost("0", "0"), false);
});

test("the dust floor wins: under 10,000 raw units there is no standing", () => {
  assert.equal(MEASURABLE_MIN_ASSETS_RAW, BigInt(10_000));
  assert.equal(tooSmallToMeasure("9999"), true);
  assert.equal(tooSmallToMeasure("10000"), false);
  assert.equal(tooSmallToMeasure(BigInt(10_000)), false);
  // yELEPAN-USDC on Base: half of a few raw units lost.
  assert.equal(lost("4", "2"), false);
  assert.equal(lost("9999", "9999"), false);
  assert.equal(lost("10000", "100"), true);
});

test("held is totalAssets less lostAssets, or totalAssets where lostAssets is absent", () => {
  assert.equal(heldAssetsRaw("819973680000", "819088910000"), BigInt("884770000"));
  assert.equal(heldAssetsRaw("500", null), BigInt(500));
  assert.equal(heldAssetsRaw("500", "500"), BigInt(0));
});

test("the caution's words", () => {
  assert.equal(
    lostAssetsSentence({ lost: "819,089", held: "884.77", symbol: "USDS", block: 26373156 }),
    "Includes 819,089 USDS lost at block 26,373,156. The vault holds 884.77 USDS; the share price has not been lowered for the loss, so the holders who withdraw last carry it.",
  );
});
