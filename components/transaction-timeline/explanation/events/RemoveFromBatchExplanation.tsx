import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { formatCurrency } from "../shared/eventHelpers";
import { Link2 } from "lucide-react";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";

interface RemoveFromBatchExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function RemoveFromBatchExplanation({ transaction, onToggle }: RemoveFromBatchExplanationProps) {
  const tx = transaction as any;
  const exitRate = tx.stateAfter.annualInterestRate;
  const prevBatchRate = tx.stateBefore?.annualInterestRate || exitRate;
  const exitBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const exitAfterDebt = tx.stateAfter.debt;
  const exitBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const exitAfterColl = tx.stateAfter.coll;
  const exitBeforeRatio = tx.stateBefore?.collateralRatio;
  const exitAfterRatio = tx.stateAfter.collateralRatio;

  // Get batch manager info for the delegate we're leaving
  const batchManagerInfo = getBatchManagerByAddress(tx.stateBefore?.interestBatchManager || "");

  const batchExitItems: React.ReactNode[] = [
    <span key="delegate" className="text-slate-500">
      Left delegate:{" "}
      <span className="font-medium inline-flex items-center gap-1">
        {batchManagerInfo?.name || "Unknown delegate"}
        {batchManagerInfo?.website && (
          <a
            href={batchManagerInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            className={`-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors`}
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="w-3 h-3" />
          </a>
        )}
      </span>
    </span>,
    <span key="action" className="text-slate-500">
      Removed Trove from batch management and returned to individual management
    </span>,
    <span key="debt" className="text-slate-500">
      Debt updated from{" "}
        {formatCurrency(exitBeforeDebt, tx.assetType)}
      {" "}
      to{" "}
      <HighlightableValue type="debt" state="after" value={exitAfterDebt}>
        {formatCurrency(exitAfterDebt, tx.assetType)}
      </HighlightableValue>
      {exitBeforeDebt === exitAfterDebt ? " (unchanged)" : " (reflects accrued interest)"}
    </span>,
    <span key="collateral" className="text-slate-500">
      Collateral remains{" "}
      <HighlightableValue type="collateral" state="after" value={exitAfterColl}>
        {exitAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Interest rate changed from{" "}
        {prevBatchRate}%
      {" "}
      to{" "}
      <HighlightableValue type="interestRate" state="after" value={exitRate}>
        {exitRate}%
      </HighlightableValue>{" "}
      (individual rate)
    </span>,
  ];

  if (exitBeforeRatio !== undefined) {
    batchExitItems.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio:{" "}
        <HighlightableValue type="collRatio" state="after" value={exitAfterRatio}>
          {exitAfterRatio.toFixed(1)}%
        </HighlightableValue>
      </span>,
    );
  }

  return (
    <ExplanationPanel
      items={batchExitItems}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
