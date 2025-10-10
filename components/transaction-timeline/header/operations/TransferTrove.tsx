import { TroveTransferTransaction } from "@/types/api/troveHistory";
import { OperationBadge } from "../components/OperationBadge";
import { Icon } from "@/components/icons/icon";

interface TransferTroveHeaderProps {
  tx: TroveTransferTransaction;
}

export function TransferTroveHeader({ tx }: TransferTroveHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-1 text-slate-400 font-bold">
        <Icon name="trove-transfer" size={16} className="text-slate-400 dark:text-slate-200" />Trove transfer to
					<span className="flex items-center gap-1 text-white text-xs rounded bg-lime-500 px-1">        
          	<Icon name="user" size={12} />{tx.toAddress ? `${tx.toAddress.slice(0, 6)}...${tx.toAddress.slice(-4)}` : "Unknown"}
					</span>
			</div>
    </>
  );
}
