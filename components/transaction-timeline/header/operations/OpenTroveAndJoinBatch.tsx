import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchManagerInfo } from "../components/BatchManagerInfo";
import { BatchIcon } from "../components/BatchIcon";
import { AssetAction } from "../components/AssetAction";

export function OpenTroveAndJoinBatchHeader({ tx }: { tx: TroveTransaction }) {
  const { collChangeFromOperation, debtChangeFromOperation } = tx.troveOperation;
  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <OperationBadge
            label="OPEN + DELEGATE"
            color="gradient-green-blue"
            icon={<BatchIcon className="w-3 h-3 mr-1" />}
          />
          <InterestRateBadge rate={tx.stateAfter.annualInterestRate} />
          <AssetAction action="Supply" asset={tx.collateralType} amount={collChangeFromOperation} />
          <AssetAction action="Borrow" asset={tx.assetType} amount={debtChangeFromOperation} />
        </div>
      </div>
      <BatchManagerInfo batchManager={tx.stateAfter.interestBatchManager} color="blue" />
    </div>
  );
}
