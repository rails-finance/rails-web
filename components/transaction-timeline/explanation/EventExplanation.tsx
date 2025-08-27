'use client';

import React from 'react';
import { Transaction, isRedemptionTransaction, isTroveTransaction } from '@/types/api/troveHistory';
import { HighlightableValue } from './HighlightableValue';

interface EventExplanationProps {
  transaction: Transaction;
}

export function EventExplanation({ transaction }: EventExplanationProps) {
  const generateExplanation = (): React.ReactNode => {
    const tx = transaction as any;
    
    // Helper to get fee amounts
    const getUpfrontFee = () => {
      if (isTroveTransaction(tx)) {
        const debtIncrease = tx.troveOperation?.debtIncreaseFromUpfrontFee || 0;
        return debtIncrease;
      }
      return 0;
    };
    
    switch (tx.operation) {
      case 'openTrove':
        const openFee = getUpfrontFee();
        const principalBorrowed = tx.stateAfter.debt - openFee;
        const collRatio = tx.stateAfter.collateralRatio ? `${tx.stateAfter.collateralRatio}%` : 'N/A';
        const collUsdValue = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        const priceDisplay = tx.collateralPrice ? `$${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return (
          <>
            This transaction opened a new Trove position with{' '}
            <HighlightableValue type="collateral" state="after" value={tx.stateAfter.coll}>
              {tx.stateAfter.coll} {tx.collateralType}
            </HighlightableValue>
            {collUsdValue ? ` (${collUsdValue})` : ''} collateral and borrowed{' '}
            <HighlightableValue type="debt" state="change" value={principalBorrowed}>
              {principalBorrowed} {tx.assetType}
            </HighlightableValue>
            {' '}at a{' '}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>
            {' '}annual interest rate.
            {openFee > 0 ? (
              <>
                {' '}An upfront fee of{' '}
                <HighlightableValue type="upfrontFee" state="fee" value={openFee}>
                  {openFee} {tx.assetType}
                </HighlightableValue>
                {' '}was charged based on the interest rate, making total debt{' '}
                <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
                  {tx.stateAfter.debt} {tx.assetType}
                </HighlightableValue>
                .
              </>
            ) : ''}
            {' '}The initial collateral ratio is{' '}
            <HighlightableValue type="collRatio" state="after" value={tx.stateAfter.collateralRatio}>
              {collRatio}
            </HighlightableValue>
            .
          </>
        );
      
      case 'openTroveAndJoinBatch':
        const batchOpenFee = getUpfrontFee();
        const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
        const batchCollRatio = tx.stateAfter.collateralRatio ? `${tx.stateAfter.collateralRatio.toFixed(1)}%` : 'N/A';
        const batchCollUsdValue = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        const batchPriceDisplay = tx.collateralPrice ? `$${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return (
          <>
            This transaction opened a new Trove position with{' '}
            <HighlightableValue type="collateral" state="after" value={tx.stateAfter.coll}>
              {tx.stateAfter.coll} {tx.collateralType}
            </HighlightableValue>
            {batchCollUsdValue ? ` (${batchCollUsdValue})` : ''} collateral and borrowed{' '}
            <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
              {batchPrincipalBorrowed} {tx.assetType}
            </HighlightableValue>
            . The position was immediately added to a batch with a{' '}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>
            {' '}annual interest rate.
            {batchOpenFee > 0 ? (
              <>
                {' '}An upfront fee of{' '}
                <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
                  {batchOpenFee} {tx.assetType}
                </HighlightableValue>
                {' '}was charged making total debt{' '}
                <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
                  {tx.stateAfter.debt} {tx.assetType}
                </HighlightableValue>
                .
              </>
            ) : ''}
            {' '}The initial collateral ratio is{' '}
            <HighlightableValue type="collRatio" state="after" value={tx.stateAfter.collateralRatio}>
              {batchCollRatio}
            </HighlightableValue>
            .
            {batchPriceDisplay ? `.` : ''}
          </>
        );
      
      case 'closeTrove':
        const stateBefore = tx.stateBefore || tx.stateAfter;
        const closeCollUsdValue = stateBefore.collateralInUsd ? `$${stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return (
          <>
            This transaction closed the Trove position, returning{' '}
            <HighlightableValue type="collateral" state="before" value={stateBefore.coll}>
              {stateBefore.coll} {tx.collateralType}
            </HighlightableValue>
            {closeCollUsdValue ? ` (${closeCollUsdValue})` : ''} collateral to the owner and repaying{' '}
            <HighlightableValue type="debt" state="before" value={stateBefore.debt}>
              {stateBefore.debt} {tx.assetType}
            </HighlightableValue>
            {' '}debt.
          </>
        );
      
      case 'adjustTrove':
        if (!isTroveTransaction(tx)) return null;
        let adjustmentDesc = `This transaction adjusted the Trove position`;
        const parts = [];
        
        // Calculate changes
        const collChange = tx.troveOperation.collChangeFromOperation;
        const debtChange = tx.troveOperation.debtChangeFromOperation;
        const adjustFee = getUpfrontFee();
        
        if (collChange > 0) {
          const beforeColl = tx.stateBefore?.coll || 0;
          const afterColl = tx.stateAfter.coll;
          const beforeCollUsd = tx.stateBefore?.collateralInUsd ? `$${tx.stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          const afterCollUsd = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          parts.push(
            <>
              adding{' '}
              <HighlightableValue type="collateral" state="change" value={collChange}>
                {collChange} {tx.collateralType}
              </HighlightableValue>
              {' '}collateral, increasing from{' '}
              <HighlightableValue type="collateral" state="before" value={beforeColl}>
                {beforeColl} {tx.collateralType}
              </HighlightableValue>
              {beforeCollUsd ? ` (${beforeCollUsd})` : ''} to{' '}
              <HighlightableValue type="collateral" state="after" value={afterColl}>
                {afterColl} {tx.collateralType}
              </HighlightableValue>
              {afterCollUsd ? ` (${afterCollUsd})` : ''}
            </>
          );
        } else if (collChange < 0) {
          const beforeColl = tx.stateBefore?.coll || 0;
          const afterColl = tx.stateAfter.coll;
          const beforeCollUsd = tx.stateBefore?.collateralInUsd ? `$${tx.stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          const afterCollUsd = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          parts.push(
            <>
              withdrawing{' '}
              <HighlightableValue type="collateral" state="change" value={Math.abs(collChange)}>
                {Math.abs(collChange)} {tx.collateralType}
              </HighlightableValue>
              {' '}collateral, reducing from{' '}
              <HighlightableValue type="collateral" state="before" value={beforeColl}>
                {beforeColl} {tx.collateralType}
              </HighlightableValue>
              {beforeCollUsd ? ` (${beforeCollUsd})` : ''} to{' '}
              <HighlightableValue type="collateral" state="after" value={afterColl}>
                {afterColl} {tx.collateralType}
              </HighlightableValue>
              {afterCollUsd ? ` (${afterCollUsd})` : ''}
            </>
          );
        }
        
        if (debtChange > 0) {
          parts.push(
            <>
              borrowing{' '}
              <HighlightableValue type="debt" state="change" value={debtChange}>
                {debtChange} {tx.assetType}
              </HighlightableValue>
            </>
          );
        } else if (debtChange < 0) {
          parts.push(
            <>
              repaying{' '}
              <HighlightableValue type="debt" state="change" value={Math.abs(debtChange)}>
                {Math.abs(debtChange)} {tx.assetType}
              </HighlightableValue>
            </>
          );
        }
        
        return (
          <>
            {adjustmentDesc}
            {parts.length > 0 && (
              <>
                {' '}by{' '}
                {parts.map((part, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && ' and '}
                    {part}
                  </React.Fragment>
                ))}
                .
              </>
            )}
            {parts.length === 0 && '.'}
            {adjustFee > 0 && (
              <>
                {' '}An upfront fee of{' '}
                <HighlightableValue type="upfrontFee" state="fee" value={adjustFee}>
                  {adjustFee} {tx.assetType}
                </HighlightableValue>
                {' '}was charged.
              </>
            )}
          </>
        );
      
      case 'adjustTroveInterestRate':
        const prevRate = tx.stateBefore?.annualInterestRate || 0;
        const newRate = tx.stateAfter.annualInterestRate;
        return (
          <>
            This transaction changed the Trove's interest rate from{' '}
            <HighlightableValue type="interestRate" state="before" value={prevRate}>
              {prevRate}%
            </HighlightableValue>
            {' '}to{' '}
            <HighlightableValue type="interestRate" state="after" value={newRate}>
              {newRate}%
            </HighlightableValue>
            .
          </>
        );
      
      case 'liquidate':
        const liquidatedColl = tx.stateBefore?.coll || tx.stateAfter.coll;
        const liquidatedDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
        const liquidatedCollUsd = tx.stateBefore?.collateralInUsd ? `$${tx.stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return (
          <>
            This transaction liquidated the Trove position due to insufficient collateral ratio.{' '}
            <HighlightableValue type="collateral" state="before" value={liquidatedColl}>
              {liquidatedColl} {tx.collateralType}
            </HighlightableValue>
            {liquidatedCollUsd ? ` (${liquidatedCollUsd})` : ''} collateral was seized and{' '}
            <HighlightableValue type="debt" state="before" value={liquidatedDebt}>
              {liquidatedDebt} {tx.assetType}
            </HighlightableValue>
            {' '}debt was cleared. The liquidation was triggered when the collateral ratio fell below the minimum requirement.
          </>
        );
      
      case 'redeemCollateral':
        if (!isRedemptionTransaction(tx)) return null;
        const collRedeemed = Math.abs(tx.troveOperation.collChangeFromOperation);
        const debtRedeemed = Math.abs(tx.troveOperation.debtChangeFromOperation);
        const redemptionFee = tx.systemRedemption?.ETHFee || 0;
        const redemptionPrice = tx.systemRedemption?.redemptionPrice || 0;
        const finalDebt = tx.stateAfter.debt;
        const isZombieTrove = finalDebt >= 0 && finalDebt < 2000; // MIN_DEBT in BOLD
        
        // Calculate net impact values
        // The actual collateral transferred to redeemer (excluding fee that stays in Trove)
        const collateralTransferredOut = collRedeemed - redemptionFee;
        const collValueLost = redemptionPrice > 0 ? collateralTransferredOut * redemptionPrice : 0;
        const feeValueRetained = redemptionPrice > 0 ? redemptionFee * redemptionPrice : 0;
        // Net loss = Value of collateral transferred out - Debt cleared
        const netLoss = collValueLost - debtRedeemed;
        const isProfit = netLoss < 0;
        const netAmount = Math.abs(netLoss);
        
        // Build the explanation as plain text
        // Calculate the difference in USD values from before to after for the redeemed collateral
        const beforeCollUsd = tx.stateBefore?.collateralInUsd || 0;
        const afterCollUsd = tx.stateAfter.collateralInUsd || 0;
        const collRedeemedUsdValue = beforeCollUsd > afterCollUsd ? `$${(beforeCollUsd - afterCollUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        
        return (
          <>
            {collRedeemed > 0 ? (
              <>
                A {tx.assetType} holder redeemed{' '}
                <HighlightableValue type="debt" state="change" value={debtRedeemed}>
                  {debtRedeemed} {tx.assetType}
                </HighlightableValue>
                {' '}against this Trove, resulting in{' '}
                <HighlightableValue type="collateral" state="change" value={collateralTransferredOut}>
                  {collateralTransferredOut} {tx.collateralType}
                </HighlightableValue>
                {collValueLost > 0 ? ` ($${collValueLost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''} collateral being transferred to the redeemer and{' '}
                <HighlightableValue type="debt" state="change" value={debtRedeemed}>
                  {debtRedeemed} {tx.assetType}
                </HighlightableValue>
                {' '}debt being cleared.
              </>
            ) : (
              <>
                A {tx.assetType} holder redeemed{' '}
                <HighlightableValue type="debt" state="change" value={debtRedeemed}>
                  {debtRedeemed} {tx.assetType}
                </HighlightableValue>
                {' '}against this zombie Trove. No collateral was transferred as the Trove has insufficient collateral, but{' '}
                <HighlightableValue type="debt" state="change" value={debtRedeemed}>
                  {debtRedeemed} {tx.assetType}
                </HighlightableValue>
                {' '}debt was cleared.
              </>
            )}
            
            {redemptionFee > 0 ? (
              <>
                {' '}A redemption fee of{' '}
                <HighlightableValue type="collateral" state="fee" value={redemptionFee}>
                  {redemptionFee} {tx.collateralType}
                </HighlightableValue>
                {' '}was retained in the Trove as collateral, improving the collateral ratio.
              </>
            ) : (
              <> No redemption fee was retained in the Trove for this transaction.</>
            )}
            
            {redemptionPrice > 0 && (
              <>
                {' '}The Trove owner experienced a net {isProfit ? 'profit' : 'loss'} of ${netAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from this redemption ($
                {collValueLost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} collateral transferred out minus ${debtRedeemed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} debt cleared).
              </>
            )}
            
            {isZombieTrove && (
              <>
                {finalDebt === 0 ? (
                  <> This redemption created a zombie trove (zero debt) that can be revived by borrowing at least 2000 {tx.assetType}.</>
                ) : (
                  <>
                    {' '}This redemption created a zombie trove with only{' '}
                    <HighlightableValue type="debt" state="after" value={finalDebt}>
                      {finalDebt} {tx.assetType}
                    </HighlightableValue>
                    {' '}debt, below the 2000 {tx.assetType} minimum.
                  </>
                )}
              </>
            )}
          </>
        );
      
      case 'setInterestBatchManager':
        const joinRate = tx.stateAfter.annualInterestRate;
        const prevIndividualRate = tx.stateBefore?.annualInterestRate || joinRate;
        return (
          <>
            This transaction moved the Trove from individual management to batch management, changing the interest rate from{' '}
            <HighlightableValue type="interestRate" state="before" value={prevIndividualRate}>
              {prevIndividualRate}%
            </HighlightableValue>
            {' '}to{' '}
            <HighlightableValue type="interestRate" state="after" value={joinRate}>
              {joinRate}%
            </HighlightableValue>
            . Batch management may include annual management fees.
          </>
        );
      
      case 'removeFromBatch':
        const exitRate = tx.stateAfter.annualInterestRate;
        const prevBatchRate = tx.stateBefore?.annualInterestRate || exitRate;
        return (
          <>
            This transaction removed the Trove from batch management, returning it to individual management. The interest rate changed from{' '}
            <HighlightableValue type="interestRate" state="before" value={prevBatchRate}>
              {prevBatchRate}%
            </HighlightableValue>
            {' '}to{' '}
            <HighlightableValue type="interestRate" state="after" value={exitRate}>
              {exitRate}%
            </HighlightableValue>
            .
          </>
        );
      
      case 'applyPendingDebt':
        return (
          <>
            This transaction applied pending interest and fee updates to the Trove. The debt was updated to reflect accumulated interest and any management fees.
          </>
        );
      
      default:
        return (
          <>
            This {tx.operation.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} transaction modified the Trove position. The final state shows{' '}
            <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
              {tx.stateAfter.debt} {tx.assetType}
            </HighlightableValue>
            {' '}debt and{' '}
            <HighlightableValue type="collateral" state="after" value={tx.stateAfter.coll}>
              {tx.stateAfter.coll} {tx.collateralType}
            </HighlightableValue>
            {' '}collateral.
          </>
        );
    }
  };

  const explanation = generateExplanation();
  
  return (
    <div className="text-slate-500 leading-relaxed text-sm space-y-4 mb-8">
      {explanation}
    </div>
  );
}