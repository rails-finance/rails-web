import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { TriangleAlert, ExternalLink } from "lucide-react";
import { useHover, shouldHighlight } from "../../context/HoverContext";

export function RedeemCollateralHeader({ tx }: { tx: TroveRedemptionTransaction }) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  // Use the trove-specific redemption fee from RedemptionFeePaidToTrove event
  const redemptionFee = parseFloat(tx.redemptionFee || "0");
  // collChangeFromOperation is already the net amount sent (collLot in smart contract)
  // The fee was deducted before sending, so it never left the trove
  const collateralToRedeemer = Math.abs(collChangeFromOperation);

  // Check if zombie trove has claimable collateral
  const zombieClaimableCollateral = tx.isZombieTrove ? tx.stateAfter.coll : 0;

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-1 w-full items-start">
        <div className="flex items-center gap-1 flex-wrap">
          <OperationBadge label="REDEMPTION" color="orange" />
          <AssetAction
            action="Cleared"
            asset={tx.assetType}
            amount={Math.abs(debtChangeFromOperation)}
            alwaysShowAmount
            valueType="debt"
          />
          <AssetAction
            action="Reduced"
            asset={tx.collateralType}
            amount={collateralToRedeemer}
            alwaysShowAmount
            valueType="collateral"
          />
          {tx.isZombieTrove && zombieClaimableCollateral > 0 && (
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
              <span
                className={`${hoverEnabled ? "cursor-pointer" : ""} ${
                  hoverEnabled && shouldHighlight(hoveredValue, "collateral", "after")
                    ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                    : ""
                }`}
                onMouseEnter={
                  hoverEnabled
                    ? () => setHoveredValue({ type: "collateral", state: "after", value: zombieClaimableCollateral })
                    : undefined
                }
                onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
              >
                {zombieClaimableCollateral.toFixed(4)}
              </span>{" "}
              {tx.collateralType} claimable
            </div>
          )}
        </div>
        {tx.isZombieTrove && (
          <span className="inline-flex items-center gap-1 px-1 md:px-1.5 py-0.5 text-xs font-bold rounded bg-yellow-400 dark:bg-yellow-500/20 text-white dark:text-yellow-400">
            <TriangleAlert className="w-4 h-4 md:w-3 md:h-3" />
            <span className="hidden md:inline">Zombie</span>
          </span>
        )}
      </div>
    </>
  );
}
