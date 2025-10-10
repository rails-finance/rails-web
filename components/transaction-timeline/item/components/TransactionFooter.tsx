import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/date";

interface TransactionFooterProps {
  timestamp: number;
  txIndex: number;
  txHash?: string;
  isExpanded: boolean;
  onClick: () => void;
  isInteractive?: boolean;
}

export function TransactionFooter({ timestamp, txIndex, txHash, isExpanded, onClick, isInteractive = true }: TransactionFooterProps) {
  return (
    <div
      className={`px-4 sm:px-6 pb-4 sm:pb-6 ${isExpanded ? "pt-5" : ""} rounded-b-md ${isInteractive ? "cursor-pointer" : ""} relative overflow-hidden ${isInteractive ? "group/footer" : ""}`}
      onClick={isInteractive ? onClick : undefined}
      role={isInteractive ? "button" : undefined}
      aria-expanded={isInteractive ? isExpanded : undefined}
      aria-label={isInteractive ? `${isExpanded ? "Collapse" : "Expand"} transaction details` : undefined}
    >
      <div className="relative flex justify-between items-center font-bold">
        <div className="text-xs text-slate-300 dark:text-slate-600">{formatTimestamp(timestamp)}</div>
        <span className="px-1 font-bold text-xs text-slate-300 dark:text-slate-500 rounded bg-slate-100 dark:bg-slate-950/30">
          {txIndex}
        </span>
      </div>
    </div>
  );
}
