import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { AssetAction } from "../components/AssetAction";
import { Image } from "lucide-react";

export function CloseTroveHeader({ tx }: { tx: TroveTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  const hasDebt = Math.abs(debtChangeFromOperation) > 0;

  return (
    <>
      <OperationBadge label="CLOSE" color="red" />
      <div className="flex items-center gap-1">
        {hasDebt && (
          <AssetAction action="Repay" asset={tx.assetType} amount={Math.abs(debtChangeFromOperation)} valueType="debt" />
        )}
        <AssetAction action="Withdraw" asset={tx.collateralType} amount={Math.abs(collChangeFromOperation)} valueType="collateral" />
          <div className="flex items-center space-x-1">
        		<span className="font-bold text-slate-400 mr-1">Burn</span>
		        <Image size={16} className="text-slate-400" />
		     </div>
      </div>
    </>
  );
}
