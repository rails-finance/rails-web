import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency } from '../shared/eventHelpers';

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
  
  const batchExitItems: React.ReactNode[] = [
    <span key="action" className="text-slate-500">
      Removed Trove from batch management and returned to individual management
    </span>,
    <span key="debt" className="text-slate-500">
      Debt updated from{' '}
      <HighlightableValue type="debt" state="before" value={exitBeforeDebt}>
        {formatCurrency(exitBeforeDebt, tx.assetType)}
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="debt" state="after" value={exitAfterDebt}>
        {formatCurrency(exitAfterDebt, tx.assetType)}
      </HighlightableValue>
      {exitBeforeDebt === exitAfterDebt ? ' (unchanged)' : ' (reflects accrued interest)'}
    </span>,
    <span key="collateral" className="text-slate-500">
      Collateral remains{' '}
      <HighlightableValue type="collateral" state="after" value={exitAfterColl}>
        {exitAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Interest rate changed from{' '}
      <HighlightableValue type="interestRate" state="before" value={prevBatchRate}>
        {prevBatchRate}%
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="interestRate" state="after" value={exitRate}>
        {exitRate}%
      </HighlightableValue>
      {' '}(individual rate)
    </span>
  ];

  if (exitBeforeRatio !== undefined) {
    batchExitItems.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio: {' '}
        <HighlightableValue type="collRatio" state="after" value={exitAfterRatio}>
          {exitAfterRatio}%
        </HighlightableValue>
      </span>
    );
  }
  
  return (
    <ExplanationPanel items={batchExitItems} onToggle={onToggle} defaultOpen={false} />
  );
}