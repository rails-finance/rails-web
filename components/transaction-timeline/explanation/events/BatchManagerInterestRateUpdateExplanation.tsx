import React, { useState } from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { formatCurrency } from "../shared/eventHelpers";
import { Link2 } from "lucide-react";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { Icon } from "@/components/icons/icon";

interface BatchManagerInterestRateUpdateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function BatchManagerInterestRateUpdateExplanation({
  transaction,
  onToggle,
  defaultOpen,
}: BatchManagerInterestRateUpdateExplanationProps) {
  const [copied, setCopied] = useState(false);
  const tx = transaction as any;

  const oldRate = tx.stateBefore.annualInterestRate;
  const newRate = tx.batchUpdate.annualInterestRate;
  const oldFee = tx.batchUpdate?.annualManagementFee || 0;
  const newFee = tx.batchUpdate.annualManagementFee || 0;

  const beforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const afterDebt = tx.stateAfter.debt;
  const beforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const afterColl = tx.stateAfter.coll;
  const beforeRatio = tx.stateBefore?.collateralRatio;
  const afterRatio = tx.stateAfter.collateralRatio;

  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const batchManagerAddress = tx.stateAfter.interestBatchManager || "";
  const shortAddress = `${batchManagerAddress.slice(0, 6)}...${batchManagerAddress.slice(-4)}`;

  const isRateChange = tx.operation === "setBatchManagerAnnualInterestRate";
  const isFeeReduction = tx.operation === "lowerBatchManagerAnnualFee";

  const items: React.ReactNode[] = [];

  if (isRateChange) {
    const isIncrease = newRate > oldRate;
    items.push(
      <span key="action" className="text-slate-500">
        Delegate ({batchManagerInfo?.name}) {isIncrease ? "increased" : "decreased"} the interest rate for all troves
        in their batch{" "}
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
      </span>,
    );

    items.push(
      <span key="interestRate" className="text-slate-500">
        Interest rate changed from{" "}
          {oldRate}%{" "}
        to{" "}
        <HighlightableValue type="interestRate" state="after" value={newRate}>
          {newRate}%
        </HighlightableValue>
      </span>,
    );
  }

  if (isFeeReduction) {
    items.push(
      <span key="action" className="text-slate-500">
        Delegate ({batchManagerInfo?.name}) lowered their management fee for all troves in their batch{" "}
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
      </span>,
    );

    items.push(
      <span key="managementFee" className="text-slate-500">
        Management fee reduced to{" "}
        <HighlightableValue type="managementFee" state="after" value={newFee}>
          {newFee}%
        </HighlightableValue>
      </span>,
    );
  }

  items.push(
    <span key="debt" className="text-slate-500">
      Debt updated from{" "}
        {formatCurrency(beforeDebt, tx.assetType)}
      {" "}to{" "}
      <HighlightableValue type="debt" state="after" value={afterDebt}>
        {formatCurrency(afterDebt, tx.assetType)}
      </HighlightableValue>
      {beforeDebt === afterDebt ? " (unchanged)" : " (reflects accrued interest)"}
    </span>,
  );

  items.push(
    <span key="collateral" className="text-slate-500">
      Collateral remains{" "}
      <HighlightableValue type="collateral" state="after" value={afterColl}>
        {afterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
  );

  if (beforeRatio !== undefined) {
    items.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio:{" "}
        <HighlightableValue type="collRatio" state="after" value={afterRatio}>
          {afterRatio.toFixed(1)}%
        </HighlightableValue>
      </span>,
    );
  }

  // Add batch manager address with copy button
  items.push(
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
      items={items}
      onToggle={onToggle}
      defaultOpen={defaultOpen ?? false}
      transactionHash={transaction.transactionHash}
    />
  );
}
