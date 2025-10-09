import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { Fuel } from "lucide-react";

interface TransactionLinksProps {
  transaction: Transaction;
}

export function TransactionLinks({ transaction }: TransactionLinksProps) {
  const tx = transaction as any;

  if (!tx.transactionHash) {
    return null;
  }

  // Determine if gas fee should be shown
  const shouldShowGasFee = () => {
    // Don't show gas fees for operations not initiated by the user
    const noGasOps = ["liquidate", "redeemCollateral"];
    if (noGasOps.includes(tx.operation)) {
      return false;
    }

    // Don't show gas fee for delegate IR adjustments (batch manager operations)
    if (tx.operation === "adjustTroveInterestRate" && tx.batchUpdate) {
      return false;
    }

    return true;
  };

  if (!shouldShowGasFee() || !tx.gasFee || !tx.gasFeeUsd) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-xs text-slate-500 font-bold">
      <Fuel className="w-3 h-3 text-slate-500" />
      <span>
        {tx.gasFee.toFixed(6)} ≈ ${tx.gasFeeUsd.toFixed(2)}
      </span>
    </div>
  );
}
