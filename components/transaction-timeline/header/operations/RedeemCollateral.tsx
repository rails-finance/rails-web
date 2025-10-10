import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { TriangleAlert } from "lucide-react";

export function RedeemCollateralHeader({ tx }: { tx: TroveRedemptionTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  // Use the trove-specific redemption fee from RedemptionFeePaidToTrove event
  const redemptionFee = parseFloat(tx.redemptionFee || "0");
  // collChangeFromOperation is already the net amount sent (collLot in smart contract)
  // The fee was deducted before sending, so it never left the trove
  const collateralToRedeemer = Math.abs(collChangeFromOperation);

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
