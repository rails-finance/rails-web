import React from "react";
import Link from "next/link";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { formatCurrency, formatUsdValue, truncateAddress, isEthereumAddress } from "@/lib/utils/format";
import { getUpfrontFee, LIQUIDATION_RESERVE_ETH } from "../shared/eventHelpers";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { FAQ_URLS } from "../shared/faqUrls";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { ExternalLink, SearchCheck, Link2 } from "lucide-react";

interface OpenTroveAndJoinBatchExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function OpenTroveAndJoinBatchExplanation({
  transaction,
  onToggle,
  defaultOpen,
}: OpenTroveAndJoinBatchExplanationProps) {
  const tx = transaction as any;
  const batchOpenFee = getUpfrontFee(tx);
  const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
  const batchCollRatio = tx.stateAfter.collateralRatio;
  const batchCollUsdValue = tx.stateAfter.collateralInUsd;
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);

  // Get batch manager info
  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const rawDelegateDisplay = batchManagerInfo?.description || batchManagerInfo?.name || tx.stateAfter.interestBatchManager || "Unknown manager";
  const delegateDisplay = isEthereumAddress(rawDelegateDisplay) ? truncateAddress(rawDelegateDisplay) : rawDelegateDisplay;

  // 1. Transaction breakdown bullet points
  const transactionBreakdown = (
    <div className="space-y-3">
      <div className="font-semibold text-slate-900 dark:text-slate-200 text-sm">Transaction Explanation</div>
      <div className="text-slate-900 dark:text-white space-y-2 text-sm/5.5">
        <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Wallet{" "}
          <Link
            href={`/troves?ownerAddress=${tx.relatedTransfer.toAddress}`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline inline-flex items-center gap-1"
          >
            {`${tx.relatedTransfer.toAddress.substring(0, 6)}...${tx.relatedTransfer.toAddress.substring(38)}`}
          </Link>{" "}
          opened a Trove with delegated interest rate management
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Deposited{" "}
          <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
            {tx.stateAfter.coll} {tx.collateralType}
          </HighlightableValue>{" "}
          as collateral
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Borrowed{" "}
          <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
            {formatCurrency(batchPrincipalBorrowed, tx.assetType)}
          </HighlightableValue>{" "}
          through the batch
        </div>
      </div>
      {batchOpenFee > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Paid a{" "}
            <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
              {batchOpenFee.toFixed(2)} {tx.assetType}
            </HighlightableValue>{" "}
            upfront borrowing fee
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Total debt is{" "}
          <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
            {formatCurrency(tx.stateAfter.debt, tx.assetType)}
          </HighlightableValue>
          {batchOpenFee > 0 && " including fees"}
        </div>
      </div>
      {LIQUIDATION_RESERVE_ETH > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            {LIQUIDATION_RESERVE_ETH} ETH liquidation reserve set aside (refundable on close)
          </div>
        </div>
      )}
      {batchCollUsdValue && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Collateral value at opening:{" "}
            <HighlightableValue type="collateralUsd" state="after" value={batchCollUsdValue}>
              {formatUsdValue(batchCollUsdValue)}
            </HighlightableValue>
            {tx.collateralPrice && ` (${tx.collateralType} price: `}
            {tx.collateralPrice && (
              <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
                {formatUsdValue(tx.collateralPrice)}
              </HighlightableValue>
            )}
            {tx.collateralPrice && `)`}
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Starting collateral ratio:{" "}
          <HighlightableValue type="collRatio" state="after" value={batchCollRatio}>
            {batchCollRatio ? batchCollRatio.toFixed(1) : "0"}%
          </HighlightableValue>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-slate-600 dark:text-slate-400">•</span>
        <div className="text-slate-500">
          Interest rate:{" "}
          <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
            {tx.stateAfter.annualInterestRate}%
          </HighlightableValue>{" "}
          managed by{" "}
          {batchManagerInfo?.website ? (
            <a
              href={batchManagerInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-500/75 hover:text-pink-600 dark:hover:text-pink-400 hover:underline inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {delegateDisplay}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="text-pink-500/75">{delegateDisplay}</span>
          )}
        </div>
      </div>
      {nftUrl && (
        <div className="flex items-start gap-2">
          <span className="text-slate-600 dark:text-slate-400">•</span>
          <div className="text-slate-500">
            Trove ownership is represented by an{" "}
            <a
              href={nftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
            >
              NFT token
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>{" "}
          </div>
        </div>
      )}
      </div>
    </div>
  );

  // 2. How Batch Management Works section
  const howBatchManagementWorks = (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">How Batch Management Works</div>
      <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
        By joining a batch, borrowers delegate interest rate management to a batch manager who optimizes rates on the borrower's behalf. This helps protect against redemptions while potentially saving on gas costs. A batch manager{" "}
        {batchManagerInfo?.website ? (
          <a
            href={batchManagerInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            ({delegateDisplay})
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          `(${delegateDisplay})`
        )}{" "}
        handles rate adjustments, but the borrower maintains full control over their collateral and debt through their NFT ownership.
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
            {" "}to learn how to borrow on Liquity and manage a Trove effectively.
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
            href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#what-is-delegation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            What is delegation?
          </a>
          <a
            href="https://docs.liquity.org/v2-faq/redemptions-and-delegation#how-does-delegation-work"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            How does delegation work?
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
            href={FAQ_URLS.LTV_COLLATERAL_RATIO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            Understanding LTV and collateral ratio
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
          <span className="text-slate-500 dark:text-slate-300 font-bold">Track Trove activity!</span> Rails provides detailed transaction history and analytics for Liquity positions, including batch management details. Follow us on{" "}
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
      rightColumn={howBatchManagementWorks}
      footer={railsPromotion}
      onToggle={onToggle}
      defaultOpen={defaultOpen ?? false}
      transactionHash={transaction.transactionHash}
    />
  );
}
