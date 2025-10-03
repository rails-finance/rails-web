import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { AssetAction } from "../components/AssetAction";
import { Image, Plus } from "lucide-react";

export function OpenTroveHeader({ tx }: { tx: TroveTransaction }) {
  const { annualInterestRate, collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="OPEN" color="green" />
      <div className="flex items-center gap-1">
        <InterestRateBadge rate={annualInterestRate} />
        <AssetAction
          action="Supply"
          asset={tx.collateralType}
          amount={collChangeFromOperation}
          valueType="collateral"
        />
        <AssetAction action="Borrow" asset={tx.assetType} amount={debtChangeFromOperation} valueType="debt" />
        <div className="flex items-center space-x-1">
          <span className="font-bold text-slate-400 mr-1">Mint</span>
          <Image size={16} className="text-slate-400" />
        </div>
      </div>
    </>
  );
}
