import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { FAQ_URLS } from '../shared/faqUrls';
import { getTroveNftUrl } from '@/lib/utils/nft-utils';
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
  
  // Add NFT minting explanation if NFT URL is available
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
  if (nftUrl) {
    openTroveItems.push(
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
        </a> representing ownership
        <InfoButton href={FAQ_URLS.NFT_TROVES} />
      </span>
    );
  }

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