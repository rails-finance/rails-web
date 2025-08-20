import { Button } from "@/components/ui/button";

interface TransactionFooterProps {
  timestamp: number;
  txIndex: number;
  txHash?: string;
  isExpanded: boolean;
}

export function TransactionFooter({ timestamp, txIndex, txHash, isExpanded }: TransactionFooterProps) {
  return (
    <div className={"flex justify-between items-center"}>
      <div className="text-xs text-slate-600 font-bold flex items-center">
        <span className="mr-1 px-1 text-slate-500 rounded bg-slate-950/30 inline-block">{txIndex}</span>
        {timestamp}
      </div>
      {isExpanded && txHash && (
        <Button href="#" variant="primary" className="p-2 w-full sm:w-auto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            <path d="M13 3v5a2 2 0 002 2h5"></path>
          </svg>
        </Button>
      )}
    </div>
  );
}
