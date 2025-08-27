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
      className="p-4 sm:px-6 cursor-pointer rounded-t-md relative overflow-hidden group/header"
      onClick={onClick}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction details`}
    >
      {/* Gradient overlay that appears on hover - only when expanded */}
      {isExpanded && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/[0.25] to-transparent opacity-0 group-hover/header:opacity-200 transition-opacity duration-100 pointer-events-none" />
      )}
      
      <div className="relative flex items-start justify-between">
        <div className="grow mt-1 mb-2 mr-3">
          <div className="flex items-center flex-wrap gap-2">
            <HeaderContent tx={tx} />
          </div>
        </div>
      </div>
    </div>
  );
}
