import React from "react";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { formatCurrency, formatUsdValue } from "@/lib/utils/format";
import { getUpfrontFee } from "../shared/eventHelpers";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { FAQ_URLS } from "../shared/faqUrls";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { Link2 } from "lucide-react";

interface OpenTroveAndJoinBatchExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function OpenTroveAndJoinBatchExplanation({ transaction, onToggle }: OpenTroveAndJoinBatchExplanationProps) {
  const tx = transaction as any;
  const batchOpenFee = getUpfrontFee(tx);
  const batchPrincipalBorrowed = tx.stateAfter.debt - batchOpenFee;
  const batchCollRatio = tx.stateAfter.collateralRatio;
  const batchCollUsdValue = tx.stateAfter.collateralInUsd;

  // Get batch manager info
  const batchManagerInfo = getBatchManagerByAddress(tx.stateAfter.interestBatchManager || "");
  const delegateDisplay = batchManagerInfo?.description || batchManagerInfo?.name || tx.stateAfter.interestBatchManager || "Unknown manager";

  const batchItems: React.ReactNode[] = [
    <span key="opened" className="text-slate-500">
      Opened a new Trove and delegated interest management to{" "}
      <span className="text-pink-500/75">{delegateDisplay}</span>
      {batchManagerInfo?.website && (
        <a
          href={batchManagerInfo.website}
          target="_blank"
          rel="noopener noreferrer"
          className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-blue-500 w-4 h-4 rounded-full transition-colors hover:bg-blue-600 text-white"
          aria-label={`Visit ${batchManagerInfo.name} website`}
          onClick={(e) => e.stopPropagation()}
        >
          <Link2 className="w-3 h-3" />
        </a>
      )}{" "}
    </span>,
    <span key="deposited" className="text-slate-500">
      Deposited{" "}
      <HighlightableValue type="collateral" state="change" value={tx.stateAfter.coll}>
        {tx.stateAfter.coll} {tx.collateralType}
      </HighlightableValue>{" "}
      as collateral
    </span>,
    <span key="borrowed" className="text-slate-500">
      Borrowed{" "}
      <HighlightableValue type="debt" state="change" value={batchPrincipalBorrowed}>
        {formatCurrency(batchPrincipalBorrowed, tx.assetType)}
      </HighlightableValue>{" "}
      through the batch
    </span>,
  ];

  if (batchOpenFee > 0) {
    batchItems.push(
      <span key="fee" className="text-slate-500">
        Paid a{" "}
        <HighlightableValue type="upfrontFee" state="fee" value={batchOpenFee}>
          {batchOpenFee.toFixed(2)} {tx.assetType}
        </HighlightableValue>{" "}
        upfront borrowing fee
      </span>,
    );
  }

  batchItems.push(
    <span key="totalDebt" className="text-slate-500">
      Total debt is{" "}
      <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
        {formatCurrency(tx.stateAfter.debt, tx.assetType)}
      </HighlightableValue>
      {batchOpenFee > 0 && " including fees"}
    </span>,
  );

  if (batchCollUsdValue) {
    batchItems.push(
      <span key="collValue" className="text-slate-500">
        Collateral value at opening{" "}
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
      </span>,
    );
  }

  batchItems.push(
    <span key="collRatio" className="text-slate-500">
      Starting collateral ratio:{" "}
      <HighlightableValue type="collRatio" state="after" value={batchCollRatio}>
        {batchCollRatio ? batchCollRatio.toFixed(1) : "0"}%
      </HighlightableValue>
    </span>,
    <span key="interestRate" className="text-slate-500">
      Batch interest rate:{" "}
      <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
        {tx.stateAfter.annualInterestRate}%
      </HighlightableValue>{" "}
      annual (managed by batch operator)
    </span>,
  );

  // Add NFT minting explanation if NFT URL is available
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
  if (nftUrl) {
    batchItems.push(
      <span key="nftMint" className="text-slate-500">
        Trove is represented by an ERC-721 NFT token
        <ExternalLinkIcon href={nftUrl} label="View NFT on OpenSea" /> representing ownership
        <InfoButton href={FAQ_URLS.NFT_TROVES} />
      </span>,
    );
  }

  batchItems.push(
    <span key="success" className="text-slate-500">
      Trove opened with batch management
    </span>,
  );

  return (
    <ExplanationPanel
      items={batchItems}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
