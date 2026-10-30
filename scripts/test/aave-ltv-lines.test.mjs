// The Aave-family markdown export's loan-to-value lines.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { aaveLtvLines } from "../../lib/shared/aave-ltv-lines.ts";

test("frozen collateral: maximum 0, current ratio from the totals", () => {
  const lines = aaveLtvLines({
    totalCollateralUsd: 59_910_000,
    totalDebtUsd: 44_200_000,
    ltv: 0,
    avgLiquidationThreshold: 0.78,
  });
  assert.deepEqual(lines, [
    "- **Loan-to-value:** 73.8% (debt over collateral); liquidation at 78%",
    "- **Maximum loan-to-value:** 0%, so the account can borrow no more",
  ]);
});

test("normal account: maximum 75%", () => {
  const lines = aaveLtvLines({
    totalCollateralUsd: 1000,
    totalDebtUsd: 375,
    ltv: 0.75,
    avgLiquidationThreshold: 0.8,
  });
  assert.deepEqual(lines, [
    "- **Loan-to-value:** 37.5% (debt over collateral); liquidation at 80%",
    "- **Maximum loan-to-value:** 75%",
  ]);
});
