import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchManagerInfo } from "../components/BatchManagerInfo";
import { BatchIcon } from "../components/BatchIcon";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

export function SetBatchManagerHeader({ tx }: { tx: TroveTransaction }) {
  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const batchManagerName = batchManagerInfo?.name || "Unknown delegate";
  const managementFee = tx.batchUpdate?.annualManagementFee || 0;
  const isJoiningExistingDelegate = tx.batchUpdate?.operation === "joinBatch";
  const isBecomingDelegate = tx.batchUpdate?.operation === "registerBatchManager";

  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <OperationBadge label="Delegate" color="none" />
          <InterestRateBadge
            rate={tx.stateAfter.annualInterestRate}
          <OperationBadge label="Delegate" color="none" />
          <InterestRateBadge
            rate={tx.stateAfter.annualInterestRate}
            isDelegate={isJoiningExistingDelegate}
            isNewDelegate={isBecomingDelegate}
          />
          {managementFee > 0 && (
            <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-slate-300 bg-slate-800 border border-slate-600">
              <span className="mx-1">+</span>
              {managementFee}
              <span className="ml-0.5">%</span>
              {managementFee}
              <span className="ml-0.5">%</span>
            </div>
          )}
          <span className="text-slate-300 font-medium">{batchManagerName}</span>
        </div>
      </div>
    </div>
  );
}
