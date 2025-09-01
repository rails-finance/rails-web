import { TroveTransferTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";

interface TransferTroveHeaderProps {
  tx: TroveTransferTransaction;
}

export function TransferTroveHeader({ tx }: TransferTroveHeaderProps) {
  return (
    <>
      <OperationBadge label="TROVE TRANSFER" color="orange" />
      <div className="flex items-center gap-1">
        <span className="text-slate-400">→</span>
        <span className="text-slate-300 font-mono text-sm">
          {tx.toAddress ? `${tx.toAddress.slice(0, 6)}...${tx.toAddress.slice(-4)}` : "Unknown"}
        </span>
      </div>
    </>
  );
}
