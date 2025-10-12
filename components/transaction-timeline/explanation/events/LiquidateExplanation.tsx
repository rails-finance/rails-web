import React from "react";
import { Transaction, TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import {
  getLiquidationThreshold,
  getMaxLTV,
  getLiquidationClaimUrl,
  getPerTroveLiquidationData,
} from "@/lib/utils/liquidation-utils";
import { ExternalLink } from "lucide-react";

interface LiquidateExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function LiquidateExplanation({ transaction, onToggle }: LiquidateExplanationProps) {
  const tx = transaction as TroveLiquidationTransaction;

  // Determine if this is a beneficial liquidation (trove gains from redistribution)
  // vs destructive liquidation (this trove gets liquidated)
  const { collIncreaseFromRedist, debtIncreaseFromRedist } = tx.troveOperation || {};
  const isBeneficialLiquidation = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;

  if (isBeneficialLiquidation) {
    // Beneficial liquidation - this trove gained from redistribution
    const collateralGained = collIncreaseFromRedist;
    const debtInherited = debtIncreaseFromRedist;
    const collateralGainedUsd = collateralGained * (tx.collateralPrice || 0);
    const netBenefit = collateralGainedUsd - debtInherited;

    // Left column: Transaction breakdown
    const transactionBreakdown = (
      <div className="space-y-3">
        <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Event Details</div>
        <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-green-600">
              ✅ Your trove benefited from another trove's liquidation through redistribution
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              You received{" "}
              <HighlightableValue type="collateral" state="after" value={collateralGained}>
                {collateralGained} {tx.collateralType}
              </HighlightableValue>
              {collateralGainedUsd > 0 ? (
                <>
                  {" "}(≈{" "}
                  <HighlightableValue type="collateralUsd" state="after" value={collateralGainedUsd}>
                    {formatUsdValue(collateralGainedUsd)}
                  </HighlightableValue>
                  )
                </>
              ) : ""} from the liquidated trove
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              You inherited{" "}
              <HighlightableValue type="debt" state="after" value={debtInherited}>
                {formatCurrency(debtInherited, tx.assetType)}
              </HighlightableValue>{" "}
              proportional to your collateral amount
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className={netBenefit >= 0 ? "text-green-600" : "text-yellow-500"}>
              Net impact: {netBenefit >= 0 ? "+" : ""}
              {formatUsdValue(netBenefit)}
              {netBenefit >= 0 ? " (beneficial due to liquidation penalty)" : " (small cost)"}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              This redistribution happened because the Stability Pool couldn't fully cover the liquidation
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-600">
              Your collateral ratio improved from {tx.stateBefore?.collateralRatio}% to{" "}
              <HighlightableValue type="collRatio" state="after" value={tx.stateAfter.collateralRatio}>
                {tx.stateAfter.collateralRatio}%
              </HighlightableValue>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-300">
              Your trove remains active and healthy
            </div>
          </div>
        </div>
      </div>
    );

    // Determine thresholds and penalty based on collateral type
    const isETH = tx.collateralType === "WETH" || tx.collateralType === "ETH";
    const minCollRatio = isETH ? "110%" : "120%";
    const maxLTV = isETH ? "90.91%" : "83.33%";
    const maxPenalty = isETH ? "10% of debt (9.09% of collateral)" : "20% of debt (16.67% of collateral)";

    // Right column: How Liquidations Work
    const howLiquidationsWork = (
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Liquidations Work</div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
          Troves get liquidated when the collateral ratio falls below the minimum threshold ({minCollRatio} for {tx.collateralType},
          equivalent to a maximum {maxLTV} LTV). The {tx.collateralType} Stability Pool absorbs liquidated debt and collateral
          as the primary mechanism. If the Stability Pool is empty, Just-In-Time liquidations or redistribution across borrowers
          in the same market handle liquidations as a last resort.
        </div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mt-2">
          A liquidated borrower typically incurs a 5% penalty and can claim remaining collateral. In redistribution cases,
          the maximum loss is {maxPenalty}.
        </div>
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 mt-3">Learn More About Liquidations</div>
        <div className="mt-3 space-y-1.5">
          <div className="grid grid-cols-1 gap-1 text-xs">
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What are liquidations?
            </a>
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              How does redistribution work?
            </a>
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What is the liquidation threshold?
            </a>
          </div>
        </div>
      </div>
    );

    return (
      <ExplanationPanel
        leftColumn={transactionBreakdown}
        rightColumn={howLiquidationsWork}
        onToggle={onToggle}
        defaultOpen={false}
        transactionHash={transaction.transactionHash}
      />
    );
  } else {
    // Destructive liquidation - this trove got liquidated
    // ✅ Use accurate per-trove calculation
    const liquidationData = getPerTroveLiquidationData(tx);
    const liquidationThreshold = getLiquidationThreshold(tx.collateralType);

    // Surplus is only claimable when liquidation went through Stability Pool
    // In full redistribution, all collateral is redistributed (no claimable surplus)
    const hasClaimableSurplus = liquidationData.collSurplus > 0 && !liquidationData.wasFullyRedistributed;

    // Left column: Transaction breakdown
    const transactionBreakdown = (
      <div className="space-y-4">
        {/* Batch Liquidation Warning */}
        {liquidationData.isBatchLiquidation && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700 rounded-lg p-3">
            <div className="font-semibold text-blue-900 dark:text-blue-200 text-sm mb-1">
              ℹ️ Batch Liquidation Detected
            </div>
            <div className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
              This transaction liquidated multiple troves simultaneously. Values shown are calculated specifically for
              your trove based on This position's state changes.
            </div>
          </div>
        )}

        

        {/* Event Breakdown */}
        <div className="space-y-3">
          <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Event Breakdown</div>
          {/* Show debt cleared */}
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                <HighlightableValue type="debt" state="change" value={liquidationData.debtCleared}>
                  {formatCurrency(liquidationData.debtCleared, tx.assetType)}
                </HighlightableValue>{" "}
                debt cleared
              </div>
            </div>
          {/* Show total collateral liquidated */}
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Collateral liquidated{" "}
              <HighlightableValue type="collateral" state="before" value={liquidationData.collLiquidated}>
                {formatCurrency(liquidationData.collLiquidated, tx.collateralType)}
              </HighlightableValue>
              <span className="text-slate-400 dark:text-slate-500 ml-1">
                (<HighlightableValue type="collateralUsd" state="before" value={liquidationData.totalCollValueAtLiquidation}>
                  {formatUsdValue(liquidationData.totalCollValueAtLiquidation)}
                </HighlightableValue> at liquidation price)
              </span>
            </div>
          </div>
            {/* Surplus - only shown when claimable (not in full redistribution) */}
					{hasClaimableSurplus && (
						<div className="flex items-start gap-2">
							<span className="text-slate-600 dark:text-slate-400">•</span>
							<div className="text-slate-500">
								Claimable Surplus{' '}<HighlightableValue type="collSurplus" state="after" value={liquidationData.collSurplus}>
									{formatCurrency(liquidationData.collSurplus, tx.collateralType)}
								</HighlightableValue>{' '}(
								{formatUsdValue(liquidationData.collSurplusValueUsd)} at liquidation price)
								{liquidationData.surplusIsAmbiguous && (
									<div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded p-2 mt-2">
										⚠️ This surplus value is estimated. Connect your wallet to the Liquity app to see your exact
										claimable amount.
									</div>
								)}
							</div>
						</div>
					)}
          <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
            {/* Show collateral distribution breakdown */}
            {liquidationData.collToSP > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">
                  {formatCurrency(liquidationData.collToSP, tx.collateralType)}  ({formatUsdValue(liquidationData.collToSPValueUsd)}) sent to Liquity V2 Stability Pool
                  
                  
                  
                </div>
              </div>
            )}
            {liquidationData.collGasCompensation > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">
                  {formatCurrency(liquidationData.collGasCompensation, tx.collateralType)} gas compensation to liquidator
                </div>
              </div>
            )}
            {liquidationData.wasRedistributed && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">
                  <span className="text-yellow-600 dark:text-yellow-400">
                    ⚠️ Partial redistribution occurred (Stability Pool was insufficient)
                  </span>
                </div>
              </div>
            )}

            {/* Show liquidation penalty */}
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                Liquidation penalty: {formatUsdValue(liquidationData.penaltyValueUsd)} (5% of debt)
              </div>
            </div>

            
          </div>
        </div>

        {/* Additional Details */}
        {getTroveNftUrl(tx.collateralType, tx.troveId) && (
          <div className="space-y-2 text-sm/5.5">
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">Trove NFT was sent to the burn address during liquidation</div>
            </div>
          </div>
        )}
      </div>
    );

    // Right column: How Liquidations Work
    const maxLTV = getMaxLTV(tx.collateralType);
    const maxPenalty = tx.collateralType === "WETH" || tx.collateralType === "ETH"
      ? "10% of debt (9.09% of collateral)"
      : "20% of debt (16.67% of collateral)";

    // Tailor explanation based on what actually happened
    let mechanismExplanation = "";
    if (liquidationData.wasFullyAbsorbedBySP) {
      mechanismExplanation = `This position was liquidated via the ${tx.collateralType} Stability Pool, which absorbed the debt and received your collateral (minus surplus and gas compensation).`;
    } else if (liquidationData.wasFullyRedistributed) {
      mechanismExplanation = `This position was liquidated via redistribution because the ${tx.collateralType} Stability Pool was empty. Your debt and collateral were redistributed proportionally to other active borrowers in the same market.`;
    } else if (liquidationData.wasPartiallyRedistributed) {
      mechanismExplanation = `This position was liquidated using a combination of the ${tx.collateralType} Stability Pool (partial absorption) and redistribution to other borrowers because the Stability Pool had insufficient BOLD.`;
    }

    const howLiquidationsWork = (
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Liquidations Work</div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
          Troves get liquidated when the collateral ratio falls below the minimum threshold ({liquidationThreshold}% for {tx.collateralType},
          equivalent to a maximum {maxLTV} LTV).
        </div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mt-2">
          {mechanismExplanation}
        </div>
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 mt-3">Learn More About Liquidations</div>
        <div className="mt-3 space-y-1.5">
          <div className="grid grid-cols-1 gap-1 text-xs">
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What are liquidations?
            </a>
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              How does the Stability Pool work?
            </a>
            <a
              href={FAQ_URLS.LIQUIDATIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What is the liquidation threshold?
            </a>
            <a
              href={FAQ_URLS.NFT_TROVES}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What happens to the Trove NFT?
            </a>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs mb-2">Technical Resources</div>
            <div className="grid grid-cols-1 gap-1 text-xs">
              <a
                href="https://github.com/liquity/bold"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                BOLD GitHub Repository
              </a>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <ExplanationPanel
        leftColumn={transactionBreakdown}
        rightColumn={howLiquidationsWork}
        onToggle={onToggle}
        defaultOpen={false}
        transactionHash={transaction.transactionHash}
      />
    );
  }
}
