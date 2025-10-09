import React, { useState } from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { formatCurrency } from "../shared/eventHelpers";
import { Link2 } from "lucide-react";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { Icon } from "@/components/icons/icon";

interface SetInterestBatchManagerExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function SetInterestBatchManagerExplanation({ transaction, onToggle }: SetInterestBatchManagerExplanationProps) {
  const [copied, setCopied] = useState(false);
  const tx = transaction as any;
  const joinRate = tx.stateAfter.annualInterestRate;
  const prevIndividualRate = tx.stateBefore?.annualInterestRate || joinRate;
  const joinBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const joinAfterDebt = tx.stateAfter.debt;
  const joinBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const joinAfterColl = tx.stateAfter.coll;
  const joinBeforeRatio = tx.stateBefore?.collateralRatio;
  const joinAfterRatio = tx.stateAfter.collateralRatio;

  // Get batch manager info for website link
  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const batchManagerAddress = tx.stateAfter.interestBatchManager || "";
  const shortAddress = `${batchManagerAddress.slice(0, 6)}...${batchManagerAddress.slice(-4)}`;

  const batchJoinItems: React.ReactNode[] = [
    <span key="action" className="text-slate-500">
      Moved Trove from individual to delegated ({batchManagerInfo?.name}){" "}
      {batchManagerInfo?.website && (
        <>
          <a
            href={batchManagerInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            className={`-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors`}
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="w-3 h-3" />
          </a>
        </>
      )}{" "}
      interest rate management
    </span>,
    <span key="debt" className="text-slate-500">
      Debt updated from{" "}
        {formatCurrency(joinBeforeDebt, tx.assetType)}
      {" "}
      to{" "}
      <HighlightableValue type="debt" state="after" value={joinAfterDebt}>
        {formatCurrency(joinAfterDebt, tx.assetType)}
      </HighlightableValue>
      {joinBeforeDebt === joinAfterDebt ? " (unchanged)" : " (reflects accrued interest)"}
    </span>,
    <span key="collateral" className="text-slate-500">
      Collateral remains{" "}
      <HighlightableValue type="collateral" state="after" value={joinAfterColl}>
        {joinAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Interest rate changed delegated rate{" "}
      <HighlightableValue type="interestRate" state="after" value={joinRate}>
        {joinRate}%
      </HighlightableValue>
    </span>,
  ];

  if (joinBeforeRatio !== undefined) {
    batchJoinItems.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio:{" "}
        <HighlightableValue type="collRatio" state="after" value={joinAfterRatio}>
          {joinAfterRatio.toFixed(1)}%
        </HighlightableValue>
      </span>,
    );
  }

  // Add batch manager address with copy button
  batchJoinItems.push(
    <span key="address" className="text-slate-500">
      Batch manager address:{" "}
      <span className="inline-flex items-center gap-1">
        <span className="font-medium text-blue-400">{shortAddress}</span>
        <button
          className="text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer inline-flex items-center"
          aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(batchManagerAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Icon name={copied ? "check" : "copy"} className="w-3.5 h-3.5" />
        </button>
      </span>
    </span>,
  );

  return (
    <ExplanationPanel
      items={batchJoinItems}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
