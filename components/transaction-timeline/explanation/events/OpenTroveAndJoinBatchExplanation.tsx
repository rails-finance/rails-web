import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { getUpfrontFee, formatCurrency, formatUsdValue } from '../shared/eventHelpers';

interface OpenTroveAndJoinBatchExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function OpenTroveAndJoinBatchExplanation({ transaction, onToggle }: OpenTroveAndJoinBatchExplanationProps) {
  const tx = transaction as any;
  const batchOpenFee = getUpfrontFee(tx);
  const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
  const batchCollRatio = tx.stateAfter.collateralRatio;
  const batchCollUsdValue = tx.stateAfter.collateralInUsd;
  
  const batchItems: React.ReactNode[] = [
    <span key="opened">
      Opened a new Trove and joined batch management under{' '}
      <span className="font-medium">{tx.stateAfter.interestBatchManager || 'Unknown manager'}</span>
    </span>,
    <span key="deposited">
      Deposited{' '}
      <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}as collateral
    </span>,
    <span key="borrowed">
      Borrowed{' '}
      <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
        {formatCurrency(batchPrincipalBorrowed, tx.assetType)}
      </HighlightableValue>
      {' '}through the batch
    </span>
  ];

  if (batchOpenFee > 0) {
    batchItems.push(
      <span key="fee">
        Paid a{' '}
        <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
          {batchOpenFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {' '}upfront borrowing fee
      </span>
    );
  }

  batchItems.push(
    <span key="totalDebt">
      Total debt is{' '}
      <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
        {formatCurrency(tx.stateAfter.debt, tx.assetType)}
      </HighlightableValue>
      {batchOpenFee > 0 && ' including fees'}
    </span>
  );

  if (batchCollUsdValue) {
    batchItems.push(
      <span key="collValue">
        Collateral value at opening: {formatUsdValue(batchCollUsdValue)}
        {tx.collateralPrice && ` (${tx.collateralType} price: ${formatUsdValue(tx.collateralPrice)})`}
      </span>
    );
  }

  batchItems.push(
    <span key="collRatio">
      Starting collateral ratio:{' '}
      <HighlightableValue type="collRatio" state="after" value={batchCollRatio}>
        {batchCollRatio ? batchCollRatio.toFixed(1) : '0'}%
      </HighlightableValue>
    </span>,
    <span key="interestRate">
      Batch interest rate:{' '}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>
      {' '}annual (managed by batch operator)
    </span>
  );

  batchItems.push(
    <span key="warning" className="text-yellow-500">
      ⚠️ Batch management may include additional annual management fees
    </span>
  );
  
  batchItems.push(
    <span key="success" className="text-slate-300">
      Trove opened with batch management
    </span>
  );
  
  return (
    <ExplanationPanel items={batchItems} onToggle={onToggle} />
  );
}