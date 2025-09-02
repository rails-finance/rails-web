import React, { useState } from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { formatCurrency } from '../shared/eventHelpers';
import { Link2 } from 'lucide-react';
import { getBatchManagerInfo } from '@/lib/utils/batch-manager-utils';

interface SetInterestBatchManagerExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function SetInterestBatchManagerExplanation({ transaction, onToggle }: SetInterestBatchManagerExplanationProps) {
  const [copied, setCopied] = useState(false);
  const tx = transaction as any;
  const joinRate = tx.stateAfter.annualInterestRate;
  const prevIndividualRate = tx.stateBefore?.annualInterestRate || joinRate;
  const joinBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
  const joinAfterDebt = tx.stateAfter.debt;
  const joinBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
  const joinAfterColl = tx.stateAfter.coll;
  const joinBeforeRatio = tx.stateBefore?.collateralRatio;
  const joinAfterRatio = tx.stateAfter.collateralRatio;
  
  // Get batch manager info for website link
  const batchManagerInfo = getBatchManagerInfo(tx.stateAfter.interestBatchManager || '');
  const batchManagerAddress = tx.stateAfter.interestBatchManager || '';
  const shortAddress = `${batchManagerAddress.slice(0, 6)}...${batchManagerAddress.slice(-4)}`;
  
  const batchJoinItems: React.ReactNode[] = [
    <span key="action" className="text-slate-500">
      Moved Trove from individual to delegated ({batchManagerInfo?.name}) {batchManagerInfo?.website && (
        <>
          <a
            href={batchManagerInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            className={`-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors`}
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="w-3 h-3" />
          </a>
        </>
      )} interest rate management 
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
      Interest rate changed {' '}to{' '}
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
    <span key="warning" className="text-slate-500">
      Delegating interest rates may include annual management fees
    </span>
  );

  // Add batch manager address with copy button
  batchJoinItems.push(
    <span key="address" className="text-slate-500">
      Batch manager address:{' '}
      <span className="inline-flex items-center gap-1">
        <span className="font-medium text-blue-400">{shortAddress}</span>
        <button
          className="text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer inline-flex items-center"
          aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(batchManagerAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          )}
        </button>
      </span>
    </span>
  );
  
  return (
    <ExplanationPanel items={batchJoinItems} onToggle={onToggle} defaultOpen={false} transactionHash={transaction.transactionHash} />
  );
}