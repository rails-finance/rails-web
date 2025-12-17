import React from "react";
import { Transaction, isRedemptionTransaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { isZombieTrove } from "../shared/eventHelpers";
import { ExternalLink, Bell } from "lucide-react";

interface RedeemCollateralExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function RedeemCollateralExplanation({ transaction, onToggle, defaultOpen }: RedeemCollateralExplanationProps) {
  const tx = transaction as any;

  if (!isRedemptionTransaction(tx)) return null;

  // Values from API
  const collRedeemed = Math.abs(tx.troveOperation.collChangeFromOperation); // Gross collateral removed
  const debtRedeemed = Math.abs(tx.troveOperation.debtChangeFromOperation); // Debt cleared
  const redemptionFee = parseFloat(tx.redemptionFee || "0"); // Trove-specific fee from RedemptionFeePaidToTrove event
  const redemptionPrice = tx.systemRedemption?.redemptionPrice || 0; // Oracle price
  const marketPrice = tx.collateralPrice || 0; // Market price

  const redeemAfterColl = tx.stateAfter.coll;
  const redeemAfterDebt = tx.stateAfter.debt;
  const redeemAfterCollRatio = tx.stateAfter.collateralRatio;
  const redeemBeforeCollRatio = tx.stateBefore?.collateralRatio || 0;
  const redeemBeforeDebt = tx.stateBefore?.debt || 0;

  const isZombie = isZombieTrove(redeemAfterDebt);

  // Calculated values
  // Note: collRedeemed is the actual amount sent (collLot in smart contract)
  // The fee was deducted BEFORE sending, so it never left the trove
  const collateralTransferredOut = collRedeemed; // This is already the net amount sent
  const correspondingColl = collRedeemed + redemptionFee; // Theoretical collateral before fee deduction
  const redeemBeforeColl = redeemAfterColl + collRedeemed; // Before = After + Amount sent out
  const feeRate = redemptionFee > 0 ? (redemptionFee / correspondingColl) * 100 : 0;

  const collValueOraclePrice = collateralTransferredOut * redemptionPrice;
  const collValueMarketPrice = collateralTransferredOut * marketPrice;
  const feeValueOraclePrice = redemptionFee * redemptionPrice;
  const feeValueMarketPrice = redemptionFee * marketPrice;
  const redeemAfterCollUsd = redeemAfterColl * marketPrice;

  // Calculate the difference between debt cleared and collateral sent
  const netProfitOracle = debtRedeemed - collValueOraclePrice;
  const netProfitMarket = debtRedeemed - collValueMarketPrice;

  // 1. Transaction breakdown bullet points
  const transactionBreakdown = (
    <div className="space-y-3">
      <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Event Details</div>
      <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
        <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          This redemption clears the Trove owner's debt of {" "}
          <HighlightableValue type="debt" state="change" value={debtRedeemed}>
            {formatCurrency(debtRedeemed, tx.assetType)}
          </HighlightableValue>{" "}and reduces collateral by{" "}
          <HighlightableValue type="collateral" state="change" value={collateralTransferredOut}>
            {collateralTransferredOut.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </HighlightableValue> ({formatUsdValue(collValueMarketPrice)}) to <HighlightableValue type="collateral" state="after" value={redeemAfterColl}>
            {redeemAfterColl.toFixed(4)}&nbsp;{tx.collateralType}
          </HighlightableValue> (<HighlightableValue type="collateralUsd" state="after" value={redeemAfterCollUsd}>
            {formatUsdValue(redeemAfterCollUsd)}
          </HighlightableValue>)
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          A {feeRate.toFixed(3)}% redemption fee of {redemptionFee.toFixed(6)} {tx.collateralType} ({formatUsdValue(feeValueMarketPrice)}), paid by the redeemer, remains in the Trove as additional collateral
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          <span>The Trove now has {redeemAfterDebt === 0 ? (
            <>
              <HighlightableValue type="debt" state="after" value={0}>
                0 {tx.assetType}
              </HighlightableValue>
              {isZombie && (
                <span> debt, remaining open with collateral only (a 'zero-debt Zombie Trove').</span>
              )}
            </>
          ) : (
            <>
              <HighlightableValue type="debt" state="after" value={redeemAfterDebt}>
                {formatCurrency(redeemAfterDebt, tx.assetType)}
              </HighlightableValue>
              {isZombie ? (
                <span> debt, creating a 'low-debt Zombie Trove' (below the 2000 {tx.assetType} minimum threshold), adjusting the collateral ratio proportionally to <HighlightableValue type="collRatio" state="after" value={redeemAfterCollRatio}>
                  {redeemAfterCollRatio.toFixed(1)}%
                </HighlightableValue>.</span>
              ) : (
                <span>, adjusting the collateral ratio proportionally to <HighlightableValue type="collRatio" state="after" value={redeemAfterCollRatio}>
                  {redeemAfterCollRatio.toFixed(1)}%
                </HighlightableValue>.</span>
              )}
            </>
          )}</span>
        </div>
      </div>
      {isZombie && redeemAfterDebt === 0 && (
        <>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              With zero debt, no interest accrues and the <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
                {tx.stateAfter.annualInterestRate}%
              </HighlightableValue> interest rate is no longer relevant
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              It can be closed by withdrawing the remaining collateral, or re-activated by borrowing 2000 BOLD or more
            </div>
          </div>
        </>
      )}
      {isZombie && redeemAfterDebt > 0 && (
        <>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              The Trove is removed from the normal redemption order. It may be targeted first in subsequent redemption(s) to clear the remaining below-minimum debt
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              Interest continues to accrue at <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
                {tx.stateAfter.annualInterestRate}%
              </HighlightableValue>. If the debt later rises back above 2,000 BOLD (for example from accrued interest), the Trove can return to normal behaviour
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 dark:text-slate-400">•</span>
            <div className="text-slate-500">
              It can be resolved by repaying the remaining debt and withdrawing collateral to close it, or borrowing more to bring the debt above 2000 BOLD and reactivate it{' '}
            </div>
          </div>
        </>
      )}
      {!isZombie && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Interest rates are not affected by redemptions and this remains at{" "}
            <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
              {tx.stateAfter.annualInterestRate}%
            </HighlightableValue>{"."}
          </div>
        </div>
      )}
    </div>
    </div>
  );

  // 2. Economic Impact section
  let economicImpactSection: React.ReactNode = null;
  if (redemptionPrice > 0 && marketPrice > 0) {
    const priceDiffPercent = ((redemptionPrice - marketPrice) / marketPrice) * 100;
    const showOracleExplanation = Math.abs(priceDiffPercent) > 0.1; // Show if difference > 0.1%

    economicImpactSection = (
      <div className="bg-slate-100/80 dark:bg-slate-800/50 border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-3">
        <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Price Mechanics</div>
        <div className="space-y-2 text-sm">
          {showOracleExplanation ? (
            <>
              <div className="text-slate-600 dark:text-slate-400">
                Redemptions use Liquity's anti-manipulation oracle price{redemptionPrice > marketPrice
                  ? ", which typically values collateral higher than the current market price"
                  : ", which valued collateral differently than the current market price at this time"}
              </div>
              <div className="space-y-1 text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Protocol price:</span>{" "}
                  <HighlightableValue type="redemptionPrice" state="after" className="text-orange-600 dark:text-orange-400" value={redemptionPrice}>
                    {formatUsdValue(redemptionPrice)}
                  </HighlightableValue> / {tx.collateralType}
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Market price:</span>{" "}
                    <span className="text-slate-600 dark:text-white">{formatUsdValue(marketPrice)}</span>
                  {' '}/ {tx.collateralType}
                </div>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                {redemptionPrice > marketPrice ? (
                  <>The redeemer paid {Math.abs(priceDiffPercent).toFixed(1)}% more than market price for this collateral.</>
                ) : (
                  <>The redeemer paid {Math.abs(priceDiffPercent).toFixed(1)}% less than market price for this collateral.</>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-slate-600 dark:text-slate-400">
                Redemptions use Liquity's anti-manipulation oracle price to value collateral
              </div>
              <div className="space-y-1 text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Redemption price:</span>{" "}
                  <HighlightableValue type="redemptionPrice" state="after" className="text-orange-600 dark:text-orange-400" value={redemptionPrice}>
                    {formatUsdValue(redemptionPrice)}
                  </HighlightableValue> / {tx.collateralType}
                </div>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                The protocol and market prices were aligned at the time of this redemption
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 3. How Redemptions Work section
  const howRedemptionsWork = (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Redemptions Work</div>
        <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
          Redemptions allow BOLD holders to exchange BOLD for collateral at face value ($1 per BOLD). This mechanism
          helps maintain BOLD's USD peg - if BOLD trades below $1, arbitrageurs (typically automated bots) profit by buying cheap BOLD and redeeming
          it for $1 worth of collateral. Troves are redeemed in ascending order of interest rates (lowest first). This Trove's{" "}
          {tx.stateAfter.annualInterestRate}% rate was among the lowest in the {tx.collateralType} branch at redemption
          time.
        </div>
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 mt-3">Learn More About Redemptions</div>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
              Watch this{" "}
              <a
                href="https://www.youtube.com/watch?v=CQVmjFx987A"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline inline-flex items-center gap-1"
              >
                9 min video
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              {" "}on redemptions from Liquity to understand how they work and how to manage redemption risk.
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs mb-2">Quick Links</div>
          <div className="grid grid-cols-1 gap-1 text-xs">
            <a
              href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-are-redemptions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What are redemptions?
            </a>
            <a
              href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-happens-if-my-trove-gets-redeemed"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What happens if my Trove gets redeemed?
            </a>
            <a
              href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#how-can-i-stay-protected"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              How can I stay protected?
            </a>
            <a
              href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#is-there-a-redemption-fee"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              Is there a redemption fee?
            </a>
            {isZombie && (
              <a
                href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#docs-internal-guid-927901d5-7fff-c7a0-2e9f-964ab271257a"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                What happens if debt falls below 2000 BOLD?
              </a>
            )}
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

  // 4. Left column content (Transaction breakdown + Economic Impact)
  const leftColumnContent = (
    <>
      {transactionBreakdown}
      {economicImpactSection}
    </>
  );

  // 5. Rails promotion footer
  const railsPromotion = (
    <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-fuchsia-500/10 rounded-full flex items-center justify-center">
          <Bell className="w-5 h-5 text-fuchsia-400" />
        </div>
        <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <span className="text-slate-500 dark:text-slate-300 font-bold">Want redemption notifications?</span> Rails plans to build features to help you stay ahead of redemption risk. Your support helps us prioritize these tools—follow us on{" "}
          <a
            href="https://x.com/rails_finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fuchsia-400 hover:text-fuchsia-300 hover:underline inline-flex items-center gap-0.5"
          >
            X @rails_finance
            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
          </a>
          {" "}and consider donating at{" "}
          <span className="text-fuchsia-400">donate.rails.eth</span>
        </div>
      </div>
    </div>
  );

  return (
    <ExplanationPanel
      leftColumn={leftColumnContent}
      rightColumn={howRedemptionsWork}
      footer={railsPromotion}
      onToggle={onToggle}
      defaultOpen={defaultOpen ?? false}
      transactionHash={transaction.transactionHash}
    />
  );
}
