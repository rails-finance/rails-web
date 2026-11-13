// The Alchemist's protocolFee by block, and the Transmuter pane's payout
// sentence with and without its convertToAssets read (ui-jobs 646).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { BASE_FEE_CHANGE_BLOCK, protocolFeeAt, protocolFeeNow } from "../../lib/alchemix/protocol-fee.ts";
import { claimPayoutParts } from "../../lib/alchemix/claim-payout.ts";
import { sumRedemptionNets } from "../../lib/alchemix/redemption-net-sum.ts";

// Read 13 Nov 2026: ProtocolFeeUpdated(0) on the Base Alchemist at block 53,552,996.
test("Base: a redemption before the change block pays 10 bps", () => {
  assert.equal(protocolFeeAt(8453, "base-alusdb", 52_492_070)?.bps, 10);
  assert.equal(protocolFeeAt(8453, "base-alusdb", 53_030_294)?.bps, 10);
  assert.equal(protocolFeeAt(8453, "base-alusdb", BASE_FEE_CHANGE_BLOCK - 1)?.bps, 10);
});

test("Base: at the change block and after, the fee is 0", () => {
  assert.equal(BASE_FEE_CHANGE_BLOCK, 53_552_996);
  assert.equal(protocolFeeAt(8453, "base-alusdb", BASE_FEE_CHANGE_BLOCK)?.bps, 0);
  assert.equal(protocolFeeAt(8453, "base-alusdb", 56_535_333)?.bps, 0);
  assert.equal(protocolFeeNow(8453, "base-alusdb")?.bps, 0);
});

test("Ethereum stays 25 bps; an unknown line has no fee", () => {
  assert.equal(protocolFeeAt(1, "eth-alusd", 25_754_203)?.bps, 25);
  assert.equal(protocolFeeNow(1, "eth-aleth")?.bps, 25);
  assert.equal(protocolFeeAt(8453, "eth-alusd", 1), null);
});

// eth-alusd 103: 2,229.465925612387298562 mixUSDC paid for 2,261.350288950870438183
// alUSD vested; convertToAssets at block 25,754,203 = 2,261,350,288 (USDC, 6 dp).
const CLAIM = {
  sharesRaw: "2229465925612387298562",
  mytSymbol: "mixUSDC",
  vestedRaw: "2261350288950870438183",
  synthetic: "alUSD",
};

test("payout sentence: with the read, the value at the claim's block", () => {
  const p = claimPayoutParts({ ...CLAIM, value: { assetsRaw: "2261350288", symbol: "USDC", decimals: 6 } });
  assert.equal(p.paid, "The claim paid out 2,229.47 mixUSDC");
  assert.equal(p.worth, "2,261.35 USDC");
  assert.equal(p.rest, ", for 2,261.35 alUSD vested.");
});

test("payout sentence: a failed read falls back to the share count, no value, no zero", () => {
  const p = claimPayoutParts({ ...CLAIM, value: null });
  assert.equal(p.worth, null);
  assert.equal(`${p.paid}${p.rest}`, "The claim paid out 2,229.47 mixUSDC for 2,261.35 alUSD vested.");
  assert.doesNotMatch(`${p.paid}${p.rest}`, /worth|\b0 USDC/);
});

// Base position 14's redemptions either side of block 53,552,996: one at 10 bps
// (block 53,030,294) and one at 0 (block 56,535,333). Figures shaped like the
// card's; 18-decimal raws.
const stated = (atBlock, bps, netRaw, feeSharesRaw, feeValueRaw) => ({
  status: "stated",
  fromBlock: atBlock - 100,
  atBlock,
  clearedRaw: "1000000000000000000000",
  takenRaw: "1000000000000000000000",
  sharePriceRaw: "1006405",
  underlyingDecimals: 6,
  takenValueRaw: "0",
  netRaw,
  fee: { bps, sharesRaw: feeSharesRaw, valueRaw: feeValueRaw, read: null },
  restRaw: (BigInt(netRaw) + BigInt(feeValueRaw)).toString(),
});

test("redemptions on both sides of the fee change keep the fee breakdown, at mixed rates", () => {
  const before = stated(53_030_294, 10, "-291000000000000000", "290000000000000000", "291000000000000000");
  const after = stated(56_535_333, 0, "-370000000000000", "0", "0");
  const t = sumRedemptionNets([before, after]);
  assert.equal(t.counted, 2);
  assert.equal(t.netRaw, (BigInt("-291000000000000000") + BigInt("-370000000000000")).toString());
  assert.equal(t.fee?.bps, null);
  assert.equal(t.fee?.sharesRaw, "290000000000000000");
  assert.equal(t.fee?.valueRaw, "291000000000000000");
  assert.equal(t.restRaw, "-370000000000000");
});

test("redemptions all at 0 bps carry a known fee of zero; an unknown fee drops the breakdown", () => {
  const zero = sumRedemptionNets([stated(56_535_333, 0, "-370000000000000", "0", "0")]);
  assert.equal(zero.fee?.bps, 0);
  assert.equal(zero.fee?.sharesRaw, "0");
  const unknown = sumRedemptionNets([{ ...stated(56_535_333, 0, "-1", "0", "0"), fee: null, restRaw: null }]);
  assert.equal(unknown.fee, null);
  assert.equal(unknown.netRaw, "-1");
});
