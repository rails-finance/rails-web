import { formatTimestamp } from "@/lib/date";

interface TransactionFooterProps {
  timestamp: number;
  txIndex: number;
  txHash?: string;
  isExpanded: boolean;
  onClick: () => void;
  isInteractive?: boolean;
  detailsId: string;
}

export function TransactionFooter({
  timestamp,
  txIndex,
  txHash,
  isExpanded,
  onClick,
  isInteractive = true,
  detailsId,
}: TransactionFooterProps) {
  const baseClasses = `px-4 sm:px-6 pb-4 sm:pb-6 ${isExpanded ? "pt-5" : ""} rounded-b-md relative overflow-hidden`;
  const focusStyles =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-400 dark:focus-visible:ring-offset-slate-900";

  if (!isInteractive) {
    return (
      <div className={`${baseClasses}`}>
        <div className="relative flex justify-between items-center font-bold">
          <div className="text-xs text-slate-300 dark:text-slate-600">{formatTimestamp(timestamp)}</div>
          <span className="px-1 font-bold text-xs text-slate-300 dark:text-slate-500 rounded bg-slate-100 dark:bg-slate-950/30">
            {txIndex}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${baseClasses} cursor-pointer group/footer w-full text-left ${focusStyles}`}
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} transaction details`}
    >
      <div className="relative flex justify-between items-center font-bold">
        <div className="text-xs text-slate-300 dark:text-slate-600">{formatTimestamp(timestamp)}</div>
        <span className="px-1 font-bold text-xs text-slate-300 dark:text-slate-500 rounded bg-slate-100 dark:bg-slate-950/30">
          {txIndex}
        </span>
      </div>
    </button>
  );
}
