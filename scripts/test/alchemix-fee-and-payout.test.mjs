// The Alchemist's protocolFee by block, and the Transmuter pane's payout
// sentence with and without its convertToAssets read (ui-jobs 646).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { BASE_FEE_CHANGE_BLOCK, protocolFeeAt, protocolFeeNow } from "../../lib/alchemix/protocol-fee.ts";
import { claimPayoutParts } from "../../lib/alchemix/claim-payout.ts";

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
  block: 25_754_203,
};

test("payout sentence: with the read, the value at the claim's block", () => {
  const p = claimPayoutParts({ ...CLAIM, value: { assetsRaw: "2261350288", symbol: "USDC", decimals: 6 } });
  assert.equal(p.paid, "The claim paid out 2,229.47 mixUSDC");
  assert.equal(p.worth, "2,261.35 USDC");
  assert.equal(p.rest, " at block 25,754,203, for 2,261.35 alUSD vested.");
});

test("payout sentence: a failed read falls back to the share count, no value, no zero", () => {
  const p = claimPayoutParts({ ...CLAIM, value: null });
  assert.equal(p.worth, null);
  assert.equal(`${p.paid}${p.rest}`, "The claim paid out 2,229.47 mixUSDC for 2,261.35 alUSD vested.");
  assert.doesNotMatch(`${p.paid}${p.rest}`, /worth|\b0 USDC/);
});
