import { Transaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";

interface TransferTroveHeaderProps {
  transaction: Transaction;
}

export function TransferTroveHeader({ transaction }: TransferTroveHeaderProps) {
  return (
    <>
      <OperationBadge label="TROVE TRANSFER" color="orange" />
      <div className="flex items-center gap-1">
        <span className="text-slate-400">→</span>
        <span className="text-slate-300 font-mono text-sm">
          {transaction.to ? `${transaction.to.slice(0, 6)}...${transaction.to.slice(-4)}` : "Unknown"}
        </span>
      </div>
    </>
  );
}
