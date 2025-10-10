import { TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function LiquidateHeader({ tx }: { tx: TroveLiquidationTransaction }) {
  // Determine if this is a beneficial liquidation (trove gains from redistribution)
  // vs destructive liquidation (this trove gets liquidated)
  const { collIncreaseFromRedist, debtIncreaseFromRedist } = tx.troveOperation;
  const isBeneficialLiquidation = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;

  if (isBeneficialLiquidation) {
    return (
      <>
        <OperationBadge label="LIQUIDATION GAIN" color="green" />
        <div className="flex items-center gap-1">
          <AssetAction
            action="Received"
            asset={tx.collateralType}
            amount={collIncreaseFromRedist}
            alwaysShowAmount
            valueType="collateral"
          />
          <AssetAction
            action="Inherited"
            asset={tx.assetType}
            amount={debtIncreaseFromRedist}
            alwaysShowAmount
            valueType="debt"
          />
        </div>
      </>
    );
  }

  // Destructive liquidation (this trove gets liquidated)
  // Calculate total collateral and debt from systemLiquidation
  const totalCollLiquidated =
    tx.systemLiquidation.collSentToSP + tx.systemLiquidation.collRedistributed + tx.systemLiquidation.collSurplus;
  const totalDebtCleared = tx.systemLiquidation.debtOffsetBySP + tx.systemLiquidation.debtRedistributed;

  return (
    <>
      <OperationBadge label="LIQUIDATION" color="red" />
      <div className="flex items-center gap-1">
        <AssetAction
          action="Liquidated"
          asset={tx.collateralType}
          amount={totalCollLiquidated}
          alwaysShowAmount
          valueType="collateral"
        />
        <AssetAction
          action="Cleared"
          asset={tx.assetType}
          amount={totalDebtCleared}
          alwaysShowAmount
          valueType="debt"
        />
      </div>
    </>
  );
}
