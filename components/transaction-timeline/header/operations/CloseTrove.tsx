import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { Image } from "lucide-react";

export function CloseTroveHeader({ tx }: { tx: TroveTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="CLOSE" color="red" />
      <div className="flex items-center gap-1">
        <AssetAction action="Repay" asset={tx.assetType} amount={Math.abs(debtChangeFromOperation)} valueType="debt" />
        <AssetAction action="Withdraw" asset={tx.collateralType} amount={Math.abs(collChangeFromOperation)} valueType="collateral" />
          <div className="flex items-center space-x-1">
        		<span className="text-slate-400 mr-1">Burn</span>
		       <Image size={16} className="text-slate-300" />
		     </div>
      </div>
    </>
  );
}
