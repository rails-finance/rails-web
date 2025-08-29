import React from 'react';
import { Transaction, isTroveTransaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { getUpfrontFee, formatCurrency, formatUsdValue } from '../shared/eventHelpers';

interface AdjustTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function AdjustTroveExplanation({ transaction, onToggle }: AdjustTroveExplanationProps) {
  const tx = transaction as any;
  
  if (!isTroveTransaction(tx)) return null;
  
  // Calculate changes
  const collChange = tx.troveOperation.collChangeFromOperation;
  const debtChange = tx.troveOperation.debtChangeFromOperation;
  const adjustFee = getUpfrontFee(tx);
  const beforeColl = tx.stateBefore?.coll || 0;
  const afterColl = tx.stateAfter.coll;
  const beforeDebt = tx.stateBefore?.debt || 0;
  const afterDebt = tx.stateAfter.debt;
  const beforeCollRatio = tx.stateBefore?.collateralRatio;
  const afterCollRatio = tx.stateAfter.collateralRatio;
  const beforeCollUsd = tx.stateBefore?.collateralInUsd;
  const afterCollUsd = tx.stateAfter.collateralInUsd;
  const beforeInterestRate = tx.stateBefore?.annualInterestRate;
  const afterInterestRate = tx.stateAfter.annualInterestRate;
  
  // Determine the type of adjustment
  const isDeleveraging = collChange < 0 || debtChange < 0;
  const isLeveraging = collChange > 0 || debtChange > 0;
  const collRatioImproved = afterCollRatio && beforeCollRatio && afterCollRatio > beforeCollRatio;
  
  const adjustTroveItems: React.ReactNode[] = [];

  if (collChange !== 0) {
    adjustTroveItems.push(
      <span key="collChange">
        {collChange > 0 ? 'Added ' : 'Withdrew '}
        <HighlightableValue type="collateral" state="change" value={Math.abs(collChange)}>
          {Math.abs(collChange)} {tx.collateralType}
        </HighlightableValue>
        {collChange > 0 
          ? ' to strengthen the position' 
          : ' from collateral, reducing exposure'}
      </span>
    );
  }

  if (debtChange !== 0) {
    adjustTroveItems.push(
      <span key="debtChange">
        {debtChange > 0 ? 'Borrowed an additional ' : 'Paid down '}
        <HighlightableValue type="debt" state="change" value={Math.abs(debtChange)}>
          {formatCurrency(Math.abs(debtChange), tx.assetType)}
        </HighlightableValue>
        {debtChange > 0 
          ? ', increasing leverage' 
          : ' of the outstanding debt'}
      </span>
    );
  }

  if (adjustFee > 0) {
    adjustTroveItems.push(
      <span key="fee">
        Adjustment incurred a{' '}
        <HighlightableValue type="upfrontFee" state="fee" value={adjustFee}>
          {adjustFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {' '}borrowing fee
      </span>
    );
  }

  adjustTroveItems.push(
    <span key="currentPosition">
      Position now holds{' '}
      <HighlightableValue type="collateral" state="after" value={afterColl}>
        {afterColl} {tx.collateralType}
      </HighlightableValue>
      {' '}collateral against{' '}
      <HighlightableValue type="debt" state="after" value={afterDebt}>
        {formatCurrency(afterDebt, tx.assetType)}
      </HighlightableValue>
      {' '}debt
    </span>
  );

  if (afterCollUsd) {
    adjustTroveItems.push(
      <span key="collValue">
        Current collateral value: {formatUsdValue(afterCollUsd)}
        {tx.collateralPrice && ` (${tx.collateralType} price: ${formatUsdValue(tx.collateralPrice)})`}
      </span>
    );
  }

  if (collRatioImproved) {
    adjustTroveItems.push(
      <span key="improvedRatio">
        Improved collateral ratio to{' '}
        <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
          {afterCollRatio}%
        </HighlightableValue>
        , reducing liquidation risk
      </span>
    );
  } else if (beforeCollRatio && afterCollRatio && beforeCollRatio !== afterCollRatio) {
    adjustTroveItems.push(
      <span key="changedRatio">
        Collateral ratio changed to{' '}
        <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
          {afterCollRatio}%
        </HighlightableValue>
        {afterCollRatio < beforeCollRatio ? ', increasing liquidation risk' : ''}
      </span>
    );
  }

  if (beforeInterestRate !== afterInterestRate) {
    adjustTroveItems.push(
      <span key="rateChange">
        Interest rate adjusted from{' '}
        <HighlightableValue type="interestRate" state="before" value={beforeInterestRate || 0}>
          {beforeInterestRate || 0}%
        </HighlightableValue>
        {' '}to{' '}
        <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
          {afterInterestRate}%
        </HighlightableValue>
        {' '}annual
      </span>
    );
  } else {
    adjustTroveItems.push(
      <span key="rateSame">
        Interest rate remains at{' '}
        <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
          {afterInterestRate}%
        </HighlightableValue>
        {' '}annual
      </span>
    );
  }
  
  return (
    <ExplanationPanel items={adjustTroveItems} onToggle={onToggle} />
  );
}