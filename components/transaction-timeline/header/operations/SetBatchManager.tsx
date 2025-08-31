import { TroveTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { InterestRateBadge } from "../components/InterestRateBadge";
import { BatchManagerInfo } from "../components/BatchManagerInfo";
import { BatchIcon } from "../components/BatchIcon";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";

export function SetBatchManagerHeader({ tx }: { tx: TroveTransaction }) {
  const batchManagerInfo = getBatchManagerInfo(tx.stateAfter.interestBatchManager || '');
  const batchManagerName = batchManagerInfo?.name || 'Unknown';
  const managementFee = tx.batchUpdate?.annualManagementFee || 0;

  return (
    <div>
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <OperationBadge
            label="DELEGATE"
            color="blue"
            icon={
              <>
                <span className="mr-1">→</span>
                <BatchIcon className="w-3 h-3 mr-1" />
              </>
            }
          />
          <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-slate-300 bg-slate-800 border border-slate-600">
            {tx.stateAfter.annualInterestRate}<span className="ml-0.5">%</span>
            {managementFee > 0 && (
              <>
                <span className="mx-1">+</span>
                {managementFee}<span className="ml-0.5">%</span>
              </>
            )}
          </div>
          <span className="text-slate-300 font-medium">{batchManagerName}</span>
        </div>
      </div>
    </div>
  );
}
