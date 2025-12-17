import React from "react";
import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { getUpfrontFee } from "../shared/eventHelpers";
import { calculateInterestBetweenTransactions } from "@/lib/utils/interest-calculator";

interface AdjustTroveExplanationProps {
  transaction: Transaction;
  previousTransaction?: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function AdjustTroveExplanation({ transaction, previousTransaction, onToggle, defaultOpen }: AdjustTroveExplanationProps) {
  const tx = transaction as any;

  if (!isTroveTransaction(tx)) return null;

  // Calculate changes
  const collChange = tx.troveOperation.collChangeFromOperation;
  const debtChange = tx.troveOperation.debtChangeFromOperation;
  const adjustFee = getUpfrontFee(tx);
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

  // Calculate accrued interest since last operation
  const { accruedInterest, accruedManagementFees } = calculateInterestBetweenTransactions(tx, previousTransaction);
  const totalAccruedFees = accruedInterest + accruedManagementFees;

  // Determine the type of adjustment
  const isDeleveraging = collChange < 0 || debtChange < 0;
  const isLeveraging = collChange > 0 || debtChange > 0;
  const collRatioImproved = afterCollRatio && beforeCollRatio && afterCollRatio > beforeCollRatio;

  const adjustTroveItems: React.ReactNode[] = [];

  if (collChange !== 0) {
    adjustTroveItems.push(
      <span key="collChange" className="text-slate-500">
        {collChange > 0 ? "Added " : "Withdrew "}
        <HighlightableValue type="collateral" state="change" value={Math.abs(collChange)}>
          {Math.abs(collChange)} {tx.collateralType}
        </HighlightableValue>
        {collChange > 0 ? " to strengthen the position" : " from collateral, reducing exposure"}
      </span>,
    );
  }

  if (debtChange !== 0) {
    adjustTroveItems.push(
      <span key="debtChange" className="text-slate-500">
        {debtChange > 0 ? "Borrowed an additional " : "Paid down "}
        <HighlightableValue type="debt" state="change" value={Math.abs(debtChange)}>
          {formatCurrency(Math.abs(debtChange), tx.assetType)}
        </HighlightableValue>
      </span>,
    );
  }

  // Show accrued interest if there was a previous transaction
  if (totalAccruedFees > 0.01) {
    adjustTroveItems.push(
      <span key="accruedInterest" className="text-slate-500">
        Accrued interest since last operation:{" "}
        <HighlightableValue type="interest" state="fee" value={totalAccruedFees}>
          {totalAccruedFees.toFixed(2)} {tx.assetType}
        </HighlightableValue>
        {accruedManagementFees > 0 && (
          <span className="text-slate-400 text-xs ml-1">
            (including {accruedManagementFees.toFixed(2)} {tx.assetType} management fee)
          </span>
        )}
      </span>,
    );
  }

  if (adjustFee > 0) {
    adjustTroveItems.push(
      <span key="fee" className="text-slate-500">
        Adjustment incurred a{" "}
        <HighlightableValue type="upfrontFee" state="fee" value={adjustFee}>
          {adjustFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>{" "}
        borrowing fee (7 days of average interest on the respective borrow market)
        {' '}<InfoButton href={FAQ_URLS.BORROWING_FEES} />
      </span>,
    );
  }

  // Add debt breakdown if there's a combination of borrowed amount, fees, and accrued interest
  if (debtChange > 0 && (adjustFee > 0 || totalAccruedFees > 0.01)) {
    const totalDebtIncrease = afterDebt - beforeDebt;
    adjustTroveItems.push(
      <span key="debtBreakdown" className="text-slate-500">
        Total debt increase:{" "}
        <HighlightableValue type="debt" state="change" value={totalDebtIncrease}>
          {formatCurrency(totalDebtIncrease, tx.assetType)}
        </HighlightableValue>{" "}
        <span className="text-slate-400 text-xs">
          (borrowed: {formatCurrency(debtChange, tx.assetType)}
          {totalAccruedFees > 0.01 && ` + accrued: ${totalAccruedFees.toFixed(2)}`}
          {adjustFee > 0 && ` + fee: ${adjustFee.toFixed(2)}`})
        </span>
      </span>,
    );
  }

  adjustTroveItems.push(
    <span key="currentPosition" className="text-slate-500">
      Position now holds{" "}
      <HighlightableValue type="collateral" state="after" value={afterColl}>
        {afterColl} {tx.collateralType}
      </HighlightableValue>{" "}
      collateral against{" "}
      <HighlightableValue type="debt" state="after" value={afterDebt}>
        {formatCurrency(afterDebt, tx.assetType)}
      </HighlightableValue>{" "}
      debt
    </span>,
  );

  if (afterCollUsd && tx.collateralPrice) {
    adjustTroveItems.push(
      <span key="collValue" className="text-slate-500">
        Current collateral valued at{" "}
        <HighlightableValue type="collateralUsd" state="after" value={afterCollUsd}>
          {formatUsdValue(afterCollUsd)}
        </HighlightableValue>{" "}
        with historic price of{" "}
        <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
          {formatUsdValue(tx.collateralPrice)}
        </HighlightableValue>{" "}
        / {tx.collateralType}
      </span>,
    );
  }

  if (collRatioImproved) {
    adjustTroveItems.push(
      <span key="improvedRatio" className="text-slate-500">
        Improved collateral ratio to{" "}
        <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
          {afterCollRatio.toFixed(1)}%
        </HighlightableValue>
        , reducing liquidation risk{' '}
        <InfoButton href={FAQ_URLS.LTV_COLLATERAL_RATIO} />
      </span>,
    );
  } else if (beforeCollRatio && afterCollRatio && beforeCollRatio !== afterCollRatio) {
    adjustTroveItems.push(
      <span key="changedRatio" className="text-slate-500">
        Collateral ratio changed to{" "}
        <HighlightableValue type="collRatio" state="after" value={afterCollRatio}>
          {afterCollRatio.toFixed(1)}%
        </HighlightableValue>
        {afterCollRatio < beforeCollRatio ? ", increasing liquidation risk" : ""}
        {' '}<InfoButton href={FAQ_URLS.LTV_COLLATERAL_RATIO} />
      </span>,
    );
  }

  if (beforeInterestRate !== afterInterestRate) {
    adjustTroveItems.push(
      <span key="rateChange" className="text-slate-500">
        Annual interest rate adjusted from {beforeInterestRate || 0}% to{" "}
        <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
          {afterInterestRate}%
        </HighlightableValue>
      </span>,
    );
  } else {
    adjustTroveItems.push(
      <span key="rateSame" className="text-slate-500">
        Annual interest rate remains at{" "}
        <HighlightableValue type="interestRate" state="after" value={afterInterestRate}>
          {afterInterestRate}%
        </HighlightableValue>
      </span>,
    );
  }

  return (
    <ExplanationPanel
      items={adjustTroveItems}
      onToggle={onToggle}
      defaultOpen={defaultOpen ?? false}
      transactionHash={transaction.transactionHash}
    />
  );
}
