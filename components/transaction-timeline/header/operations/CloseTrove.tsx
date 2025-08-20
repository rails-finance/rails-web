import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";

export function CloseTroveHeader({ tx }: { tx: TroveTransaction }) {
  return (
    <>
      <OperationBadge label="CLOSE" color="red" />
      <div className="flex items-center gap-1">
        <AssetAction action="Repay" asset={tx.assetType} />
        <AssetAction action="Withdraw" asset={tx.collateralType} />
      </div>
    </>
  );
}
