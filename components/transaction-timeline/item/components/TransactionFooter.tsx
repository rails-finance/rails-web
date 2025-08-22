import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/date";

interface TransactionFooterProps {
  timestamp: number;
  txIndex: number;
  txHash?: string;
  isExpanded: boolean;
}

export function TransactionFooter({ timestamp, txIndex, txHash, isExpanded }: TransactionFooterProps) {
  return (
    <div className={"flex justify-between items-center"}>
      <div className="text-xs text-slate-600 font-bold">
        {formatTimestamp(timestamp)}
      </div>
      <span className="px-1 text-xs text-slate-500 rounded bg-slate-950/30">{txIndex}</span>
    </div>
  );
}
