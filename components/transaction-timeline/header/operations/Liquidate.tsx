import { TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { getPerTroveLiquidationData } from "@/lib/utils/liquidation-utils";
import { useHover, shouldHighlight } from "../../context/HoverContext";

export function LiquidateHeader({ tx }: { tx: TroveLiquidationTransaction }) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  // Determine if this is a beneficial liquidation (trove gains from redistribution)
  // vs destructive liquidation (this trove gets liquidated)
  const { collIncreaseFromRedist, debtIncreaseFromRedist } = tx.troveOperation;
  const isBeneficialLiquidation = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;

  if (isBeneficialLiquidation) {
    return (
      <>
        <div className="flex items-center gap-1 flex-wrap">
          <OperationBadge label="LIQUIDATION GAIN" color="green" />
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
  // ✅ Use accurate per-trove data
  const liquidationData = getPerTroveLiquidationData(tx);

  // Surplus is only claimable when liquidation went through Stability Pool
  // In full redistribution, all collateral is redistributed (no claimable surplus)
  const hasClaimableSurplus = liquidationData.collSurplus > 0 && !liquidationData.wasFullyRedistributed;

  // Determine liquidation method
  const liquidationMethod = liquidationData.wasRedistributed ? "Redistribution" : "Stability Pool";

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        <OperationBadge label="LIQUIDATION" color="red" />
        <AssetAction
          action="Liquidated"
          asset={tx.collateralType}
          amount={liquidationData.collLiquidated}
          alwaysShowAmount
          valueType="collateral"
          valueState="before"
        />
        <AssetAction
          action="Cleared"
          asset={tx.assetType}
          amount={liquidationData.debtCleared}
          alwaysShowAmount
          valueType="debt"
          valueState="before"
        />
        {hasClaimableSurplus && (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
            <span
              className={`${hoverEnabled ? "cursor-pointer" : ""} ${
                hoverEnabled && shouldHighlight(hoveredValue, "collSurplus", "after")
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={
                hoverEnabled
                  ? () => setHoveredValue({ type: "collSurplus", state: "after", value: liquidationData.collSurplus })
                  : undefined
              }
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {liquidationData.collSurplus.toFixed(4)}
            </span>{" "}
            {tx.collateralType} surplus available
          </div>
        )}
      </div>
    </>
  );
}
