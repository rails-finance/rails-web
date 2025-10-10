import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";

interface LiquidateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function LiquidateExplanation({ transaction, onToggle }: LiquidateExplanationProps) {
  const tx = transaction as any;

  // Determine if this is a beneficial liquidation (trove gains from redistribution)
  // vs destructive liquidation (this trove gets liquidated)
  const { collIncreaseFromRedist, debtIncreaseFromRedist } = tx.troveOperation || {};
  const isBeneficialLiquidation = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;

  const liquidationBeforeCollRatio = tx.stateBefore?.collateralRatio;
  const liquidationBeforeInterestRate = tx.stateBefore?.annualInterestRate || tx.stateAfter.annualInterestRate;

  // For destructive liquidations, use systemLiquidation data
  const totalCollLiquidated =
    tx.systemLiquidation?.collSentToSP +
    tx.systemLiquidation?.collRedistributed +
    tx.systemLiquidation?.collSurplus;
  const totalDebtCleared = tx.systemLiquidation?.debtOffsetBySP + tx.systemLiquidation?.debtRedistributed;
  const liquidatedCollUsd = totalCollLiquidated * (tx.collateralPrice || 0);

  let liquidateItems: React.ReactNode[] = [];

  if (isBeneficialLiquidation) {
    // Beneficial liquidation - this trove gained from redistribution
    const collateralGained = collIncreaseFromRedist;
    const debtInherited = debtIncreaseFromRedist;
    const collateralGainedUsd = collateralGained * (tx.collateralPrice || 0);
    const netBenefit = collateralGainedUsd - debtInherited;

    liquidateItems = [
      <span key="redistributionGain" className="text-green-600">
        ✅ Your trove benefited from another trove's liquidation through redistribution
        <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
      </span>,
      <span key="collateralGained" className="text-slate-500">
        You received{" "}
        <HighlightableValue type="collateral" state="after" value={collateralGained}>
          {collateralGained} {tx.collateralType}
        </HighlightableValue>
        {collateralGainedUsd > 0 ? ` (≈ ${formatUsdValue(collateralGainedUsd)})` : ""} from the liquidated trove
      </span>,
      <span key="debtInherited" className="text-slate-500">
        You inherited{" "}
        <HighlightableValue type="debt" state="after" value={debtInherited}>
          {formatCurrency(debtInherited, tx.assetType)}
        </HighlightableValue>{" "}
        proportional to your collateral amount
      </span>,
      <span key="netBenefit" className={netBenefit >= 0 ? "text-green-600" : "text-yellow-500"}>
        Net impact: {netBenefit >= 0 ? "+" : ""}
        {formatUsdValue(netBenefit)}
        {netBenefit >= 0 ? " (beneficial due to liquidation penalty)" : " (small cost)"}
      </span>,
      <span key="redistributionMechanism" className="text-slate-500">
        This redistribution happened because the Stability Pool couldn't fully cover the liquidation
        <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
      </span>,
    ];
  } else {
    // Destructive liquidation - this trove got liquidated
    liquidateItems = [
      <span key="liquidated" className="text-slate-500">
        Trove was liquidated due to insufficient collateral ratio
        <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
      </span>,
    ];

    // Show collateral distribution breakdown if available
    if (tx.systemLiquidation) {
      if (tx.systemLiquidation.collSentToSP > 0) {
        liquidateItems.push(
          <span key="collToSP" className="text-slate-500">
            {formatCurrency(tx.systemLiquidation.collSentToSP, tx.collateralType)} collateral sent to Stability Pool
          </span>,
        );
      }
      if (tx.systemLiquidation.collRedistributed > 0) {
        liquidateItems.push(
          <span key="collRedistributed" className="text-slate-500">
            {formatCurrency(tx.systemLiquidation.collRedistributed, tx.collateralType)} collateral redistributed to
            other troves
          </span>,
        );
      }
      if (tx.systemLiquidation.collSurplus > 0) {
        liquidateItems.push(
          <span key="collSurplus" className="text-slate-500">
            {formatCurrency(tx.systemLiquidation.collSurplus, tx.collateralType)} collateral surplus available for
            owner to claim
          </span>,
        );
      }

      // Show debt distribution breakdown
      if (tx.systemLiquidation.debtOffsetBySP > 0) {
        liquidateItems.push(
          <span key="debtToSP" className="text-slate-500">
            {formatCurrency(tx.systemLiquidation.debtOffsetBySP, tx.assetType)} debt offset by Stability Pool
          </span>,
        );
      }
      if (tx.systemLiquidation.debtRedistributed > 0) {
        liquidateItems.push(
          <span key="debtRedistributed" className="text-slate-500">
            {formatCurrency(tx.systemLiquidation.debtRedistributed, tx.assetType)} debt redistributed to other troves
          </span>,
        );
      }
    }
  }

  // Additional details for destructive liquidations only
  if (!isBeneficialLiquidation) {
    // Only show collateral ratio if it's a valid value (not 0)
    if (liquidationBeforeCollRatio !== undefined && liquidationBeforeCollRatio > 0) {
      liquidateItems.push(
        <span key="ratioBeforeLiquidation" className="text-slate-500">
          Collateral ratio had fallen to {liquidationBeforeCollRatio.toFixed(2)}% before liquidation
        </span>,
      );
    }

    // Only show interest rate if it's a valid value (not 0)
    if (liquidationBeforeInterestRate !== undefined && liquidationBeforeInterestRate > 0) {
      liquidateItems.push(
        <span key="interestRateBeforeLiquidation" className="text-slate-500">
          Interest rate was {liquidationBeforeInterestRate}% annual before liquidation
        </span>,
      );
    }

    // Add NFT burn explanation if NFT URL is available (only for destructive liquidations)
    const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
    if (nftUrl) {
      liquidateItems.push(
        <span key="nftBurn" className="text-slate-500">
          Trove NFT was sent to the burn address during liquidation
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>,
      );
    }

    liquidateItems.push(
      <span key="closed" className="text-slate-500">
        Trove closed through liquidation
      </span>,
    );
  } else {
    // Additional context for beneficial liquidations
    liquidateItems.push(
      <span key="collateralRatioImproved" className="text-slate-600">
        Your collateral ratio improved from {tx.stateBefore?.collateralRatio}% to {tx.stateAfter.collateralRatio}%
      </span>,
      <span key="troveStillActive" className="text-slate-300">
        Your trove remains active and healthy
      </span>,
    );
  }

  return (
    <ExplanationPanel
      items={liquidateItems}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
