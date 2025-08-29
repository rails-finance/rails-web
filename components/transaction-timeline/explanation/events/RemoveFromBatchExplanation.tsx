import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationItem } from '../ExplanationItem';

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
  
  return (
    <ul className="space-y-1.5 text-sm">
        <ExplanationItem label="Action">
          Removed Trove from batch management
        </ExplanationItem>
        
        <ExplanationItem label="Management">
          Returned to individual management
        </ExplanationItem>
        
        <ExplanationItem label="Debt">
          <HighlightableValue type="debt" state="before" value={exitBeforeDebt}>
            {exitBeforeDebt} {tx.assetType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="debt" state="after" value={exitAfterDebt}>
            {exitAfterDebt} {tx.assetType}
          </HighlightableValue>
        </ExplanationItem>
        
        <ExplanationItem label="Collateral">
          <HighlightableValue type="collateral" state="before" value={exitBeforeColl}>
            {exitBeforeColl} {tx.collateralType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="collateral" state="after" value={exitAfterColl}>
            {exitAfterColl} {tx.collateralType}
          </HighlightableValue>
          {' (unchanged)'}
        </ExplanationItem>
        
        <ExplanationItem label="Interest rate">
          <HighlightableValue type="interestRate" state="before" value={prevBatchRate}>
            {prevBatchRate}%
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="interestRate" state="after" value={exitRate}>
            {exitRate}%
          </HighlightableValue>
          {' (individual rate)'}
        </ExplanationItem>
        
        {exitBeforeRatio !== undefined && (
          <ExplanationItem label="Collateral ratio">
            <HighlightableValue type="collRatio" state="before" value={exitBeforeRatio}>
              {exitBeforeRatio}%
            </HighlightableValue>
            {' → '}
            <HighlightableValue type="collRatio" state="after" value={exitAfterRatio}>
              {exitAfterRatio}%
            </HighlightableValue>
          </ExplanationItem>
        )}
    </ul>
  );
}