import React from 'react';
import { Transaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { FAQ_URLS } from '../shared/faqUrls';
import { formatCurrency, formatUsdValue } from '@/lib/utils/format';
import { LIQUIDATION_RESERVE_ETH } from '../shared/eventHelpers';
import { getTroveNftUrl } from '@/lib/utils/nft-utils';

interface CloseTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function CloseTroveExplanation({ transaction, onToggle }: CloseTroveExplanationProps) {
  const tx = transaction as any;
  const stateBefore = tx.stateBefore || tx.stateAfter;
  const closeCollUsdValue = stateBefore.collateralInUsd;
  const beforeInterestRateClose = stateBefore.annualInterestRate;
  const beforeCollRatioClose = stateBefore.collateralRatio;
  
  const closeTroveItems: React.ReactNode[] = [
    <span key="repayDebt" className="text-slate-500">
      Fully repaid the outstanding debt of{' '}
      <HighlightableValue type="debt" state="change" value={stateBefore.debt}>
        {formatCurrency(stateBefore.debt, tx.assetType)}
      </HighlightableValue>
    </span>,
    <span key="retrieveCollateral" className="text-slate-500">
      Retrieved all{' '}
      <HighlightableValue type="collateral" state="change" value={stateBefore.coll}>
        {stateBefore.coll} {tx.collateralType}
      </HighlightableValue>
      {' '}collateral
      {closeCollUsdValue && (
        <span className="text-slate-400">
          {' '}(valued at {formatUsdValue(closeCollUsdValue)})
        </span>
      )}
    </span>,
    <span key="reserve" className="text-slate-500">
      The {LIQUIDATION_RESERVE_ETH} ETH liquidation reserve was returned
      <InfoButton href={FAQ_URLS.LIQUIDATION_RESERVE} />
    </span>
  ];

  if (beforeInterestRateClose) {
    closeTroveItems.push(
      <span key="interestRate" className="text-slate-400">
        Position was paying {beforeInterestRateClose}% annual interest before closure
      </span>
    );
  }

  if (beforeCollRatioClose) {
    closeTroveItems.push(
      <span key="collRatio" className="text-slate-400">
        Closed with a {beforeCollRatioClose}% collateral ratio
      </span>
    );
  }

  // Add NFT burn explanation if NFT URL is available
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
  if (nftUrl) {
    closeTroveItems.push(
      <span key="nftBurn" className="text-slate-500">
        Trove NFT was sent to the burn address, ending token ownership
        <InfoButton href={FAQ_URLS.NFT_TROVES} />
      </span>
    );
  }
  
  closeTroveItems.push(
    <span key="success" className="text-slate-300">
      Trove successfully closed - all obligations settled
    </span>
  );
  
  return (
    <ExplanationPanel items={closeTroveItems} onToggle={onToggle} defaultOpen={false} />
  );
}