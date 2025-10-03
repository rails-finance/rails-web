import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchIcon } from "../components/BatchIcon";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

export function RemoveFromBatchHeader({ tx }: { tx: TroveTransaction }) {
  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <OperationBadge label="Leave delegate" color="none" />
          <InterestRateBadge rate={tx.stateAfter.annualInterestRate} />
        </div>
      </div>
    </div>
  );
}
