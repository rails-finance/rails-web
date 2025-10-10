import React from "react";
import Link from "next/link";
import { Transaction } from "@/types/api/troveHistory";
import { HighlightableValue } from "../HighlightableValue";
import { ExplanationPanel } from "../ExplanationPanel";
import { InfoButton } from "../InfoButton";
import { FAQ_URLS } from "../shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";

interface TransferTroveExplanationProps {
  transaction: Transaction;
  onToggle: (isOpen: boolean) => void;
}

export function TransferTroveExplanation({ transaction, onToggle }: TransferTroveExplanationProps) {
  const tx = transaction as any;
  const fromAddress = tx.fromAddress;
  const toAddress = tx.toAddress;
  const transferType = tx.transferType;

  const items: React.ReactNode[] = [];

  // Opening explanation based on transfer type
  if (transferType === "mint") {
    items.push(
      <span key="mint" className="text-slate-500">
        Trove NFT minted to wallet{" "}
        <Link
          href={`/troves?ownerAddress=${toAddress}`}
          className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
        >
          {`${toAddress.substring(0, 6)}...${toAddress.substring(38)}`}
        </Link>
      </span>,
    );
  } else if (transferType === "burn") {
    items.push(
      <span key="burn" className="text-slate-500">
        Trove NFT burned from wallet{" "}
        <Link
          href={`/troves?ownerAddress=${fromAddress}`}
          className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
        >
          {`${fromAddress.substring(0, 6)}...${fromAddress.substring(38)}`}
        </Link>
      </span>,
    );
  } else {
    items.push(
      <span key="transfer" className="text-slate-500">
        Trove ownership transferred from wallet{" "}
        <Link
          href={`/troves?ownerAddress=${fromAddress}`}
          className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
        >
          {`${fromAddress.substring(0, 6)}...${fromAddress.substring(38)}`}
        </Link>{" "}
        to wallet{" "}
        <Link
          href={`/troves?ownerAddress=${toAddress}`}
          className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
        >
          {`${toAddress.substring(0, 6)}...${toAddress.substring(38)}`}
        </Link>
      </span>,
    );
  }

  // Explain NFT-based ownership
  items.push(
    <span key="nft-ownership" className="text-slate-500">
      Liquity V2 troves are represented as ERC-721 NFT tokens, enabling transferable ownership
      <InfoButton href={FAQ_URLS.NFT_TROVES} />
    </span>,
  );

  // Explain what happens with the transfer
  if (transferType === "transfer") {
    items.push(
      <span key="ownership-change" className="text-slate-500">
        The new owner gains full control of the trove's debt, collateral, and interest rate settings
      </span>,
    );

    // Show the transferred position details
    if (tx.stateAfter) {
      items.push(
        <span key="transferred-position" className="text-slate-500">
          The transferred trove contains{" "}
          <HighlightableValue type="debt" state="after" value={tx.stateAfter.debt}>
            {tx.stateAfter.debt.toLocaleString()} {tx.assetType || "BOLD"}
          </HighlightableValue>{" "}
          debt and{" "}
          <HighlightableValue type="collateral" state="after" value={tx.stateAfter.coll}>
            {tx.stateAfter.coll} {tx.collateralType}
          </HighlightableValue>{" "}
          collateral with a{" "}
          <HighlightableValue type="collRatio" state="after" value={tx.stateAfter.collateralRatio}>
            {tx.stateAfter.collateralRatio.toFixed(1)}%
          </HighlightableValue>{" "}
          collateral ratio at a{" "}
          <HighlightableValue type="interestRate" state="after" value={tx.stateAfter.annualInterestRate}>
            {tx.stateAfter.annualInterestRate}%
          </HighlightableValue>{" "}
          interest rate
          {tx.collateralPrice && (
            <>
              {" "}
              ({tx.collateralType} price:{" "}
              <HighlightableValue type="collateralPrice" state="after" value={tx.collateralPrice}>
                ${tx.collateralPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </HighlightableValue>
              )
            </>
          )}
        </span>,
      );
    }
  }

  // Add NFT link if available
  const nftUrl = getTroveNftUrl(tx.collateralType, tx.troveId);
  if (nftUrl) {
    items.push(
      <span key="nft-link" className="text-slate-500">
        View NFT on OpenSea
        <ExternalLinkIcon href={nftUrl} label="View NFT on OpenSea" />
      </span>,
    );
  }

  // Explain debt and collateral remain unchanged
  items.push(
    <span key="unchanged" className="text-slate-500">
      Trove's debt and collateral balances remain unchanged during ownership transfer
    </span>,
  );

  return (
    <ExplanationPanel
      items={items}
      onToggle={onToggle}
      defaultOpen={false}
      transactionHash={transaction.transactionHash}
    />
  );
}
