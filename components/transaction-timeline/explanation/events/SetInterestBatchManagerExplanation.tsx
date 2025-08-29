import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency } from '../shared/eventHelpers';

interface SetInterestBatchManagerExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function SetInterestBatchManagerExplanation({ transaction, onToggle }: SetInterestBatchManagerExplanationProps) {
  const tx = transaction as any;
  const joinRate = tx.stateAfter.annualInterestRate;
  const prevIndividualRate = tx.stateBefore?.annualInterestRate || joinRate;
  const joinBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const joinAfterDebt = tx.stateAfter.debt;
  const joinBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const joinAfterColl = tx.stateAfter.coll;
  const joinBeforeRatio = tx.stateBefore?.collateralRatio;
  const joinAfterRatio = tx.stateAfter.collateralRatio;
  
  const batchJoinItems: React.ReactNode[] = [
    <span key="action" className="text-slate-500">
      Moved Trove from individual to batch management under{' '}
      <span className="font-medium">{tx.stateAfter.interestBatchManager || 'Unknown'}</span>
    </span>,
    <span key="debt" className="text-slate-500">
      Debt updated from{' '}
      <HighlightableValue type="debt" state="before" value={joinBeforeDebt}>
        {formatCurrency(joinBeforeDebt, tx.assetType)}
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="debt" state="after" value={joinAfterDebt}>
        {formatCurrency(joinAfterDebt, tx.assetType)}
      </HighlightableValue>
      {joinBeforeDebt === joinAfterDebt ? ' (unchanged)' : ' (reflects accrued interest)'}
    </span>,
    <span key="collateral" className="text-slate-500">
      Collateral remains{' '}
      <HighlightableValue type="collateral" state="after" value={joinAfterColl}>
        {joinAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Interest rate changed from{' '}
      <HighlightableValue type="interestRate" state="before" value={prevIndividualRate}>
        {prevIndividualRate}%
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="interestRate" state="after" value={joinRate}>
        {joinRate}%
      </HighlightableValue>
      {' '}(batch rate)
    </span>
  ];

  if (joinBeforeRatio !== undefined) {
    batchJoinItems.push(
      <span key="collRatio" className="text-slate-500">
        Collateral ratio: {' '}
        <HighlightableValue type="collRatio" state="after" value={joinAfterRatio}>
          {joinAfterRatio}%
        </HighlightableValue>
      </span>
    );
  }

  batchJoinItems.push(
    <span key="warning" className="text-yellow-500">
      ⚠️ Batch management may include annual management fees
    </span>
  );
  
  return (
    <ExplanationPanel items={batchJoinItems} onToggle={onToggle} defaultOpen={false} />
  );
}