import {
  isBatchManagerOperation,
  isLiquidationTransaction,
  isRedemptionTransaction,
  isTransferTransaction,
  Transaction,
} from "@/types/api/troveHistory";
import { OpenTroveHeader } from "./OpenTrove";
import { CloseTroveHeader } from "./CloseTrove";
import { AdjustTroveHeader } from "./AdjustTrove";
import { LiquidateHeader } from "./Liquidate";
import { RedeemCollateralHeader } from "./RedeemCollateral";
import { SetBatchManagerHeader } from "./SetBatchManager";
import { RemoveFromBatchHeader } from "./RemoveFromBatch";
import { InterestRateAdjustHeader } from "./InterestRateAdjust";
import { ApplyPendingDebtHeader } from "./ApplyPendingDebt";
import { OpenTroveAndJoinBatchHeader } from "./OpenTroveAndJoinBatch";
import { TransferTroveHeader } from "./TransferTrove";

export function HeaderContent({ tx }: { tx: Transaction }) {
  switch (tx.operation) {
    case "openTrove":
      return <OpenTroveHeader tx={tx} />;

    case "closeTrove":
      return <CloseTroveHeader tx={tx} />;

    case "adjustTrove":
      return <AdjustTroveHeader tx={tx} />;

    case "adjustTroveInterestRate":
      return <InterestRateAdjustHeader tx={tx} />;

    case "applyPendingDebt":
      return <ApplyPendingDebtHeader tx={tx} />;

    case "liquidate":
      return isLiquidationTransaction(tx) ? <LiquidateHeader tx={tx} /> : <DefaultHeader tx={tx} />;

    case "redeemCollateral":
      return isRedemptionTransaction(tx) ? <RedeemCollateralHeader tx={tx} /> : <DefaultHeader tx={tx} />;

    // batch management
    case "openTroveAndJoinBatch":
      return <OpenTroveAndJoinBatchHeader tx={tx} />;

    case "setInterestBatchManager":
      return <SetBatchManagerHeader tx={tx} />;

    case "removeFromBatch":
      return <RemoveFromBatchHeader tx={tx} />;

    case "setBatchManagerAnnualInterestRate":
      return isBatchManagerOperation(tx) ? <DefaultHeader tx={tx} /> : <DefaultHeader tx={tx} />;

    case "lowerBatchManagerAnnualFee":
      return isBatchManagerOperation(tx) ? <DefaultHeader tx={tx} /> : <DefaultHeader tx={tx} />;

    case "transferTrove":
      return isTransferTransaction(tx) ? <TransferTroveHeader tx={tx} /> : <DefaultHeader tx={tx} />;

    default:
      return <DefaultHeader tx={tx} />;
  }
}

function DefaultHeader({ tx }: { tx: Transaction }) {
  return <span className="text-slate-900 dark:text-white font-medium">{getOperationLabel(tx.operation)}</span>;
}

function getOperationLabel(operation: string): string {
  const labels: Record<string, string> = {
    openTrove: "Open Trove",
    closeTrove: "Close Trove",
    adjustTrove: "Adjust Trove",
    liquidate: "Liquidation",
    redeemCollateral: "Redemption",
    transferTrove: "Transfer",
    setInterestBatchManager: "Delegate",
    removeFromBatch: "Leave Delegate",
  };
  return labels[operation] || operation;
}
