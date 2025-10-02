import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/date";

interface TransactionFooterProps {
  timestamp: number;
  txIndex: number;
  txHash?: string;
  isExpanded: boolean;
  onClick: () => void;
}

export function TransactionFooter({ timestamp, txIndex, txHash, isExpanded, onClick }: TransactionFooterProps) {
  return (
    <div
      className={`px-4 sm:px-6 pb-4 sm:pb-6 ${isExpanded ? "pt-5" : ""} rounded-b-md cursor-pointer relative overflow-hidden group/footer`}
      onClick={onClick}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction details`}
    >
      {/* Gradient overlay that appears on hover - bottom to top, only when expanded */}
      {isExpanded && (
        <div className="absolute inset-0 bg-gradient-to-t from-slate-200/[0.25] dark:from-slate-950/[0.25] to-transparent opacity-0 group-hover/footer:opacity-200 transition-opacity duration-100 pointer-events-none" />
      )}

      <div className="relative flex justify-between items-center font-bold">
        <div className="text-xs text-slate-300 dark:text-slate-600">{formatTimestamp(timestamp)}</div>
        <span className="px-1 font-bold text-xs text-slate-300 dark:text-slate-500 rounded bg-slate-100 dark:bg-slate-950/30">
          {txIndex}
        </span>
      </div>
    </div>
  );
}
