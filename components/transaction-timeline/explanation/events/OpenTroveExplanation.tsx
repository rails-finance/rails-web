import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { 
  getUpfrontFee, 
  formatCurrency, 
  formatPrice, 
  formatUsdValue, 
  isHighRisk, 
  isConservative, 
  calculateFeePercentage,
  LIQUIDATION_RESERVE 
} from '../shared/eventHelpers';

interface OpenTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function OpenTroveExplanation({ transaction, onToggle }: OpenTroveExplanationProps) {
  const tx = transaction as any;
  const openFee = getUpfrontFee(tx);
  const principalBorrowed = tx.stateAfter.debt - openFee;
  const collRatio = tx.stateAfter.collateralRatio;
  const collUsdValue = tx.stateAfter.collateralInUsd;
  const priceDisplay = tx.collateralPrice;
  const isHighRiskPosition = isHighRisk(collRatio);
  const isConservativePosition = isConservative(collRatio);
  
  const openTroveItems: React.ReactNode[] = [
    <span key="deposit">
      Deposited{' '}
      <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}to secure the loan
    </span>,
    <span key="borrow">
      Borrowed{' '}
      <HighlightableValue type="debt" state="change" value={principalBorrowed}>
        {formatCurrency(principalBorrowed, tx.assetType)}
      </HighlightableValue>
      {' '}against this collateral
    </span>
  ];

  if (openFee > 0) {
    openTroveItems.push(
      <span key="fee">
        A one-time borrowing fee of{' '}
        <HighlightableValue type="upfrontFee" state="fee" value={openFee}>
          {openFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {' '}({calculateFeePercentage(openFee, principalBorrowed)}%) was added to the debt
      </span>
    );
  }

  if (LIQUIDATION_RESERVE > 0) {
    openTroveItems.push(
      <span key="reserve">
        A {LIQUIDATION_RESERVE} {tx.assetType} liquidation reserve was set aside (refundable on close)
      </span>
    );
  }

  openTroveItems.push(
    <span key="totalDebt">
      Total initial debt is{' '}
      <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
        {formatCurrency(tx.stateAfter.debt, tx.assetType)}
      </HighlightableValue>
      {openFee > 0 && ' including the borrowing fee'}
    </span>
  );

  if (collUsdValue) {
    openTroveItems.push(
      <span key="collValue">
        Collateral value at opening: {formatUsdValue(collUsdValue)}
        {priceDisplay && ` (${tx.collateralType} price: ${formatUsdValue(priceDisplay)})`}
      </span>
    );
  }

  openTroveItems.push(
    <span key="collRatio">
      Position opened with a{' '}
      <HighlightableValue type="collRatio" state="after" value={collRatio}>
        {collRatio}%
      </HighlightableValue>
      {' '}collateralization ratio
      {isHighRiskPosition && ' (aggressive - higher liquidation risk)'}
      {isConservativePosition && ' (conservative - lower liquidation risk)'}
    </span>,
    <span key="interestRate">
      Annual interest rate set at{' '}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>
      , compounding continuously
    </span>
  );
  
  openTroveItems.push(
    <span key="success" className="text-slate-300">
      Liquity Trove successfully opened
    </span>
  );
  
  return (
    <ExplanationPanel items={openTroveItems} onToggle={onToggle} />
  );
}