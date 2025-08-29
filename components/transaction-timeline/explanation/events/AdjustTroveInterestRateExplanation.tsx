import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency, formatUsdValue } from '../shared/eventHelpers';

interface AdjustTroveInterestRateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function AdjustTroveInterestRateExplanation({ transaction, onToggle }: AdjustTroveInterestRateExplanationProps) {
  const tx = transaction as any;
  const prevRate = tx.stateBefore?.annualInterestRate || 0;
  const newRate = tx.stateAfter.annualInterestRate;
  const rateBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const rateAfterDebt = tx.stateAfter.debt;
  const rateBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const rateAfterColl = tx.stateAfter.coll;
  const rateBeforeCollRatio = tx.stateBefore?.collateralRatio;
  const rateAfterCollRatio = tx.stateAfter.collateralRatio;
  const rateDifference = newRate - prevRate;
  const isRateIncrease = rateDifference > 0;
  
  const interestRateItems: React.ReactNode[] = [
    <span key="rateChange">
      {isRateIncrease ? 'Increased' : 'Decreased'} the interest rate from{' '}
      <HighlightableValue type="interestRate" state="before" value={prevRate}>
        {prevRate}%
      </HighlightableValue>
      {' '}to{' '}
      <HighlightableValue type="interestRate" state="after" value={newRate}>
        {newRate}%
      </HighlightableValue>
      {' '}annual
    </span>,
    <span key="rateDiff">
      This is a {Math.abs(rateDifference).toFixed(2)} percentage point {isRateIncrease ? 'increase' : 'decrease'} in borrowing cost
    </span>
  ];

  if (rateBeforeDebt !== rateAfterDebt) {
    interestRateItems.push(
      <span key="debtUpdate">
        Debt updated from{' '}
        <HighlightableValue type="debt" state="before" value={rateBeforeDebt}>
          {rateBeforeDebt.toLocaleString()}
        </HighlightableValue>
        {' '}to{' '}
        <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
          {formatCurrency(rateAfterDebt, tx.assetType)}
        </HighlightableValue>
        {' '}(likely from accrued interest)
      </span>
    );
  } else {
    interestRateItems.push(
      <span key="debtSame">
        Debt remains at{' '}
        <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
          {formatCurrency(rateAfterDebt, tx.assetType)}
        </HighlightableValue>
      </span>
    );
  }

  interestRateItems.push(
    <span key="collateral">
      Collateral remains at{' '}
      <HighlightableValue type="collateral" state="after" value={rateAfterColl}>
        {rateAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>
  );

  if (tx.stateAfter.collateralInUsd) {
    interestRateItems.push(
      <span key="collValue">
        Current collateral value: {formatUsdValue(tx.stateAfter.collateralInUsd)}
        {tx.collateralPrice && ` (${tx.collateralType} price: ${formatUsdValue(tx.collateralPrice)})`}
      </span>
    );
  }

  if (rateBeforeCollRatio !== undefined && rateBeforeCollRatio !== rateAfterCollRatio) {
    interestRateItems.push(
      <span key="collRatioAdjusted">
        Collateral ratio adjusted to{' '}
        <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
          {rateAfterCollRatio}%
        </HighlightableValue>
        {' '}due to debt changes
      </span>
    );
  } else if (rateAfterCollRatio !== undefined) {
    interestRateItems.push(
      <span key="collRatioSame">
        Collateral ratio remains at{' '}
        <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
          {rateAfterCollRatio}%
        </HighlightableValue>
      </span>
    );
  }

  interestRateItems.push(
    <span key="success" className="text-slate-300">
      Interest rate successfully adjusted
    </span>
  );
  
  return (
    <ExplanationPanel items={interestRateItems} onToggle={onToggle} />
  );
}