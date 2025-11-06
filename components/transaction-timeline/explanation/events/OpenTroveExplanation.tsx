import React from "react";
import Link from "next/link";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { FAQ_URLS } from "../shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { getUpfrontFee, isHighRisk, isConservative, LIQUIDATION_RESERVE_ETH } from "../shared/eventHelpers";
import { ExternalLink, SearchCheck } from "lucide-react";

interface OpenTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function OpenTroveExplanation({ transaction, onToggle }: OpenTroveExplanationProps) {
  const tx = transaction as any;
  const openFee = getUpfrontFee(tx);
  const principalBorrowed = tx.stateAfter.debt - openFee;
  const collRatio = tx.stateAfter.collateralRatio;
  const collUsdValue = tx.stateAfter.collateralInUsd;
  const priceDisplay = tx.collateralPrice;
  const isHighRiskPosition = isHighRisk(collRatio);
  const isConservativePosition = isConservative(collRatio);
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);

  // 1. Transaction breakdown bullet points
  const transactionBreakdown = (
    <div className="space-y-3">
      <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Transaction Details</div>
      <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
        <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Wallet{' '}
          <Link
            href={`/troves?ownerAddress=${tx.relatedTransfer.toAddress}`}
            className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            {`${tx.relatedTransfer.toAddress.substring(0, 6)}...${tx.relatedTransfer.toAddress.substring(38)}`}
          </Link>{' '}
          opened a new Trove.
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Deposited{" "}
          <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
            {tx.stateAfter.coll} {tx.collateralType}
          </HighlightableValue>{" "}
          as collateral to secure the loan.
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Borrowed{" "}
          <HighlightableValue type="debt" state="change" value={principalBorrowed}>
            {principalBorrowed.toLocaleString()} {tx.assetType}
          </HighlightableValue>
          .
        </div>
      </div>
      {openFee > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Paid a one-time borrowing fee of{" "}
            <HighlightableValue type="upfrontFee" state="fee" value={openFee}>
              {openFee.toFixed(2)} {tx.assetType}
            </HighlightableValue>{" "}
            (equivalent to 7 days of average interest).
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Total initial debt is{" "}
          <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
            {tx.stateAfter.debt.toLocaleString()} {tx.assetType}
          </HighlightableValue>
          {openFee > 0 && " including the borrowing fee"}.
        </div>
      </div>
      {LIQUIDATION_RESERVE_ETH > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            A {LIQUIDATION_RESERVE_ETH} ETH liquidation reserve was set aside (refundable on close).
          </div>
        </div>
      )}
      {collUsdValue && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Collateral USD value at opening:{" "}
            <HighlightableValue type="collateralUsd" state="after" value={collUsdValue}>
              ${collUsdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </HighlightableValue>
            {priceDisplay && ` (${tx.collateralType} price: `}
            {priceDisplay && (
              <HighlightableValue type="collateralPrice" state="after" value={priceDisplay}>
                ${priceDisplay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </HighlightableValue>
            )}
            {priceDisplay && `)`}.
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Position opened with a{" "}
          <HighlightableValue type="collRatio" state="after" value={collRatio}>
            {collRatio.toFixed(1)}%
          </HighlightableValue>{" "}
          collateralization ratio.
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Annual interest rate set at{" "}
          <HighlightableValue type="interestRate" state="after" value={tx.troveOperation?.annualInterestRate ?? tx.stateAfter.annualInterestRate}>
            {tx.troveOperation?.annualInterestRate ?? tx.stateAfter.annualInterestRate}%
          </HighlightableValue>
          , compounding continuously.
        </div>
      </div>
      {nftUrl && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Trove is represented by an{" "}
            <a
              href={nftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline inline-flex items-center gap-1"
            >
              ERC-721 NFT token
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>{" "}
            representing ownership.
          </div>
        </div>
      )}
      </div>
    </div>
  );

  // 2. How Borrowing Works section
  const howBorrowingWorks = (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Borrowing Works</div>
      <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
        This Trove was opened by depositing collateral to borrow BOLD, a decentralized stablecoin. The NFT representing this position provides full control over the collateral and debt. The interest rate set at opening determines redemption risk - higher rates provide better protection against redemptions but cost more over time.
      </div>
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 mt-3">Learn More About Borrowing</div>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-red-500/10 rounded-full hidden sm:flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
            Watch this{" "}
            <a
              href="https://www.youtube.com/watch?v=o1miCKLIPYs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              video guide
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            {" "}to learn how to borrow on Liquity and manage your Trove effectively.
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs mb-2">Quick Links</div>
        <div className="grid grid-cols-1 gap-1 text-xs">
          <a
            href={FAQ_URLS.WHAT_IS_TROVE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            What is a Trove?
          </a>
          <a
            href={FAQ_URLS.BORROWING_FEES}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            Understanding borrowing fees
          </a>
          <a
            href={FAQ_URLS.LIQUIDATION_RESERVE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            What is the liquidation reserve?
          </a>
          <a
            href={FAQ_URLS.LTV_COLLATERAL_RATIO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            Understanding LTV and collateral ratio
          </a>
          <a
            href={FAQ_URLS.USER_SET_RATES}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            How user-set interest rates work
          </a>
          {nftUrl && (
            <a
              href={FAQ_URLS.NFT_TROVES}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              What are NFT Troves?
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

  // 3. Rails promotion footer
  const railsPromotion = (
    <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-fuchsia-500/10 rounded-full hidden sm:flex items-center justify-center">
          <SearchCheck className="w-5 h-5 text-fuchsia-400" />
        </div>
        <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <span className="text-slate-500 dark:text-slate-300 font-bold">Track your Trove activity!</span> Rails provides detailed transaction history and analytics for your Liquity positions. Follow us on{" "}
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
      leftColumn={transactionBreakdown}
      rightColumn={howBorrowingWorks}
      footer={railsPromotion}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
