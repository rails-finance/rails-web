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
  defaultOpen?: boolean;
}

export function LiquidateExplanation({ transaction, onToggle, defaultOpen }: LiquidateExplanationProps) {
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
              ✅ The trove benefited from another trove's liquidation through redistribution
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              The trove received{" "}
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
              The trove inherited{" "}
              <HighlightableValue type="debt" state="after" value={debtInherited}>
                {formatCurrency(debtInherited, tx.assetType)}
              </HighlightableValue>{" "}
              proportional to its collateral amount
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
              The collateral ratio improved from {tx.stateBefore?.collateralRatio}% to{" "}
              <HighlightableValue type="collRatio" state="after" value={tx.stateAfter.collateralRatio}>
                {tx.stateAfter.collateralRatio}%
              </HighlightableValue>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-300">
              The trove remains active and healthy
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
          Troves become eligible for liquidation when the collateral ratio falls below the minimum threshold ({minCollRatio} for {tx.collateralType},
          equivalent to a maximum {maxLTV} LTV). Once eligible, anyone can trigger a liquidation transaction. If the Stability Pool has sufficient funds, it clears the debt and receives the collateral according to protocol rules.
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
        defaultOpen={defaultOpen ?? false}
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
        {/* Event Breakdown */}
        <div className="space-y-3">
          <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Event Explanation</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 rounded px-2 py-1 -mt-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            USD values reflect historic price at time:{" "}
            <HighlightableValue type="currentPrice" state="after" value={liquidationData.liquidationPrice}>
              {formatUsdValue(liquidationData.liquidationPrice)}
            </HighlightableValue>{" "}
            / {tx.collateralType}
          </div>
          {/* Collateral ratio at liquidation */}
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Collateral ratio dropped to{" "}
              <HighlightableValue type="collRatio" state="before" value={liquidationData.crAtLiquidation}>
                  {liquidationData.crAtLiquidation.toFixed(2)}%
              </HighlightableValue>
              {" "}(below the {liquidationThreshold}% threshold for {tx.collateralType}){" "}triggering a liquidation
            </div>
          </div>
          {/* Show debt cleared */}
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                <HighlightableValue type="debt" state="before" value={liquidationData.debtCleared}>
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
                </HighlightableValue>)
              </span>
            </div>
          </div>
            {/* Surplus - only shown when claimable (not in full redistribution) */}
					{hasClaimableSurplus && (
						<div className="flex items-start gap-2">
							<span className="text-slate-600 dark:text-slate-400">•</span>
							<div className="text-slate-500">
								<em>Borrower</em> can claim surplus of {liquidationData.surplusIsAmbiguous ? '~' : ''}<HighlightableValue type="collSurplus" state="after" value={liquidationData.collSurplus}>
									{formatCurrency(liquidationData.collSurplus, tx.collateralType)}
								</HighlightableValue>
								<span className="text-slate-400 dark:text-slate-500 ml-1">
									({liquidationData.surplusIsAmbiguous ? '~' : ''}{formatUsdValue(liquidationData.collSurplusValueUsd)})
								</span>
								{liquidationData.surplusIsAmbiguous && (
									<div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700 rounded p-3 mt-2">
										<div className="font-semibold text-blue-900 dark:text-blue-200 text-sm mb-1">Rails Calculated Estimate</div>
										<div className="text-blue-700 dark:text-blue-200 text-xs leading-relaxed">
											Because multiple troves were liquidated together, blockchain events only report aggregate surplus (not per-trove).
											Rails calculates this trove's surplus using the formula: collateral - (debt × 1.05 / price) - gas compensation.
										</div>
										<div className="text-blue-700 dark:text-blue-200 text-xs leading-relaxed mt-2">
											The actual claimable amount on-chain may differ slightly from this estimate.
										</div>
									</div>
								)}
							</div>
						</div>
					)}
					{/* Estimated borrower loss */}
					{liquidationData.estimatedBorrowerLoss > 0 && (
						<div className="flex items-start gap-2">
							<span className="text-slate-600 dark:text-slate-400">•</span>
							<div className="text-slate-500">
								The difference between borrower equity and claimable surplus represented a USD estimated loss of ≈{formatUsdValue(liquidationData.estimatedBorrowerLoss)} at liquidation
							</div>
						</div>
					)}
          <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
            {/* Show collateral distribution breakdown */}
            {liquidationData.collToSP > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">
                  <em>Stability Pool</em> received {formatCurrency(liquidationData.collToSP, tx.collateralType)} ({formatUsdValue(liquidationData.collToSPValueUsd)})
                </div>
              </div>
            )}
            {liquidationData.collGasCompensation > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">
                  <em>Liquidator</em> received {formatCurrency(liquidationData.collGasCompensation, tx.collateralType)} gas compensation
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                <em>Liquidator</em> received 0.0375 WETH gas compensation
              </div>
            </div>
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

            {/* Show liquidator incentive */}
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                <em>Liquidator</em> received {formatCurrency(liquidationData.penaltyInCollateral, tx.collateralType)} ({formatUsdValue(liquidationData.penaltyValueUsd)}) as an incentive for performing the liquidation (5% of debt)
              </div>
            </div>

            {/* Trove NFT burned */}
            {getTroveNftUrl(tx.collateralType, tx.troveId) && (
              <div className="flex items-start gap-2">
                <span className="text-slate-600 dark:text-slate-400">•</span>
                <div className="text-slate-500">Trove NFT was sent to the burn address during liquidation</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    // Right column: How Liquidations Work
    const maxLTV = getMaxLTV(tx.collateralType);

    // Tailor explanation based on what actually happened
    let mechanismExplanation = "";
    if (liquidationData.wasFullyAbsorbedBySP) {
      mechanismExplanation = `In this case, the liquidation was handled by the ${tx.collateralType} Stability Pool. Either existing depositors absorbed the debt (receiving the collateral pro-rata), or a liquidator used a Just-In-Time (JIT) liquidation by temporarily depositing BOLD. In both cases, the debt was cleared and collateral distributed through the Stability Pool mechanism. If the Stability Pool had been completely empty (and no JIT liquidation occurred), the debt and collateral would have been redistributed to other borrowers instead.`;
    } else if (liquidationData.wasFullyRedistributed) {
      mechanismExplanation = `In this case, the ${tx.collateralType} Stability Pool was empty and no Just-In-Time (JIT) liquidation occurred, so this position was liquidated via redistribution. The debt and collateral were distributed proportionally to other active borrowers in the same market based on their collateral amounts. If the Stability Pool had sufficient BOLD or a liquidator had performed a JIT liquidation, it would have been absorbed through the Stability Pool instead.`;
    } else if (liquidationData.wasPartiallyRedistributed) {
      mechanismExplanation = `In this case, the ${tx.collateralType} Stability Pool had insufficient BOLD to fully cover the liquidation, so a hybrid approach was used. Part of the debt was cleared by the Stability Pool (either by existing depositors or via a JIT liquidation), and the remainder (along with proportional collateral) was redistributed to other borrowers. If the Stability Pool had been fully funded, it would have handled the entire liquidation.`;
    }

    const howLiquidationsWork = (
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Liquidations Work</div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
          Troves become eligible for liquidation when the collateral ratio falls below the minimum threshold ({liquidationThreshold}% for {tx.collateralType},
          equivalent to a maximum {maxLTV} LTV). Once eligible, anyone can trigger a liquidation transaction.
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
        </div>
      </div>
    );

    return (
      <ExplanationPanel
        leftColumn={transactionBreakdown}
        rightColumn={howLiquidationsWork}
        onToggle={onToggle}
        defaultOpen={defaultOpen ?? false}
        transactionHash={transaction.transactionHash}
      />
    );
  }
}
