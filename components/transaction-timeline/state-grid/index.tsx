import { Transaction, isTroveTransaction, isBatchManagerOperation } from "@/types/api/troveHistory";
import { DebtMetric } from "./metrics/DebtMetric";
import { CollateralMetric } from "./metrics/CollateralMetric";
import { InterestRateMetric } from "./metrics/InterestRateMetric";
import { CollateralRatioMetric } from "./metrics/CollateralRatioMetric";

export function TransactionStateGrid({ tx }: { tx: Transaction }) {
  const { stateBefore, stateAfter, assetType, collateralType } = tx;
  const isCloseTrove = tx.operation === "closeTrove";
  const isLiquidation = tx.operation === "liquidate";
  const isRedemption = tx.operation === "redeemCollateral";
  const isBatchManager = isBatchManagerOperation(tx);

  // Get upfront fee if available (only for trove transactions)
  const upfrontFee = isTroveTransaction(tx) ? tx.troveOperation.debtIncreaseFromUpfrontFee : undefined;

  // For closeTrove and liquidate, stateBefore values are 0, so we need to calculate from operation data
  let beforeDebt = stateBefore.debt;
  let beforeColl = stateBefore.coll;
  let beforeCollInUsd = stateBefore.collateralInUsd;
  let beforeInterestRate = stateBefore.annualInterestRate;
  let beforeCollRatio = stateBefore.collateralRatio;

  if (isCloseTrove && isTroveTransaction(tx)) {
    beforeDebt = Math.abs(tx.troveOperation.debtChangeFromOperation);
    beforeColl = Math.abs(tx.troveOperation.collChangeFromOperation);
    beforeCollInUsd = stateBefore.collateralInUsd;
  }

  // For liquidations, calculate from systemLiquidation data
  if (isLiquidation && tx.type === "liquidation") {
    const totalCollLiquidated =
      tx.systemLiquidation.collSentToSP + tx.systemLiquidation.collRedistributed + tx.systemLiquidation.collSurplus;
    const totalDebtCleared = tx.systemLiquidation.debtOffsetBySP + tx.systemLiquidation.debtRedistributed;

    beforeDebt = totalDebtCleared;
    beforeColl = totalCollLiquidated;
    beforeCollInUsd = totalCollLiquidated * (tx.collateralPrice || 0);

    // Try to get the collateral ratio before liquidation
    if (beforeCollInUsd > 0 && beforeDebt > 0) {
      beforeCollRatio = (beforeCollInUsd / beforeDebt) * 100;
    }
  }

  // For redemptions, calculate the before state from operation data when trove ends at zero debt
  if (isRedemption && tx.type === "redemption") {
    const debtChange = Math.abs(tx.troveOperation.debtChangeFromOperation);
    const collChange = Math.abs(tx.troveOperation.collChangeFromOperation);

    beforeDebt = stateAfter.debt + debtChange;
    beforeColl = stateAfter.coll + collChange;
    beforeCollInUsd = beforeColl * (tx.collateralPrice || 0);

    // Calculate before collateral ratio
    if (beforeCollInUsd > 0 && beforeDebt > 0) {
      beforeCollRatio = (beforeCollInUsd / beforeDebt) * 100;
    }
  }

  // For batch manager transactions, only show interest rate changes
  // These transactions don't emit individual trove debt/collateral state
  if (isBatchManager) {
    return (
      <div className="space-y-4 mb-8">
        <div className="grid md:grid-cols-2 xl:grid-cols-2 gap-6">
          <InterestRateMetric before={beforeInterestRate} after={stateAfter.annualInterestRate} isCloseTrove={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      <div className="grid md:grid-cols-2 xl:grid-cols-2 gap-6">
        <DebtMetric
          assetType={assetType}
          before={beforeDebt}
          after={stateAfter.debt}
          isCloseTrove={isCloseTrove}
          upfrontFee={upfrontFee}
        />

        <CollateralMetric
          collateralType={collateralType}
          before={beforeColl}
          after={stateAfter.coll}
          afterInUsd={stateAfter.collateralInUsd}
          isCloseTrove={isCloseTrove}
          collSurplus={isLiquidation && tx.type === "liquidation" ? tx.systemLiquidation.collSurplus : undefined}
        />

        <InterestRateMetric before={beforeInterestRate} after={stateAfter.annualInterestRate} isCloseTrove={isCloseTrove} />

        <CollateralRatioMetric before={beforeCollRatio} after={stateAfter.collateralRatio} afterDebt={stateAfter.debt} isCloseTrove={isCloseTrove} />
      </div>
    </div>
  );
}
