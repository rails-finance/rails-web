import { Transaction, isBatchManagerOperation } from "@/types/api/troveHistory";
import { HeaderContent } from "./operations";

interface TransactionItemHeaderProps {
  tx: Transaction;
  isExpanded: boolean;
  onClick: () => void;
  detailsId: string;
  truncatedTxHash?: string;
}

export function TransactionItemHeader({
  tx,
  isExpanded,
  onClick,
  detailsId,
  truncatedTxHash,
}: TransactionItemHeaderProps) {
  const isBatchManager = isBatchManagerOperation(tx);
  const focusStyles =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-400 dark:focus-visible:ring-offset-slate-900";

  if (isBatchManager) {
    return (
      <div className="px-4 pt-4 pb-2 sm:px-6 rounded-t-md relative overflow-hidden group/header">
        <div className="relative flex items-start justify-between">
          <div className="grow mt-1 mb-2">
            <div className="flex items-center flex-wrap gap-2">
              {tx.blockGrouping.isGrouped && (
                <div className="flex items-center px-2 py-0.5 bg-blue-800/50 rounded-md">
                  <span className="text-xs text-white">
                    {tx.blockGrouping.sameBlockIndex} of {tx.blockGrouping.sameBlockCount}
                  </span>
                </div>
              )}
              <HeaderContent tx={tx} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`px-4 pt-4 pb-2 sm:px-6 rounded-t-md relative overflow-hidden group/header w-full text-left cursor-pointer ${focusStyles}`}
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction${truncatedTxHash ? ` ${truncatedTxHash}` : ""} details`}
    >
      <div className="relative flex items-start justify-between">
        <div className="grow mt-1 mb-2">
          <div className="flex items-center flex-wrap gap-2">
            {tx.blockGrouping.isGrouped && (
              <div className="flex items-center px-2 py-0.5 bg-blue-800/50 rounded-md">
                <span className="text-xs text-white">
                  {tx.blockGrouping.sameBlockIndex} of {tx.blockGrouping.sameBlockCount}
                </span>
              </div>
            )}
            <HeaderContent tx={tx} />
          </div>
        </div>
      </div>
    </button>
  );
}
