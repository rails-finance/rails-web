import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency, formatUsdValue } from '../shared/eventHelpers';

interface CloseTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function CloseTroveExplanation({ transaction, onToggle }: CloseTroveExplanationProps) {
  const tx = transaction as any;
  const stateBefore = tx.stateBefore || tx.stateAfter;
  const closeCollUsdValue = stateBefore.collateralInUsd;
  const beforeInterestRateClose = stateBefore.annualInterestRate;
  const beforeCollRatioClose = stateBefore.collateralRatio;
  
  const closeTroveItems: React.ReactNode[] = [
    <span key="repayDebt">
      Fully repaid the outstanding debt of{' '}
      <HighlightableValue type="debt" state="change" value={stateBefore.debt}>
        {formatCurrency(stateBefore.debt, tx.assetType)}
      </HighlightableValue>
    </span>,
    <span key="retrieveCollateral">
      Retrieved all{' '}
      <HighlightableValue type="collateral" state="change" value={stateBefore.coll}>
        {stateBefore.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}collateral
      {closeCollUsdValue && (
        <span className="text-slate-400">
          {' '}(valued at {formatUsdValue(closeCollUsdValue)})
        </span>
      )}
    </span>,
    <span key="reserve">
      The 200 {tx.assetType} liquidation reserve was returned
    </span>
  ];

  if (beforeInterestRateClose) {
    closeTroveItems.push(
      <span key="interestRate" className="text-slate-400">
        Position was paying {beforeInterestRateClose}% annual interest before closure
      </span>
    );
  }

  if (beforeCollRatioClose) {
    closeTroveItems.push(
      <span key="collRatio" className="text-slate-400">
        Closed with a {beforeCollRatioClose}% collateral ratio
      </span>
    );
  }
  
  closeTroveItems.push(
    <span key="success" className="text-slate-300">
      Trove successfully closed - all obligations settled
    </span>
  );
  
  return (
    <ExplanationPanel items={closeTroveItems} onToggle={onToggle} />
  );
}