import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchManagerInfo } from "../components/BatchManagerInfo";
import { BatchIcon } from "../components/BatchIcon";

export function OpenTroveAndJoinBatchHeader({ tx }: { tx: TroveTransaction }) {
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
        </div>
      </div>
      <BatchManagerInfo batchManager={tx.stateAfter.interestBatchManager} color="blue" />
    </div>
  );
}
