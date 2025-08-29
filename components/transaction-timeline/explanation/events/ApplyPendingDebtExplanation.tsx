import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationItem } from '../ExplanationItem';

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
  
  return (
    <ul className="space-y-1.5 text-sm">
        <ExplanationItem label="Action">
          Applied pending interest and fee updates
        </ExplanationItem>
        
        <ExplanationItem label="Debt">
          <HighlightableValue type="debt" state="before" value={applyBeforeDebt}>
            {applyBeforeDebt} {tx.assetType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="debt" state="after" value={applyAfterDebt}>
            {applyAfterDebt} {tx.assetType}
          </HighlightableValue>
        </ExplanationItem>
        
        <ExplanationItem label="Collateral">
          <HighlightableValue type="collateral" state="before" value={applyBeforeColl}>
            {applyBeforeColl} {tx.collateralType}
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="collateral" state="after" value={applyAfterColl}>
            {applyAfterColl} {tx.collateralType}
          </HighlightableValue>
          {applyBeforeColl === applyAfterColl ? ' (unchanged)' : ''}
        </ExplanationItem>
        
        <ExplanationItem label="Interest rate">
          <HighlightableValue type="interestRate" state="before" value={applyBeforeRate}>
            {applyBeforeRate}%
          </HighlightableValue>
          {' → '}
          <HighlightableValue type="interestRate" state="after" value={applyAfterRate}>
            {applyAfterRate}%
          </HighlightableValue>
          {applyBeforeRate === applyAfterRate ? ' (unchanged)' : ''}
        </ExplanationItem>
        
        {applyBeforeRatio !== undefined && (
          <ExplanationItem label="Collateral ratio">
            <HighlightableValue type="collRatio" state="before" value={applyBeforeRatio}>
              {applyBeforeRatio}%
            </HighlightableValue>
            {' → '}
            <HighlightableValue type="collRatio" state="after" value={applyAfterRatio}>
              {applyAfterRatio}%
            </HighlightableValue>
          </ExplanationItem>
        )}
        
        <ExplanationItem>
          Reflects accumulated interest and any management fees
        </ExplanationItem>
    </ul>
  );
}