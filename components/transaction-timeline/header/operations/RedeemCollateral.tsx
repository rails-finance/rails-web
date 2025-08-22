import { TroveRedemptionTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function RedeemCollateralHeader({ tx }: { tx: TroveRedemptionTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="REDEMPTION" color="orange" />
      {tx.isZombieTrove && (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400">
          ⚠️ Zombie
        </span>
      )}
      <div className="flex items-center gap-1">
        <AssetAction action="Redeemed" asset={tx.collateralType} amount={Math.abs(collChangeFromOperation)} alwaysShowAmount />
        <AssetAction action="Burned" asset={tx.assetType} amount={Math.abs(debtChangeFromOperation)} alwaysShowAmount />
      </div>
    </>
  );
}
