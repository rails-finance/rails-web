import React from 'react';
import { Transaction, isRedemptionTransaction } from '@/types/api/troveHistory';
import { HighlightableValue } from '../HighlightableValue';
import { ExplanationPanel } from '../ExplanationPanel';
import { InfoButton } from '../InfoButton';
import { FAQ_URLS } from '../shared/faqUrls';
import { formatCurrency, formatUsdValue } from '@/lib/utils/format';
import { isZombieTrove } from '../shared/eventHelpers';

interface RedeemCollateralExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function RedeemCollateralExplanation({ transaction, onToggle }: RedeemCollateralExplanationProps) {
  const tx = transaction as any;
  
  if (!isRedemptionTransaction(tx)) return null;
  
  const collRedeemed = Math.abs(tx.troveOperation.collChangeFromOperation);
  const debtRedeemed = Math.abs(tx.troveOperation.debtChangeFromOperation);
  const redemptionFee = parseFloat(tx.systemRedemption?.ETHFee || '0');
  const redemptionPrice = tx.systemRedemption?.redemptionPrice || 0;
  const finalDebt = tx.stateAfter.debt;
  const isZombie = isZombieTrove(finalDebt);
  
  // Calculate net impact values
  const collateralTransferredOut = collRedeemed - redemptionFee;
  const collValueLost = redemptionPrice > 0 ? collateralTransferredOut * redemptionPrice : 0;
  const feeValueRetained = redemptionPrice > 0 ? redemptionFee * redemptionPrice : 0;
  const netLoss = collValueLost - debtRedeemed;
  const isProfit = netLoss < 0;
  const netAmount = Math.abs(netLoss);
  
  const redeemAfterColl = tx.stateAfter.coll;
  const redeemAfterDebt = tx.stateAfter.debt;
  const redeemAfterCollUsd = tx.stateAfter.collateralInUsd || 0;
  const redeemAfterCollRatio = tx.stateAfter.collateralRatio;
  
  const redeemItems: React.ReactNode[] = [
    <span key="selection" className="text-slate-500">
      A {tx.assetType} holder redeemed against this Trove (selected due to its {tx.stateAfter.annualInterestRate}% interest rate)
      <InfoButton href={FAQ_URLS.REDEMPTION_SELECTION} />
    </span>,
    <span key="received" className="text-slate-500">
      The redeemer received{' '}
      <HighlightableValue type="collateral" state="change" value={collateralTransferredOut}>
        {collateralTransferredOut} {tx.collateralType}
      </HighlightableValue>
      {collValueLost > 0 ? ` valued at ${formatUsdValue(collValueLost)}` : ''}
      {' '}from the Trove's collateral
    </span>,
    <span key="debtReduction" className="text-slate-500">
      The Trove's debt was reduced by{' '}
      <HighlightableValue type="debt" state="change" value={debtRedeemed}>
        {formatCurrency(debtRedeemed, tx.assetType)}
      </HighlightableValue>
      {' '}in exchange for the redeemed collateral
      <InfoButton href={FAQ_URLS.REDEMPTIONS} />
    </span>
  ];

  if (redemptionFee > 0) {
    redeemItems.push(
      <span key="fee" className="text-slate-500">
        A redemption fee of{' '}
        <HighlightableValue type="collateral" state="fee" value={redemptionFee}>
          {redemptionFee} {tx.collateralType}
        </HighlightableValue>
        {feeValueRetained > 0 ? ` (${formatUsdValue(feeValueRetained)})` : ''}
        {' '}was retained in the Trove as additional collateral
      </span>
    );
  }

  redeemItems.push(
    <span key="postRedemption" className="text-slate-500">
      Post-redemption: Debt is{' '}
      <HighlightableValue type="debt" state="after" value={redeemAfterDebt}>
        {formatCurrency(redeemAfterDebt, tx.assetType)}
      </HighlightableValue>
      , Collateral is{' '}
      <HighlightableValue type="collateral" state="after" value={redeemAfterColl}>
        {redeemAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>
  );

  if (redeemAfterCollUsd > 0 && tx.collateralPrice) {
    redeemItems.push(
      <span key="currentValue" className="text-slate-500">
        Current collateral valued at <HighlightableValue type="collateralUsd" state="after" value={redeemAfterCollUsd}>
          {formatUsdValue(redeemAfterCollUsd)}
        </HighlightableValue> with historic price of {tx.collateralType} priced at{' '}
        <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
          {formatUsdValue(tx.collateralPrice)}/{tx.collateralType}
        </HighlightableValue>
      </span>
    );
  }

  if (redeemAfterCollRatio !== undefined) {
    redeemItems.push(
      <span key="improvedRatio" className="text-slate-500">
        Collateral ratio improved to{' '}
        <HighlightableValue type="collRatio" state="after" value={redeemAfterCollRatio}>
          {redeemAfterCollRatio.toFixed(1)}%
        </HighlightableValue>
      </span>
    );
  }

  redeemItems.push(
    <span key="interestRate" className="text-slate-500">
      Interest rate unchanged at{' '}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>
      {' '}annually
    </span>
  );

  if (redemptionPrice > 0) {
    redeemItems.push(
      <span key="economicImpact" className={isProfit ? "text-green-400" : "text-red-400"}>
        Economic impact: {formatUsdValue(netAmount)} net {isProfit ? 'profit' : 'loss'} to Trove owner
      </span>
    );
    
    // Always show both prices for transparency
    redeemItems.push(
      <span key="prices" className="text-slate-400 text-xs">
        Protocol redemption price: <HighlightableValue type="collateralPrice" state="before" value={redemptionPrice}>
          {formatUsdValue(redemptionPrice)}
        </HighlightableValue>/{tx.collateralType}
        {tx.collateralPrice && ` • Current market price: `}
        {tx.collateralPrice && (
          <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
            {formatUsdValue(tx.collateralPrice)}
          </HighlightableValue>
        )}
        {tx.collateralPrice && `/${tx.collateralType}`}
      </span>
    );
  }

  if (isZombie) {
    redeemItems.push(
      <span key="zombie" className="text-yellow-500">
        ⚠️ Zombie trove created {finalDebt === 0 ? '(zero debt)' : `(${finalDebt.toFixed(2)} ${tx.assetType} debt below 2000 minimum)`}
        <InfoButton href={FAQ_URLS.MINIMUM_DEBT} />
      </span>
    );
  }

  return (
    <ExplanationPanel items={redeemItems} onToggle={onToggle} defaultOpen={false} transactionHash={transaction.transactionHash} />
  );
}