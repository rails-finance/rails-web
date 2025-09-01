import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency } from '../shared/eventHelpers';

interface ApplyPendingDebtExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function ApplyPendingDebtExplanation({ transaction, onToggle }: ApplyPendingDebtExplanationProps) {
  const tx = transaction as any;
  const applyBeforeDebt = tx.stateBefore?.debt || 0;
  const applyAfterDebt = tx.stateAfter.debt;
  const applyBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const applyAfterColl = tx.stateAfter.coll;
  const applyBeforeRate = tx.stateBefore?.annualInterestRate || tx.stateAfter.annualInterestRate;
  const applyAfterRate = tx.stateAfter.annualInterestRate;
  const applyBeforeRatio = tx.stateBefore?.collateralRatio;
  const applyAfterRatio = tx.stateAfter.collateralRatio;
  
  const pendingDebtItems: React.ReactNode[] = [
    <span key="action" className="text-slate-500">
      Applied pending interest and fee updates to the Trove
    </span>,
    <span key="debt" className="text-slate-500">
      Debt updated from{' '}
      <HighlightableValue type="debt" state="before" value={applyBeforeDebt}>
        {formatCurrency(applyBeforeDebt, tx.assetType)}
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="debt" state="after" value={applyAfterDebt}>
        {formatCurrency(applyAfterDebt, tx.assetType)}
      </HighlightableValue>
      {' '}(reflects accumulated interest)
    </span>,
    <span key="collateral" className="text-slate-500">
      Collateral remains{' '}
      <HighlightableValue type="collateral" state="after" value={applyAfterColl}>
        {applyAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Interest rate: {' '}
      <HighlightableValue type="interestRate" state="after" value={applyAfterRate}>
        {applyAfterRate}%
      </HighlightableValue>
      {' '}annual {applyBeforeRate === applyAfterRate ? '(unchanged)' : '(updated)'}
    </span>
  ];

  if (applyBeforeRatio !== undefined) {
    pendingDebtItems.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio: {' '}
        <HighlightableValue type="collRatio" state="after" value={applyAfterRatio}>
          {applyAfterRatio}%
        </HighlightableValue>
        {' '}(adjusted due to debt increase)
      </span>
    );
  }
  
  return (
    <ExplanationPanel items={pendingDebtItems} onToggle={onToggle} defaultOpen={false} />
  );
}