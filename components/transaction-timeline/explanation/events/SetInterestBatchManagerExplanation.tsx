import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationItem } from '../ExplanationItem';

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
  
  return (
    <ul className="space-y-1.5 text-sm">
        <ExplanationItem label="Action">
          Moved Trove from individual to batch management
        </ExplanationItem>
        
        <ExplanationItem label="Batch manager">
          {tx.stateAfter.interestBatchManager || 'Unknown'}
        </ExplanationItem>
        
        <ExplanationItem label="Debt">
          <HighlightableValue type="debt" state="before" value={joinBeforeDebt}>
            {joinBeforeDebt} {tx.assetType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="debt" state="after" value={joinAfterDebt}>
            {joinAfterDebt} {tx.assetType}
          </HighlightableValue>
        </ExplanationItem>
        
        <ExplanationItem label="Collateral">
          <HighlightableValue type="collateral" state="before" value={joinBeforeColl}>
            {joinBeforeColl} {tx.collateralType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="collateral" state="after" value={joinAfterColl}>
            {joinAfterColl} {tx.collateralType}
          </HighlightableValue>
          {' (unchanged)'}
        </ExplanationItem>
        
        <ExplanationItem label="Interest rate">
          <HighlightableValue type="interestRate" state="before" value={prevIndividualRate}>
            {prevIndividualRate}%
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="interestRate" state="after" value={joinRate}>
            {joinRate}%
          </HighlightableValue>
          {' (batch rate)'}
        </ExplanationItem>
        
        {joinBeforeRatio !== undefined && (
          <ExplanationItem label="Collateral ratio">
            <HighlightableValue type="collRatio" state="before" value={joinBeforeRatio}>
              {joinBeforeRatio}%
            </HighlightableValue>
            {' → '}
            <HighlightableValue type="collRatio" state="after" value={joinAfterRatio}>
              {joinAfterRatio}%
            </HighlightableValue>
          </ExplanationItem>
        )}
        
        <ExplanationItem type="warning">
          ⚠️ Batch management may include annual management fees
        </ExplanationItem>
    </ul>
  );
}