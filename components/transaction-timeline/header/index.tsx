import { Transaction } from "@/types/api/troveHistory";
import { HeaderContent } from "./operations";

interface TransactionItemHeaderProps {
  tx: Transaction;
  isExpanded: boolean;
  onClick: () => void;
}

export function TransactionItemHeader({ tx, isExpanded, onClick }: TransactionItemHeaderProps) {
  return (
    <div
      className="px-4 pt-4 pb-2 sm:px-6 cursor-pointer rounded-t-md relative overflow-hidden group/header"
      onClick={onClick}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction details`}
    >

      <div className="relative flex items-start justify-between">
        <div className="grow mt-1 mb-2 mr-3">
          <div className="flex items-center flex-wrap gap-2">
            {tx.blockGrouping.isGrouped && (
              <div className="flex items-center px-2 py-0.5 bg-blue-800/50 rounded-md">
                <span className="text-xs text-white dark:text-slate-400">
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
