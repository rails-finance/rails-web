'use client';

import React from 'react';
import { Transaction, isRedemptionTransaction, isTroveTransaction } from '@/types/api/troveHistory';
import { HighlightableValue } from './HighlightableValue';
import { ExplanationItem } from './ExplanationItem';
import { ExplanationPanel } from './ExplanationPanel';
import { useHover } from '../context/HoverContext';

interface EventExplanationProps {
  transaction: Transaction;
}

export function EventExplanation({ transaction }: EventExplanationProps) {
  const { setHoverEnabled } = useHover();
  
  const handleToggle = (isOpen: boolean) => {
    setHoverEnabled(isOpen);
  };
  
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
        const collRatio = tx.stateAfter.collateralRatio;
        const collUsdValue = tx.stateAfter.collateralInUsd;
        const priceDisplay = tx.collateralPrice;
        const liquidationReserve = 200; // Standard liquidation reserve
        const isHighRisk = collRatio && collRatio < 150;
        const isConservative = collRatio && collRatio > 250;
        
        const openTroveItems: React.ReactNode[] = [
          <span>
            Deposited{' '}
            <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
              {tx.stateAfter.coll} {tx.collateralType}
            </HighlightableValue>
            {' '}to secure the loan
          </span>,
          <span>
            Borrowed{' '}
            <HighlightableValue type="debt" state="change" value={principalBorrowed}>
              {principalBorrowed.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {' '}against this collateral
          </span>
        ];

        if (openFee > 0) {
          openTroveItems.push(
            <span>
              A one-time borrowing fee of{' '}
              <HighlightableValue type="upfrontFee" state="fee" value={openFee}>
                {openFee.toFixed(2)} {tx.assetType}
              </HighlightableValue>
              {' '}({((openFee / principalBorrowed) * 100).toFixed(2)}%) was added to the debt
            </span>
          );
        }

        if (liquidationReserve > 0) {
          openTroveItems.push(
            <span>
              A{' '}{liquidationReserve} {tx.assetType} liquidation reserve was set aside (refundable on close)
            </span>
          );
        }

        openTroveItems.push(
          <span>
            Total initial debt is{' '}
            <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
              {tx.stateAfter.debt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {openFee > 0 && ' including the borrowing fee'}
          </span>
        );

        if (collUsdValue) {
          openTroveItems.push(
            <span>
              Collateral value at opening: ${collUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {priceDisplay && ` (${tx.collateralType} price: $${priceDisplay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
            </span>
          );
        }

        openTroveItems.push(
          <span>
            Position opened with a{' '}
            <HighlightableValue type="collRatio" state="after" value={collRatio}>
              {collRatio}%
            </HighlightableValue>
            {' '}collateralization ratio
            {isHighRisk && ' (aggressive - higher liquidation risk)'}
            {isConservative && ' (conservative - lower liquidation risk)'}
          </span>,
          <span>
            Annual interest rate set at{' '}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>
            , compounding continuously
          </span>
        );
        
        openTroveItems.push(
          <span className="text-slate-300">
            Liquity Trove successfully opened
          </span>
        );
        
        return (
          <ExplanationPanel items={openTroveItems} onToggle={handleToggle} />
        );
      
      case 'openTroveAndJoinBatch':
        const batchOpenFee = getUpfrontFee();
        const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
        const batchCollRatio = tx.stateAfter.collateralRatio;
        const batchCollUsdValue = tx.stateAfter.collateralInUsd;
        
        const batchItems: React.ReactNode[] = [
          <span>
            Opened a new Trove and joined batch management under{' '}
            <span className="font-medium">{tx.stateAfter.interestBatchManager || 'Unknown manager'}</span>
          </span>,
          <span>
            Deposited{' '}
            <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
              {tx.stateAfter.coll} {tx.collateralType}
            </HighlightableValue>
            {' '}as collateral
          </span>,
          <span>
            Borrowed{' '}
            <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
              {batchPrincipalBorrowed.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {' '}through the batch
          </span>
        ];

        if (batchOpenFee > 0) {
          batchItems.push(
            <span>
              Paid a{' '}
              <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
                {batchOpenFee.toFixed(2)} {tx.assetType}
              </HighlightableValue>
              {' '}upfront borrowing fee
            </span>
          );
        }

        batchItems.push(
          <span>
            Total debt is{' '}
            <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
              {tx.stateAfter.debt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {batchOpenFee > 0 && ' including fees'}
          </span>
        );

        if (batchCollUsdValue) {
          batchItems.push(
            <span>
              Collateral value at opening: ${batchCollUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {tx.collateralPrice && ` (${tx.collateralType} price: $${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
            </span>
          );
        }

        batchItems.push(
          <span>
            Starting collateral ratio:{' '}
            <HighlightableValue type="collRatio" state="after" value={batchCollRatio}>
              {batchCollRatio ? batchCollRatio.toFixed(1) : '0'}%
            </HighlightableValue>
          </span>,
          <span>
            Batch interest rate:{' '}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>
            {' '}annual (managed by batch operator)
          </span>
        );

        batchItems.push(
          <span className="text-yellow-500">
            ⚠️ Batch management may include additional annual management fees
          </span>
        );
        
        batchItems.push(
          <span className="text-slate-300">
            Trove opened with batch management
          </span>
        );
        
        return (
          <ExplanationPanel items={batchItems} onToggle={handleToggle} />
        );
      
      case 'closeTrove':
        const stateBefore = tx.stateBefore || tx.stateAfter;
        const closeCollUsdValue = stateBefore.collateralInUsd;
        const beforeInterestRateClose = stateBefore.annualInterestRate;
        const beforeCollRatioClose = stateBefore.collateralRatio;
        
        const closeTroveItems: React.ReactNode[] = [
          <span>
            Fully repaid the outstanding debt of{' '}
            <HighlightableValue type="debt" state="change" value={stateBefore.debt}>
              {stateBefore.debt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
          </span>,
          <span>
            Retrieved all{' '}
            <HighlightableValue type="collateral" state="change" value={stateBefore.coll}>
              {stateBefore.coll} {tx.collateralType}
            </HighlightableValue>
            {' '}collateral
            {closeCollUsdValue && (
              <span className="text-slate-400">
                {' '}(valued at ${closeCollUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            )}
          </span>,
          <span>The 200 {tx.assetType} liquidation reserve was returned</span>
        ];

        if (beforeInterestRateClose) {
          closeTroveItems.push(
            <span className="text-slate-400">
              Position was paying {beforeInterestRateClose}% annual interest before closure
            </span>
          );
        }

        if (beforeCollRatioClose) {
          closeTroveItems.push(
            <span className="text-slate-400">
              Closed with a {beforeCollRatioClose}% collateral ratio
            </span>
          );
        }
        
        closeTroveItems.push(
          <span className="text-slate-300">
            Trove successfully closed - all obligations settled
          </span>
        );
        
        return (
          <ExplanationPanel items={closeTroveItems} onToggle={handleToggle} />
        );
      
      case 'adjustTrove':
        if (!isTroveTransaction(tx)) return null;
        
        // Calculate changes
        const collChange = tx.troveOperation.collChangeFromOperation;
        const debtChange = tx.troveOperation.debtChangeFromOperation;
        const adjustFee = getUpfrontFee();
        const beforeColl = tx.stateBefore?.coll || 0;
        const afterColl = tx.stateAfter.coll;
        const beforeDebt = tx.stateBefore?.debt || 0;
        const afterDebt = tx.stateAfter.debt;
        const beforeCollRatio = tx.stateBefore?.collateralRatio;
        const afterCollRatio = tx.stateAfter.collateralRatio;
        const beforeCollUsd = tx.stateBefore?.collateralInUsd;
        const afterCollUsd = tx.stateAfter.collateralInUsd;
        const beforeInterestRate = tx.stateBefore?.annualInterestRate;
        const afterInterestRate = tx.stateAfter.annualInterestRate;
        
        // Determine the type of adjustment
        const isDeleveraging = collChange < 0 || debtChange < 0;
        const isLeveraging = collChange > 0 || debtChange > 0;
        const collRatioImproved = afterCollRatio && beforeCollRatio && afterCollRatio > beforeCollRatio;
        
        const adjustTroveItems: React.ReactNode[] = [];

        if (collChange !== 0) {
          adjustTroveItems.push(
            <span>
              {collChange > 0 ? 'Added ' : 'Withdrew '}
              <HighlightableValue type="collateral" state="change" value={Math.abs(collChange)}>
                {Math.abs(collChange)} {tx.collateralType}
              </HighlightableValue>
              {collChange > 0 
                ? ' to strengthen the position' 
                : ' from collateral, reducing exposure'}
            </span>
          );
        }

        if (debtChange !== 0) {
          adjustTroveItems.push(
            <span>
              {debtChange > 0 ? 'Borrowed an additional ' : 'Paid down '}
              <HighlightableValue type="debt" state="change" value={Math.abs(debtChange)}>
                {Math.abs(debtChange).toLocaleString()} {tx.assetType}
              </HighlightableValue>
              {debtChange > 0 
                ? ', increasing leverage' 
                : ' of the outstanding debt'}
            </span>
          );
        }

        if (adjustFee > 0) {
          adjustTroveItems.push(
            <span>
              Adjustment incurred a{' '}
              <HighlightableValue type="upfrontFee" state="fee" value={adjustFee}>
                {adjustFee.toFixed(2)} {tx.assetType}
              </HighlightableValue>
              {' '}borrowing fee
            </span>
          );
        }

        adjustTroveItems.push(
          <span>
            Position now holds{' '}
            <HighlightableValue type="collateral" state="after" value={afterColl}>
              {afterColl} {tx.collateralType}
            </HighlightableValue>
            {' '}collateral against{' '}
            <HighlightableValue type="debt" state="after" value={afterDebt}>
              {afterDebt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {' '}debt
          </span>
        );

        if (afterCollUsd) {
          adjustTroveItems.push(
            <span>
              Current collateral value: ${afterCollUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {tx.collateralPrice && ` (${tx.collateralType} price: $${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
            </span>
          );
        }

        if (collRatioImproved) {
          adjustTroveItems.push(
            <span>
              Improved collateral ratio to{' '}
              <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
                {afterCollRatio}%
              </HighlightableValue>
              , reducing liquidation risk
            </span>
          );
        } else if (beforeCollRatio && afterCollRatio && beforeCollRatio !== afterCollRatio) {
          adjustTroveItems.push(
            <span>
              Collateral ratio changed to{' '}
              <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
                {afterCollRatio}%
              </HighlightableValue>
              {afterCollRatio < beforeCollRatio ? ', increasing liquidation risk' : ''}
            </span>
          );
        }

        if (beforeInterestRate !== afterInterestRate) {
          adjustTroveItems.push(
            <span>
              Interest rate adjusted from{' '}
              <HighlightableValue type="interestRate" state="before" value={beforeInterestRate || 0}>
                {beforeInterestRate || 0}%
              </HighlightableValue>
              {' '}to{' '}
              <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
                {afterInterestRate}%
              </HighlightableValue>
              {' '}annual
            </span>
          );
        } else {
          adjustTroveItems.push(
            <span>
              Interest rate remains at{' '}
              <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
                {afterInterestRate}%
              </HighlightableValue>
              {' '}annual
            </span>
          );
        }
        
        
        return (
          <ExplanationPanel items={adjustTroveItems} onToggle={handleToggle} />
        );
      
      case 'adjustTroveInterestRate':
        const prevRate = tx.stateBefore?.annualInterestRate || 0;
        const newRate = tx.stateAfter.annualInterestRate;
        const rateBeforeDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
        const rateAfterDebt = tx.stateAfter.debt;
        const rateBeforeColl = tx.stateBefore?.coll || tx.stateAfter.coll;
        const rateAfterColl = tx.stateAfter.coll;
        const rateBeforeCollRatio = tx.stateBefore?.collateralRatio;
        const rateAfterCollRatio = tx.stateAfter.collateralRatio;
        const rateDifference = newRate - prevRate;
        const isRateIncrease = rateDifference > 0;
        
        const interestRateItems: React.ReactNode[] = [
          <span>
            {isRateIncrease ? 'Increased' : 'Decreased'} the interest rate from{' '}
            <HighlightableValue type="interestRate" state="before" value={prevRate}>
              {prevRate}%
            </HighlightableValue>
            {' '}to{' '}
            <HighlightableValue type="interestRate" state="after" value={newRate}>
              {newRate}%
            </HighlightableValue>
            {' '}annual
          </span>,
          <span>
            This is a {Math.abs(rateDifference).toFixed(2)} percentage point {isRateIncrease ? 'increase' : 'decrease'} in borrowing cost
          </span>
        ];

        if (rateBeforeDebt !== rateAfterDebt) {
          interestRateItems.push(
            <span>
              Debt updated from{' '}
              <HighlightableValue type="debt" state="before" value={rateBeforeDebt}>
                {rateBeforeDebt.toLocaleString()}
              </HighlightableValue>
              {' '}to{' '}
              <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
                {rateAfterDebt.toLocaleString()} {tx.assetType}
              </HighlightableValue>
              {' '}(likely from accrued interest)
            </span>
          );
        } else {
          interestRateItems.push(
            <span>
              Debt remains at{' '}
              <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
                {rateAfterDebt.toLocaleString()} {tx.assetType}
              </HighlightableValue>
            </span>
          );
        }

        interestRateItems.push(
          <span>
            Collateral remains at{' '}
            <HighlightableValue type="collateral" state="after" value={rateAfterColl}>
              {rateAfterColl} {tx.collateralType}
            </HighlightableValue>
          </span>
        );

        if (tx.stateAfter.collateralInUsd) {
          interestRateItems.push(
            <span>
              Current collateral value: ${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {tx.collateralPrice && ` (${tx.collateralType} price: $${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
            </span>
          );
        }

        if (rateBeforeCollRatio !== undefined && rateBeforeCollRatio !== rateAfterCollRatio) {
          interestRateItems.push(
            <span>
              Collateral ratio adjusted to{' '}
              <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
                {rateAfterCollRatio}%
              </HighlightableValue>
              {' '}due to debt changes
            </span>
          );
        } else if (rateAfterCollRatio !== undefined) {
          interestRateItems.push(
            <span>
              Collateral ratio remains at{' '}
              <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
                {rateAfterCollRatio}%
              </HighlightableValue>
            </span>
          );
        }

        interestRateItems.push(
          <span className="text-slate-300">
            Interest rate successfully adjusted
          </span>
        );
        
        return (
          <ExplanationPanel items={interestRateItems} onToggle={handleToggle} />
        );
      
      case 'liquidate':
        const liquidatedColl = tx.stateBefore?.coll || tx.stateAfter.coll;
        const liquidatedDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
        const liquidatedCollUsd = tx.stateBefore?.collateralInUsd;
        const liquidationBeforeCollRatio = tx.stateBefore?.collateralRatio;
        const liquidationBeforeInterestRate = tx.stateBefore?.annualInterestRate || tx.stateAfter.annualInterestRate;
        
        const liquidateItems: React.ReactNode[] = [
          <span className="text-red-400">
            Trove was liquidated due to insufficient collateral ratio
          </span>,
          <span>
            The protocol seized{' '}
            <HighlightableValue type="collateral" state="change" value={liquidatedColl}>
              {liquidatedColl} {tx.collateralType}
            </HighlightableValue>
            {liquidatedCollUsd ? ` valued at $${liquidatedCollUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
          </span>,
          <span>
            Outstanding debt of{' '}
            <HighlightableValue type="debt" state="change" value={liquidatedDebt}>
              {liquidatedDebt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {' '}was cleared by the liquidator
          </span>
        ];

        if (liquidationBeforeCollRatio !== undefined) {
          liquidateItems.push(
            <span>
              Collateral ratio had fallen to {liquidationBeforeCollRatio}% before liquidation
            </span>
          );
        }

        if (liquidationBeforeInterestRate !== undefined) {
          liquidateItems.push(
            <span>
              Interest rate was {liquidationBeforeInterestRate}% annual before closure
            </span>
          );
        }

        liquidateItems.push(
          <span>
            All collateral is now{' '}
            <HighlightableValue type="collateral" state="after" value={0}>
              0 {tx.collateralType}
            </HighlightableValue>
          </span>,
          <span>
            All debt is now{' '}
            <HighlightableValue type="debt" state="after" value={0}>
              0 {tx.assetType}
            </HighlightableValue>
          </span>,
          <span className="text-yellow-500">
            ⚠️ Liquidation occurs when collateral ratio falls below the minimum threshold
          </span>,
          <span className="text-slate-300">
            Trove closed through liquidation
          </span>
        );
        
        return (
          <ExplanationPanel items={liquidateItems} onToggle={handleToggle} />
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
          <span>
            A {tx.assetType} holder redeemed against this Trove (selected due to its {tx.stateAfter.annualInterestRate}% interest rate)
          </span>,
          <span>
            The redeemer received{' '}
            <HighlightableValue type="collateral" state="change" value={collateralTransferredOut}>
              {collateralTransferredOut} {tx.collateralType}
            </HighlightableValue>
            {collValueLost > 0 ? ` valued at $${collValueLost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            {' '}from the Trove's collateral
          </span>,
          <span>
            The Trove's debt was reduced by{' '}
            <HighlightableValue type="debt" state="change" value={debtRedeemed}>
              {debtRedeemed.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            {' '}in exchange for the redeemed collateral
          </span>
        ];

        if (redemptionFee > 0) {
          redeemItems.push(
            <span>
              A redemption fee of{' '}
              <HighlightableValue type="collateral" state="fee" value={redemptionFee}>
                {redemptionFee} {tx.collateralType}
              </HighlightableValue>
              {feeValueRetained > 0 ? ` ($${feeValueRetained.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}
              {' '}was retained in the Trove as additional collateral
            </span>
          );
        }

        redeemItems.push(
          <span>
            Post-redemption: Debt is{' '}
            <HighlightableValue type="debt" state="after" value={redeemAfterDebt}>
              {redeemAfterDebt.toLocaleString()} {tx.assetType}
            </HighlightableValue>
            , Collateral is{' '}
            <HighlightableValue type="collateral" state="after" value={redeemAfterColl}>
              {redeemAfterColl} {tx.collateralType}
            </HighlightableValue>
          </span>
        );

        if (redeemAfterCollUsd > 0) {
          redeemItems.push(
            <span>
              Current collateral value: ${redeemAfterCollUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {tx.collateralPrice && ` (at market price of $${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${tx.collateralType})`}
            </span>
          );
        }

        if (redeemAfterCollRatio !== undefined) {
          redeemItems.push(
            <span>
              Collateral ratio improved to{' '}
              <HighlightableValue type="collRatio" state="after" value={redeemAfterCollRatio}>
                {redeemAfterCollRatio}%
              </HighlightableValue>
            </span>
          );
        }

        redeemItems.push(
          <span>
            Interest rate unchanged at{' '}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>
            {' '}annually
          </span>
        );

        if (redemptionPrice > 0) {
          redeemItems.push(
            <span className={isProfit ? "text-green-400" : "text-red-400"}>
              Economic impact: ${netAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net {isProfit ? 'profit' : 'loss'} to Trove owner
            </span>
          );
          
          // Always show both prices for transparency
          redeemItems.push(
            <span className="text-slate-400 text-xs">
              Protocol redemption price: ${redemptionPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{tx.collateralType}
              {tx.collateralPrice ? ` • Current market price: $${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{tx.collateralType}` : ''}
            </span>
          );
        }

        if (isZombieTrove) {
          redeemItems.push(
            <span className="text-yellow-500">
              ⚠️ Zombie trove created {finalDebt === 0 ? '(zero debt)' : `(${finalDebt.toFixed(2)} ${tx.assetType} debt below 2000 minimum)`}
            </span>
          );
        }
        

        return (
          <ExplanationPanel items={redeemItems} onToggle={handleToggle} />
        );
      
      case 'setInterestBatchManager':
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
      
      case 'removeFromBatch':
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
      
      case 'applyPendingDebt':
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
      
      default:
        const defaultBeforeDebt = tx.stateBefore?.debt;
        const defaultAfterDebt = tx.stateAfter.debt;
        const defaultBeforeColl = tx.stateBefore?.coll;
        const defaultAfterColl = tx.stateAfter.coll;
        const defaultBeforeRatio = tx.stateBefore?.collateralRatio;
        const defaultAfterRatio = tx.stateAfter.collateralRatio;
        
        return (
          <div className="bg-slate-800/40 rounded-lg p-4 space-y-2">
            <div className="text-white space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{tx.operation.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} executed</span>
              </div>
              {defaultBeforeDebt !== undefined && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>Debt changed from {defaultBeforeDebt.toLocaleString()} to {defaultAfterDebt.toLocaleString()} {tx.assetType}</span>
                </div>
              )}
              {defaultBeforeColl !== undefined && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>Collateral changed from {defaultBeforeColl} to {defaultAfterColl} {tx.collateralType}</span>
                </div>
              )}
            </div>
            {defaultBeforeRatio && defaultAfterRatio && (
              <div className="pt-2 mt-2 border-t border-slate-700/50 flex items-center gap-4 text-sm text-slate-300">
                <span>Collateral ratio {defaultBeforeRatio}% → {defaultAfterRatio}%</span>
              </div>
            )}
          </div>
        );
    }
  };

  const explanation = generateExplanation();
  
  return (
    <div className="mb-6">
      {explanation}
    </div>
  );
}