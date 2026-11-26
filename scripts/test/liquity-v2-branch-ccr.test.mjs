// A Liquity V2 branch against its CCR (ui-jobs 747): the TCR on the contract's
// integers, the comparison with the CCR, the price at which the TCR meets the
// SCR, the notice drawn only below the CCR on a branch not shut down, and
// whether one Trove's close passes closeTrove's CCR check, and when a dormant
// Trove has to borrow to change (ui-jobs 858).
// Figures: the WETH branch at block 26,444,500, priced at $1,748.45.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  ccrNoticeShown,
  ccrPinBlock,
  settleAllBranchCcr,
  settleBranchCcr,
  tcrPercentText,
  troveCloseCheck,
  zombieMustBorrow,
} from "../../lib/liquity-v2/branch-ccr.ts";

const at = { blockNumber: 26_444_500, blockTimestamp: 1_795_381_187 };
const weth = {
  branch: "WETH",
  troveManager: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
  borrowerOperations: "0x372abd1810eaf23cb9d941bbe7596dfb2c46bc65",
  priceFeed: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
  collRaw: "9576655322507670081162",
  debtRaw: "11172799336964550809556471",
  priceRaw: "1748450000000000000000",
  priceCall: "fetchPrice",
  ccrRaw: "1500000000000000000",
  scrRaw: "1100000000000000000",
  mcrRaw: "1100000000000000000",
  bcrRaw: "100000000000000000",
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

test("the TCR prints floored to hundredths of a percent", () => {
  assert.equal(tcrPercentText("1499960000000000000"), "149.99%");
  assert.equal(tcrPercentText("1499999999999999999"), "149.99%");
  assert.equal(tcrPercentText("1500000000000000000"), "150.00%");
  assert.equal(tcrPercentText("1498666000000000000"), "149.86%");
  assert.equal(tcrPercentText("24467554292130450000"), "2,446.75%");
  const s = settleBranchCcr(weth, at);
  assert.equal(tcrPercentText(s.tcrRaw), "149.86%");
});

test("a close passes while (coll − Trove coll) × price ÷ (debt − Trove debt) ≥ CCR", () => {
  const s = settleBranchCcr(weth, at);
  // A Trove below the branch's TCR: taking it out lifts the branch.
  const low = { collRaw: "3000000000000000000000", debtRaw: "4500000000000000000000000" };
  const c = troveCloseCheck(s, low);
  const coll = BigInt(weth.collRaw) - BigInt(low.collRaw);
  const debt = BigInt(weth.debtRaw) - BigInt(low.debtRaw);
  assert.equal(c.newTcrRaw, ((coll * BigInt(weth.priceRaw)) / debt).toString());
  assert.equal(c.closes, true);
  // A Trove above it: taking it out pulls the branch further down.
  const high = { collRaw: "100000000000000000000", debtRaw: "50000000000000000000000" };
  assert.equal(troveCloseCheck(s, high).closes, false);
  assert.equal(troveCloseCheck(s, null), null);
  assert.equal(troveCloseCheck(s, { collRaw: weth.collRaw, debtRaw: weth.debtRaw }), null);
  assert.equal(s.bcr, 0.1);
  assert.equal(settleBranchCcr({ ...weth, bcrRaw: null }, at).bcr, null);
});

// A branch where taking out a 1 ETH, 2,000 BOLD Trove leaves 3 ETH against
// 4,000 BOLD at $2,000: 3 × 2,000 ÷ 4,000 = 150%, the CCR to the wei.
const edge = {
  ...weth,
  collRaw: "4000000000000000000",
  debtRaw: "6000000000000000000000",
  priceRaw: "2000000000000000000000",
};
const edgeTrove = { collRaw: "1000000000000000000", debtRaw: "2000000000000000000000" };

test("a close that leaves the branch exactly at the CCR goes through", () => {
  const c = troveCloseCheck(settleBranchCcr(edge, at), edgeTrove);
  assert.equal(c.newTcrRaw, edge.ccrRaw);
  assert.equal(c.closes, true);
});

test("a close that leaves the branch 1 wei under the CCR does not, and prints under 150%", () => {
  // One more wei of debt left behind floors the new TCR to CCR − 1.
  const s = settleBranchCcr({ ...edge, debtRaw: (BigInt(edge.debtRaw) + BigInt(1)).toString() }, at);
  const c = troveCloseCheck(s, edgeTrove);
  assert.equal(c.newTcrRaw, (BigInt(edge.ccrRaw) - BigInt(1)).toString());
  assert.equal(c.closes, false);
  assert.equal(tcrPercentText(c.newTcrRaw), "149.99%");
  assert.equal(tcrPercentText("1499960000000000000"), "149.99%");
});

test("a dormant Trove with no debt gets a close answer, and below the CCR it does not close", () => {
  // Taking out 1 ETH and no debt leaves 3 ETH against 6,000 BOLD at $2,000: 100%.
  const c = troveCloseCheck(settleBranchCcr(edge, at), { collRaw: edgeTrove.collRaw, debtRaw: "0" });
  assert.notEqual(c, null);
  assert.equal(c.newTcrRaw, "1000000000000000000");
  assert.equal(c.closes, false);
});

test("no close answer for more collateral than the branch, the last Trove's debt, or a lastGoodPrice read", () => {
  const s = settleBranchCcr(edge, at);
  assert.equal(troveCloseCheck(s, { collRaw: "5000000000000000000", debtRaw: edgeTrove.debtRaw }), null);
  assert.equal(troveCloseCheck(s, { collRaw: edgeTrove.collRaw, debtRaw: edge.debtRaw }), null);
  const fallback = settleBranchCcr({ ...edge, priceCall: "lastGoodPrice" }, at);
  assert.equal(troveCloseCheck(fallback, edgeTrove), null);
});

test("a dormant Trove has to borrow while its debt is under the minimum, or unread", () => {
  assert.equal(zombieMustBorrow({ collRaw: "1", debtRaw: "1999999999999999999999" }, 2000), true);
  assert.equal(zombieMustBorrow({ collRaw: "1", debtRaw: "0" }, 2000), true);
  assert.equal(zombieMustBorrow(null, 2000), true);
  assert.equal(zombieMustBorrow({ collRaw: "1", debtRaw: "2000000000000000000000" }, 2000), false);
});
