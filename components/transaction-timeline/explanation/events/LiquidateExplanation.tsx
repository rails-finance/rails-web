import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { ExternalLink } from "lucide-react";

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
              {collateralGainedUsd > 0 ? ` (≈ ${formatUsdValue(collateralGainedUsd)})` : ""} from the liquidated trove
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
              Your collateral ratio improved from {tx.stateBefore?.collateralRatio}% to {tx.stateAfter.collateralRatio}%
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

    // Left column: Transaction breakdown
    const transactionBreakdown = (
      <div className="space-y-3">
        <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Event Details</div>
        <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Trove was liquidated due to insufficient collateral ratio
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Total of <HighlightableValue type="totalCollLiquidated" state="change" value={totalCollLiquidated}>
                {formatCurrency(totalCollLiquidated, tx.collateralType)}
              </HighlightableValue> collateral liquidated
            </div>
          </div>

          {/* Show collateral distribution breakdown if available */}
          {tx.systemLiquidation && (
            <>
              {tx.systemLiquidation.collSentToSP > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-600 dark:text-slate-400">•</span>
                  <div className="text-slate-500">
                    
                      {formatCurrency(tx.systemLiquidation.collSentToSP, tx.collateralType)}
                    {' '}collateral sent to Stability Pool
                  </div>
                </div>
              )}
              {tx.systemLiquidation.collRedistributed > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-600 dark:text-slate-400">•</span>
                  <div className="text-slate-500">
                    <HighlightableValue type="collRedistributed" state="after" value={tx.systemLiquidation.collRedistributed}>
                      {formatCurrency(tx.systemLiquidation.collRedistributed, tx.collateralType)}
                    </HighlightableValue> collateral redistributed to other troves
                  </div>
                </div>
              )}
              {tx.systemLiquidation.collSurplus > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-600 dark:text-slate-400">•</span>
                  <div className="text-slate-500">
                    <HighlightableValue type="collSurplus" state="after" value={tx.systemLiquidation.collSurplus}>
                      {formatCurrency(tx.systemLiquidation.collSurplus, tx.collateralType)}
                    </HighlightableValue> collateral surplus available for owner to claim
                  </div>
                </div>
              )}

              {/* Show debt distribution breakdown */}
              {tx.systemLiquidation.debtOffsetBySP > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-600 dark:text-slate-400">•</span>
                  <div className="text-slate-500">
                    <HighlightableValue type="debtOffsetBySP" state="after" value={tx.systemLiquidation.debtOffsetBySP}>
                      {formatCurrency(tx.systemLiquidation.debtOffsetBySP, tx.assetType)}
                    </HighlightableValue> debt offset by Stability Pool
                  </div>
                </div>
              )}
              {tx.systemLiquidation.debtRedistributed > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-600 dark:text-slate-400">•</span>
                  <div className="text-slate-500">
                    <HighlightableValue type="debtRedistributed" state="after" value={tx.systemLiquidation.debtRedistributed}>
                      {formatCurrency(tx.systemLiquidation.debtRedistributed, tx.assetType)}
                    </HighlightableValue> debt redistributed to other troves
                  </div>
                </div>
              )}
            </>
          )}

          {/* Only show collateral ratio if it's a valid value (not 0) */}
          {liquidationBeforeCollRatio !== undefined && liquidationBeforeCollRatio > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                Collateral ratio had fallen to {liquidationBeforeCollRatio.toFixed(2)}% before liquidation
              </div>
            </div>
          )}

          {/* Only show interest rate if it's a valid value (not 0) */}
          {liquidationBeforeInterestRate !== undefined && liquidationBeforeInterestRate > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                Interest rate was <HighlightableValue type="interestRate" state="before" value={liquidationBeforeInterestRate}>
                  {liquidationBeforeInterestRate}%
                </HighlightableValue> annual before liquidation
              </div>
            </div>
          )}

          {/* Add NFT burn explanation if NFT URL is available (only for destructive liquidations) */}
          {getTroveNftUrl(tx.collateralType, tx.troveId) && (
            <div className="flex items-start gap-2">
              <span className="text-slate-600 dark:text-slate-400">•</span>
              <div className="text-slate-500">
                Trove NFT was sent to the burn address during liquidation
              </div>
            </div>
          )}

          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Trove closed through liquidation
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
          the maximum loss is {maxPenalty}. Liquidators receive gas compensation: 0.0375 WETH + min(0.5% of trove collateral,
          2 units of collateral).
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
