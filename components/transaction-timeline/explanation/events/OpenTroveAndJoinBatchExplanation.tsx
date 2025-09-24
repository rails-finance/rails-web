import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { formatCurrency, formatUsdValue } from '@/lib/utils/format';
import { getUpfrontFee } from '../shared/eventHelpers';
import { getTroveNftUrl } from '@/lib/utils/nft-utils';
import { FAQ_URLS } from '../shared/faqUrls';

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
    <span key="opened" className="text-slate-500">
      Opened a new Trove and delegated interest management to{' '}
      <span className="font-medium">{tx.stateAfter.interestBatchManager || 'Unknown manager'}</span>
    </span>,
    <span key="deposited" className="text-slate-500">
      Deposited{' '}
      <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}as collateral
    </span>,
    <span key="borrowed" className="text-slate-500">
      Borrowed{' '}
      <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
        {formatCurrency(batchPrincipalBorrowed, tx.assetType)}
      </HighlightableValue>
      {' '}through the batch
    </span>
  ];

  if (batchOpenFee > 0) {
    batchItems.push(
      <span key="fee" className="text-slate-500">
        Paid a{' '}
        <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
          {batchOpenFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {' '}upfront borrowing fee
      </span>
    );
  }

  batchItems.push(
    <span key="totalDebt" className="text-slate-500">
      Total debt is{' '}
      <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
        {formatCurrency(tx.stateAfter.debt, tx.assetType)}
      </HighlightableValue>
      {batchOpenFee > 0 && ' including fees'}
    </span>
  );

  if (batchCollUsdValue) {
    batchItems.push(
      <span key="collValue" className="text-slate-500">
        Collateral value at opening <HighlightableValue type="collateralUsd" state="after" value={batchCollUsdValue}>
          {formatUsdValue(batchCollUsdValue)}
        </HighlightableValue>
        {tx.collateralPrice && ` (${tx.collateralType} price: `}
        {tx.collateralPrice && (
          <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
            {formatUsdValue(tx.collateralPrice)}
          </HighlightableValue>
        )}
        {tx.collateralPrice && `)`}
      </span>
    );
  }

  batchItems.push(
    <span key="collRatio" className="text-slate-500">
      Starting collateral ratio:{' '}
      <HighlightableValue type="collRatio" state="after" value={batchCollRatio}>
        {batchCollRatio ? batchCollRatio.toFixed(1) : '0'}%
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Batch interest rate:{' '}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>
      {' '}annual (managed by batch operator)
    </span>
  );

  
  // Add NFT minting explanation if NFT URL is available
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
  if (nftUrl) {
    batchItems.push(
      <span key="nftMint" className="text-slate-500">
        Trove is represented by an ERC-721 NFT token
        <a
          href={nftUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors"
          aria-label="View NFT on OpenSea"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-link2 lucide-link-2 w-3 h-3 text-slate-500" aria-hidden="true">
            <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
            <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
            <line x1="8" x2="16" y1="12" y2="12"></line>
          </svg>
        </a>
 representing ownership        <InfoButton href={FAQ_URLS.NFT_TROVES} />
      </span>
    );
  }

  batchItems.push(
    <span key="success" className="text-slate-300">
      Trove opened with batch management
    </span>
  );
  
  return (
    <ExplanationPanel items={batchItems} onToggle={onToggle} defaultOpen={false} transactionHash={transaction.transactionHash} />
  );
}