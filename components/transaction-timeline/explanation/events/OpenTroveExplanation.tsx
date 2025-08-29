import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { FAQ_URLS } from '../shared/faqUrls';
import { 
  getUpfrontFee, 
  isHighRisk, 
  isConservative, 
  LIQUIDATION_RESERVE_ETH 
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
    <span key="deposit" className="text-slate-500">
      <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}deposited providing <HighlightableValue type="collateral" state="after" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue> collateral to secure loan
    </span>,
    <span key="borrow" className="text-slate-500">
      <HighlightableValue type="debt" state="change" value={principalBorrowed}>
        {principalBorrowed.toLocaleString()} {tx.assetType}
      </HighlightableValue>
      {' '}Borrowed
    </span>
  ];

  if (openFee > 0) {
    openTroveItems.push(
      <span key="fee" className="text-slate-500">
        A one-time borrowing fee of{' '}
        <HighlightableValue type="upfrontFee" state="fee" value={openFee}>
          {openFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {' '}(7 days of average interest)
        <InfoButton href={FAQ_URLS.BORROWING_FEES} />
      </span>
    );
  }

  openTroveItems.push(
    <span key="totalDebt" className="text-slate-500">
      Total initial debt is{' '}
      <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
        {tx.stateAfter.debt.toLocaleString()} {tx.assetType}
      </HighlightableValue>
      {openFee > 0 && ' including the borrowing fee'}
    </span>
  );

  if (LIQUIDATION_RESERVE_ETH > 0) {
    openTroveItems.push(
      <span key="reserve" className="text-slate-500">
        A {LIQUIDATION_RESERVE_ETH} ETH liquidation reserve was set aside (refundable on close)
        <InfoButton href={FAQ_URLS.LIQUIDATION_RESERVE} />
      </span>
    );
  }

  if (collUsdValue) {
    openTroveItems.push(
      <span key="collValue" className="text-slate-500">
        Collateral USD value at opening <HighlightableValue type="collateralUsd" state="after" value={collUsdValue}>
          ${collUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </HighlightableValue>
        {priceDisplay && ` (${tx.collateralType} price: `}
        {priceDisplay && (
          <HighlightableValue type="collateralPrice" state="after" value={priceDisplay}>
            ${priceDisplay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </HighlightableValue>
        )}
        {priceDisplay && `)`}
      </span>
    );
  }

  openTroveItems.push(
    <span key="collRatio" className="text-slate-500">
      Position opened with a{' '}
      <HighlightableValue type="collRatio" state="after" value={collRatio}>
        {collRatio}%
      </HighlightableValue>
      {' '}collateralization ratio
      <InfoButton href={FAQ_URLS.LTV_COLLATERAL_RATIO} />
    </span>,
    <span key="interestRate" className="text-slate-500">
      Annual interest rate set at{' '}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>
      , compounding continuously
      <InfoButton href={FAQ_URLS.USER_SET_RATES} />
    </span>
  );
  
  openTroveItems.push(
    <span key="success" className="text-slate-500">
      Liquity Trove successfully opened
      <InfoButton href={FAQ_URLS.WHAT_IS_TROVE} />
    </span>
  );
  
  return (
    <ExplanationPanel items={openTroveItems} onToggle={onToggle} defaultOpen={false} />
  );
}