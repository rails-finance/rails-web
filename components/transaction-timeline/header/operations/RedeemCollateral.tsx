import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { TriangleAlert } from "lucide-react";

export function RedeemCollateralHeader({ tx }: { tx: TroveRedemptionTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="REDEMPTION" color="orange" />
      {tx.isZombieTrove && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full bg-yellow-400 dark:bg-yellow-500/20 text-white dark:text-yellow-400">
          <TriangleAlert className="w-3 h-3" />
          Zombie
        </span>
      )}
      <div className="flex items-center gap-1">
        <AssetAction
          action="Redeemed"
          asset={tx.collateralType}
          amount={Math.abs(collChangeFromOperation)}
          alwaysShowAmount
          valueType="collateral"
        />
        <AssetAction
          action="Burned"
          asset={tx.assetType}
          amount={Math.abs(debtChangeFromOperation)}
          alwaysShowAmount
          valueType="debt"
        />
      </div>
    </>
  );
}
