import React from 'react';
import { Transaction, isRedemptionTransaction, isTroveTransaction } from '@/types/api/troveHistory';

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
    
    // Helper to format gas fee display
    const getGasFeeDisplay = () => {
      // Don't show gas fees for operations not initiated by the user
      const noGasOps = ['liquidate', 'redeemCollateral'];
      if (noGasOps.includes(tx.operation)) {
        return '';
      }
      
      // Don't show gas fee for delegate IR adjustments (batch manager operations)
      if (tx.operation === 'adjustTroveInterestRate' && tx.batchUpdate) {
        return '';
      }
      
      return '';
    };
    
    switch (tx.operation) {
      case 'openTrove':
        const openFee = getUpfrontFee();
        const principalBorrowed = tx.stateAfter.debt - openFee;
        const collRatio = tx.stateAfter.collateralRatio ? `${tx.stateAfter.collateralRatio.toFixed(1)}%` : 'N/A';
        const collUsdValue = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        const priceDisplay = tx.collateralPrice ? `$${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return `This transaction opened a new Trove position with ${tx.stateAfter.coll} ${tx.collateralType}${collUsdValue ? ` (${collUsdValue})` : ''} collateral and borrowed ${principalBorrowed} ${tx.assetType} at a ${tx.stateAfter.annualInterestRate}% annual interest rate.${openFee > 0 ? ` An upfront fee of ${openFee} ${tx.assetType} was charged based on the interest rate, making total debt ${tx.stateAfter.debt} ${tx.assetType}.` : ''} The initial collateral ratio is ${collRatio}.${priceDisplay ? `` : ''}`;
      
      case 'openTroveAndJoinBatch':
        const batchOpenFee = getUpfrontFee();
        const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
        const batchCollRatio = tx.stateAfter.collateralRatio ? `${tx.stateAfter.collateralRatio.toFixed(1)}%` : 'N/A';
        const batchCollUsdValue = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        const batchPriceDisplay = tx.collateralPrice ? `$${tx.collateralPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return `This transaction opened a new Trove position with ${tx.stateAfter.coll} ${tx.collateralType}${batchCollUsdValue ? ` (${batchCollUsdValue})` : ''} collateral and borrowed ${batchPrincipalBorrowed} ${tx.assetType}. The position was immediately added to a batch with a ${tx.stateAfter.annualInterestRate}% annual interest rate.${batchOpenFee > 0 ? ` An upfront fee of ${batchOpenFee} ${tx.assetType} was charged making total debt ${tx.stateAfter.debt} ${tx.assetType}.` : ''} The initial collateral ratio is ${batchCollRatio}.${batchPriceDisplay ? `.` : ''}`;
      
      case 'closeTrove':
        const stateBefore = tx.stateBefore || tx.stateAfter;
        const closeCollUsdValue = stateBefore.collateralInUsd ? `$${stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return `This transaction closed the Trove position, returning ${stateBefore.coll} ${tx.collateralType}${closeCollUsdValue ? ` (${closeCollUsdValue})` : ''} collateral to the owner and repaying ${stateBefore.debt} ${tx.assetType} debt.`;
      
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
          parts.push(`adding ${collChange} ${tx.collateralType} collateral, increasing from ${beforeColl} ${tx.collateralType}${beforeCollUsd ? ` (${beforeCollUsd})` : ''} to ${afterColl} ${tx.collateralType}${afterCollUsd ? ` (${afterCollUsd})` : ''}`);
        } else if (collChange < 0) {
          const beforeColl = tx.stateBefore?.coll || 0;
          const afterColl = tx.stateAfter.coll;
          const beforeCollUsd = tx.stateBefore?.collateralInUsd ? `$${tx.stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          const afterCollUsd = tx.stateAfter.collateralInUsd ? `$${tx.stateAfter.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
          parts.push(`withdrawing ${Math.abs(collChange)} ${tx.collateralType} collateral, reducing from ${beforeColl} ${tx.collateralType}${beforeCollUsd ? ` (${beforeCollUsd})` : ''} to ${afterColl} ${tx.collateralType}${afterCollUsd ? ` (${afterCollUsd})` : ''}`);
        }
        
        if (debtChange > 0) {
          parts.push(`borrowing ${debtChange} ${tx.assetType}`);
        } else if (debtChange < 0) {
          parts.push(`repaying ${Math.abs(debtChange)} ${tx.assetType}`);
        }
        
        if (parts.length > 0) {
          adjustmentDesc += ' by ' + parts.join(' and ') + '.';
        } else {
          adjustmentDesc += '.';
        }
        
        if (adjustFee > 0) {
          adjustmentDesc += ` An upfront fee of ${adjustFee} ${tx.assetType} was charged.`;
        }
        
        adjustmentDesc += getGasFeeDisplay();
        
        return adjustmentDesc;
      
      case 'adjustTroveInterestRate':
        const prevRate = tx.stateBefore?.annualInterestRate || 0;
        const newRate = tx.stateAfter.annualInterestRate;
        return `This transaction changed the Trove's interest rate from ${prevRate}% to ${newRate}%.`;
      
      case 'liquidate':
        const liquidatedColl = tx.stateBefore?.coll || tx.stateAfter.coll;
        const liquidatedDebt = tx.stateBefore?.debt || tx.stateAfter.debt;
        const liquidatedCollUsd = tx.stateBefore?.collateralInUsd ? `$${tx.stateBefore.collateralInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        return `This transaction liquidated the Trove position due to insufficient collateral ratio. ${liquidatedColl} ${tx.collateralType}${liquidatedCollUsd ? ` (${liquidatedCollUsd})` : ''} collateral was seized and ${liquidatedDebt} ${tx.assetType} debt was cleared. The liquidation was triggered when the collateral ratio fell below the minimum requirement.`;
      
      case 'redeemCollateral':
        if (!isRedemptionTransaction(tx)) return null;
        const collRedeemed = Math.abs(tx.troveOperation.collChangeFromOperation);
        const debtRedeemed = Math.abs(tx.troveOperation.debtChangeFromOperation);
        const redemptionFee = tx.systemRedemption?.ETHFee || 0;
        const redemptionPrice = tx.systemRedemption?.redemptionPrice || 0;
        const finalDebt = tx.stateAfter.debt;
        const isZombieTrove = finalDebt >= 0 && finalDebt < 2000; // MIN_DEBT in BOLD
        
        // Calculate net impact values
        const collValueLost = redemptionPrice > 0 ? collRedeemed * redemptionPrice : 0;
        const feeValueReceived = redemptionPrice > 0 ? redemptionFee * redemptionPrice : 0;
        const netLoss = collValueLost - debtRedeemed - feeValueReceived;
        const isProfit = netLoss < 0;
        const netAmount = Math.abs(netLoss);
        
        // Build the explanation as plain text
        // Calculate the difference in USD values from before to after for the redeemed collateral
        const beforeCollUsd = tx.stateBefore?.collateralInUsd || 0;
        const afterCollUsd = tx.stateAfter.collateralInUsd || 0;
        const collRedeemedUsdValue = beforeCollUsd > afterCollUsd ? `$${(beforeCollUsd - afterCollUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
        
        let explanation = collRedeemed > 0 
          ? `A ${tx.assetType} holder redeemed ${debtRedeemed} ${tx.assetType} against this Trove, resulting in ${collRedeemed} ${tx.collateralType}${collRedeemedUsdValue ? ` (${collRedeemedUsdValue})` : ''} collateral being transferred to the redeemer and ${debtRedeemed} ${tx.assetType} debt being cleared.`
          : `A ${tx.assetType} holder redeemed ${debtRedeemed} ${tx.assetType} against this zombie Trove. No collateral was transferred as the Trove has insufficient collateral, but ${debtRedeemed} ${tx.assetType} debt was cleared.`;
        
        if (redemptionFee > 0) {
          explanation += ` The Trove owner received ${redemptionFee} ${tx.collateralType} as a redemption fee.`;
        } else {
          explanation += ` No redemption fee was paid to the Trove owner for this transaction.`;
        }
        
        if (redemptionPrice > 0) {
          explanation += ` At the redemption price of $${redemptionPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per ${tx.collateralType}, the Trove owner experienced a net ${isProfit ? 'profit' : 'loss'} of $${netAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from this redemption ($${collValueLost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} collateral value lost minus $${debtRedeemed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} debt cleared${redemptionFee > 0 ? ` minus $${feeValueReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} fee compensation` : ''}).`;
        }
        
        if (isZombieTrove) {
          if (finalDebt === 0) {
            explanation += ` This redemption created a zombie trove (zero debt) that can be revived by borrowing at least 2000 ${tx.assetType}.`;
          } else {
            explanation += ` This redemption created a zombie trove with only ${finalDebt} ${tx.assetType} debt, below the 2000 ${tx.assetType} minimum.`;
          }
        }
        
        return explanation;
      
      case 'setInterestBatchManager':
        const joinRate = tx.stateAfter.annualInterestRate;
        const prevIndividualRate = tx.stateBefore?.annualInterestRate || joinRate;
        return `This transaction moved the Trove from individual management to batch management, changing the interest rate from ${prevIndividualRate}% to ${joinRate}%. Batch management may include annual management fees.`;
      
      case 'removeFromBatch':
        const exitRate = tx.stateAfter.annualInterestRate;
        const prevBatchRate = tx.stateBefore?.annualInterestRate || exitRate;
        return `This transaction removed the Trove from batch management, returning it to individual management. The interest rate changed from ${prevBatchRate}% to ${exitRate}%.`;
      
      case 'applyPendingDebt':
        return `This transaction applied pending interest and fee updates to the Trove. The debt was updated to reflect accumulated interest and any management fees.`;
      
      default:
        return `This ${tx.operation.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} transaction modified the Trove position. The final state shows ${tx.stateAfter.debt} ${tx.assetType} debt and ${tx.stateAfter.coll} ${tx.collateralType} collateral.`;
    }
  };

  const explanation = generateExplanation();
  
  return (
    <div className="text-slate-300 leading-relaxed text-sm space-y-4">
      {explanation}
    </div>
  );
}