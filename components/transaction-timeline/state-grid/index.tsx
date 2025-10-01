import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { DebtMetric } from "./metrics/DebtMetric";
import { CollateralMetric } from "./metrics/CollateralMetric";
import { InterestRateMetric } from "./metrics/InterestRateMetric";
import { CollateralRatioMetric } from "./metrics/CollateralRatioMetric";

export function TransactionStateGrid({ tx }: { tx: Transaction }) {
  const { stateBefore, stateAfter, assetType, collateralType } = tx;
  const isCloseTrove = tx.operation === "closeTrove";

  // Get upfront fee if available (only for trove transactions)
  const upfrontFee = isTroveTransaction(tx) ? tx.troveOperation.debtIncreaseFromUpfrontFee : undefined;

  // For closeTrove, stateBefore values are 0, so we need to calculate from troveOperation
  let beforeDebt = stateBefore.debt;
  let beforeColl = stateBefore.coll;
  let beforeCollInUsd = stateBefore.collateralInUsd;

  if (isCloseTrove && isTroveTransaction(tx)) {
    beforeDebt = Math.abs(tx.troveOperation.debtChangeFromOperation);
    beforeColl = Math.abs(tx.troveOperation.collChangeFromOperation);
    // Keep beforeCollInUsd from stateBefore if available
    beforeCollInUsd = stateBefore.collateralInUsd;
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
        />

        <InterestRateMetric
          before={stateBefore.annualInterestRate}
          after={stateAfter.annualInterestRate}
          isCloseTrove={isCloseTrove}
        />

        <CollateralRatioMetric
          before={stateBefore.collateralRatio}
          after={stateAfter.collateralRatio}
          isCloseTrove={isCloseTrove}
        />
      </div>
    </div>
  );
}
