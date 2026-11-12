// A Trove page states its branch's TCR only over a branch total that can hold the Trove's own
// collateral (ui-jobs 607: Ebisu's sUSDe pool read 0 while its one Trove recorded 1,987.51).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { settleTrove } from "../../lib/sources/chain/liquity-fork-settle.ts";

const E18 = 10n ** 18n;
const b = {
  key: "susde",
  symbol: "sUSDe",
  decimals: 18,
  mcr: 1.15,
  ccr: 1.2,
  scr: 1.1,
  troveManager: "0x1",
  priceFeed: "0x2",
  sortedTroves: "0x3",
};
const cfg = { protocol: "ebisu", debtSymbol: "ebUSD", branches: { susde: b } };

function trove(branchCollRaw) {
  return settleTrove(cfg, b, "7", {
    blockNumber: 1,
    fetched: [1n * E18, false],
    lastGood: 1n * E18,
    data: {
      entireDebt: 1000n * E18,
      entireColl: 2000n * E18,
      redistBoldDebtGain: 0n,
      redistCollGain: 0n,
      accruedInterest: 0n,
      recordedDebt: 1000n * E18,
      annualInterestRate: 15n * 10n ** 15n,
      accruedBatchManagementFee: 0n,
    },
    statusNum: 1,
    branchDebtRaw: 1000n * E18,
    branchCollRaw,
    icrRaw: 2n * E18,
    walk: [7n],
    entireDebtOf: () => 1000n * E18,
    lastZombieId: 0n,
  });
}

test("a branch total that holds the Trove's collateral gives a TCR", () => {
  assert.equal(trove(2000n * E18).branchTcr, 2);
});

test("a branch total below the Trove's collateral gives no TCR", () => {
  const t = trove(0n);
  assert.equal(t.branchColl, 0);
  assert.equal(t.branchTcr, null);
});
