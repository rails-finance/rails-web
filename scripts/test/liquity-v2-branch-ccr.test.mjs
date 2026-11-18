// A Liquity V2 branch against its CCR (ui-jobs 747): the TCR on the contract's
// integers, the comparison with the CCR, the price at which the TCR meets the
// SCR, and the notice drawn only below the CCR on a branch not shut down.
// Figures: the WETH branch's collateral and debt at block 26,444,638, priced at $1,748.45.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ccrNoticeShown, ccrPinBlock, settleAllBranchCcr, settleBranchCcr } from "../../lib/liquity-v2/branch-ccr.ts";

const at = { blockNumber: 26_444_500, blockTimestamp: 1_795_381_187 };
const weth = {
  branch: "WETH",
  troveManager: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
  borrowerOperations: "0x372abd1810eaf23cb9d941bbe7596dfb2c46bc65",
  priceFeed: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
  collRaw: "9576655322507670081162",
  debtRaw: "11172825298152770474189081",
  priceRaw: "1748450000000000000000",
  priceCall: "fetchPrice",
  ccrRaw: "1500000000000000000",
  scrRaw: "1100000000000000000",
  mcrRaw: "1100000000000000000",
  shutDown: false,
};

test("TCR is coll × price ÷ debt on the integers, and below CCR draws the notice", () => {
  const s = settleBranchCcr(weth, at);
  const tcr = (BigInt(weth.collRaw) * BigInt(weth.priceRaw)) / BigInt(weth.debtRaw);
  assert.equal(s.tcrRaw, tcr.toString());
  assert.equal(s.belowCcr, true);
  assert.equal(ccrNoticeShown(s), true);
  assert.equal(s.blockNumber, 26_444_500);
});

test("the shutdown price is SCR × debt ÷ coll", () => {
  const s = settleBranchCcr(weth, at);
  assert.equal(s.shutdownPriceRaw, ((BigInt(weth.scrRaw) * BigInt(weth.debtRaw)) / BigInt(weth.collRaw)).toString());
  assert.ok(Math.abs(s.shutdownPrice - 1283.34) < 0.01);
});

test("at or above CCR, shut down, or a failed shutdown read: no notice", () => {
  assert.equal(ccrNoticeShown(settleBranchCcr({ ...weth, priceRaw: "1760000000000000000000" }, at)), false);
  assert.equal(ccrNoticeShown(settleBranchCcr({ ...weth, shutDown: true }, at)), false);
  assert.equal(ccrNoticeShown(settleBranchCcr({ ...weth, shutDown: null }, at)), false);
});

test("an empty branch or a failed read settles to nothing", () => {
  assert.equal(settleBranchCcr({ ...weth, debtRaw: "0" }, at), null);
  assert.equal(settleBranchCcr(null, at), null);
  assert.deepEqual(settleAllBranchCcr({ blockNumber: 0, blockTimestamp: 0, branches: {} }), {});
  const all = settleAllBranchCcr({ ...at, branches: { WETH: weth, wstETH: null, rETH: null } });
  assert.deepEqual(Object.keys(all), ["WETH"]);
});

test("LIQUITY_V2_CCR_AT_BLOCK pins the read in development only", () => {
  assert.equal(ccrPinBlock("development", "26444500"), 26_444_500);
  assert.equal(ccrPinBlock("production", "26444500"), null);
  assert.equal(ccrPinBlock("test", "26444500"), null);
  assert.equal(ccrPinBlock(undefined, "26444500"), null);
  assert.equal(ccrPinBlock("development", undefined), null);
  assert.equal(ccrPinBlock("development", "abc"), null);
});
