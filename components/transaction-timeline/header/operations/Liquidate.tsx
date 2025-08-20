import { TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function LiquidateHeader({ tx }: { tx: TroveLiquidationTransaction }) {
  return (
    <>
      <OperationBadge label="LIQUIDATION" color="red" />
      <div className="flex items-center gap-1">
        <AssetAction action="Liquidated" asset={tx.collateralType} />
        <AssetAction action="Cleared" asset={tx.assetType} />
      </div>
    </>
  );
}
