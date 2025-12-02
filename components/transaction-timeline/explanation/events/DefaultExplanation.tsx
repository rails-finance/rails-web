import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { toLocaleStringHelper } from "@/lib/utils/format";
import { ExplanationPanel } from "../ExplanationPanel";

interface DefaultExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function DefaultExplanation({ transaction, onToggle, defaultOpen }: DefaultExplanationProps) {
  const tx = transaction as any;
  const defaultBeforeDebt = tx.stateBefore?.debt;
  const defaultAfterDebt = tx.stateAfter.debt;
  const defaultBeforeColl = tx.stateBefore?.coll;
  const defaultAfterColl = tx.stateAfter.coll;
  const defaultBeforeRatio = tx.stateBefore?.collateralRatio;
  const defaultAfterRatio = tx.stateAfter.collateralRatio;

  const items: React.ReactNode[] = [
    <span key="operation" className="text-slate-500">
      {tx.operation
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
        .trim()}{" "}
      executed
    </span>,
  ];

  if (defaultBeforeDebt !== undefined) {
    items.push(
      <span key="debt" className="text-slate-500">
        Debt changed from {toLocaleStringHelper(defaultBeforeDebt)} to {toLocaleStringHelper(defaultAfterDebt)}{" "}
        {tx.assetType}
      </span>,
    );
  }

  if (defaultBeforeColl !== undefined) {
    items.push(
      <span key="collateral" className="text-slate-500">
        Collateral changed from {defaultBeforeColl} to {defaultAfterColl} {tx.collateralType}
      </span>,
    );
  }

  return (
    <ExplanationPanel
      items={items}
      onToggle={onToggle}
      defaultOpen={defaultOpen ?? false}
      transactionHash={transaction.transactionHash}
    />
  );
}
