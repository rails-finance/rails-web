import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { AssetAction } from "../components/AssetAction";

export function OpenTroveHeader({ tx }: { tx: TroveTransaction }) {
  const { annualInterestRate } = tx.troveOperation;
  return (
    <>
      <OperationBadge label="OPEN" color="green" />
      <div className="flex items-center gap-1">
        <InterestRateBadge rate={annualInterestRate} />
        <AssetAction action="Supply" asset={tx.collateralType} />
        <AssetAction action="Borrow" asset={tx.assetType} />
      </div>
    </>
  );
}
