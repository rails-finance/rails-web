import { BatchManagerOperationTransaction } from "@/types/api/troveHistory";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

export function BatchManagerInterestRateUpdateHeader({ tx }: { tx: BatchManagerOperationTransaction }) {
  const oldRate = tx.stateBefore.annualInterestRate;
  const newRate = tx.batchUpdate.annualInterestRate;
  const oldFee = tx.stateBefore.interestBatchManager ? (tx.batchUpdate.annualManagementFee || 0) : 0;
  const newFee = tx.batchUpdate.annualManagementFee || 0;

  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const batchManagerName = batchManagerInfo?.name || "Unknown delegate";

  const isRateChange = tx.operation === "setBatchManagerAnnualInterestRate";
  const isFeeReduction = tx.operation === "lowerBatchManagerAnnualFee";

  if (isRateChange) {
    const isIncrease = newRate > oldRate;
    const rateChangeText = isIncrease ? "Delegate increased rate" : "Delegate decreased rate";

    return (
      <>
        <span className="text-slate-400 font-bold">{rateChangeText}</span>
        <InterestRateBadge rate={newRate} isDelegate={true} />
        {newFee > 0 && (
          <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-pink-500/75 dark:text-pink-300 bg-slate-50 dark:bg-slate-800 border border-pink-500/75">
            <span className="mx-1">+</span>
            {newFee}
            <span className="ml-0.5">%</span>
          </div>
        )}
        <span className="text-slate-400 font-bold">{batchManagerName}</span>
      </>
    );
  }

  if (isFeeReduction) {
    return (
      <>
        <span className="text-slate-400 font-bold">Delegate lowered fee</span>
        <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-pink-500/75 dark:text-pink-300 bg-slate-50 dark:bg-slate-800 border border-pink-500/75">
          <span className="mx-1">+</span>
          {newFee}
          <span className="ml-0.5">%</span>
        </div>
        <span className="text-slate-400 font-bold">{batchManagerName}</span>
      </>
    );
  }

  return null;
}
