import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue, toLocaleStringHelper } from "@/lib/utils/format";

interface AdjustTroveInterestRateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function AdjustTroveInterestRateExplanation({ transaction, onToggle }: AdjustTroveInterestRateExplanationProps) {
  const tx = transaction as any;
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
    <span key="rateChange" className="text-slate-500">
      {isRateIncrease ? "Increased" : "Decreased"} the interest rate to{" "}
      <HighlightableValue type="interestRate" state="after" value={newRate}>
        {newRate}%
      </HighlightableValue>{" "}
      <InfoButton href={FAQ_URLS.USER_SET_RATES} />
    </span>,
  ];

  if (rateBeforeDebt !== rateAfterDebt) {
    interestRateItems.push(
      <span key="debtUpdate" className="text-slate-500">
        Debt increased to{" "}
        <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
          {formatCurrency(rateAfterDebt, tx.assetType)}
        </HighlightableValue>{" "}
        from accrued interest since last event
      </span>,
    );
  } else {
    interestRateItems.push(
      <span key="debtSame" className="text-slate-500">
        Debt remains at{" "}
        <HighlightableValue type="debt" state="after" value={rateAfterDebt}>
          {formatCurrency(rateAfterDebt, tx.assetType)}
        </HighlightableValue>
      </span>,
    );
  }

  interestRateItems.push(
    <span key="collateral" className="text-slate-500">
      Collateral remains at{" "}
      <HighlightableValue type="collateral" state="after" value={rateAfterColl}>
        {rateAfterColl} {tx.collateralType}
      </HighlightableValue>
    </span>,
  );

  if (tx.stateAfter.collateralInUsd && tx.collateralPrice) {
    interestRateItems.push(
      <span key="collValue" className="text-slate-500">
        Current collateral valued at{" "}
        <HighlightableValue type="collateralUsd" state="after" value={tx.stateAfter.collateralInUsd}>
          {formatUsdValue(tx.stateAfter.collateralInUsd)}
        </HighlightableValue>{" "}
        with historic price of{" "}
        <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
          {formatUsdValue(tx.collateralPrice)}
        </HighlightableValue>{" "}
        / {tx.collateralType}
      </span>,
    );
  }

  if (rateBeforeCollRatio !== undefined && rateBeforeCollRatio !== rateAfterCollRatio) {
    interestRateItems.push(
      <span key="collRatioAdjusted" className="text-slate-500">
        Collateral ratio adjusted to{" "}
        <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
          {rateAfterCollRatio.toFixed(1)}%
        </HighlightableValue>{" "}
        due to debt changes
      </span>,
    );
  } else if (rateAfterCollRatio !== undefined) {
    interestRateItems.push(
      <span key="collRatioSame" className="text-slate-500">
        Collateral ratio remains at{" "}
        <HighlightableValue type="collRatio" state="after" value={rateAfterCollRatio}>
          {rateAfterCollRatio.toFixed(1)}%
        </HighlightableValue>
      </span>,
    );
  }

  return (
    <ExplanationPanel
      items={interestRateItems}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
