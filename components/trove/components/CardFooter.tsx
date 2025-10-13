"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Image, Link2 } from "lucide-react";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { TroveSummary } from "@/types/api/trove";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";

interface TroveCardFooterProps {
  trove: TroveSummary;
  dateText?: string;
  showDetailedInfo?: boolean;
  isLiquidated?: boolean;
}

export function CardFooter({ trove, dateText, showDetailedInfo = true, isLiquidated = false }: TroveCardFooterProps) {
  const [copiedOwnerAddress, setCopiedOwnerAddress] = useState(false);
  const [copiedTrove, setCopiedTrove] = useState(false);

  // Use lastOwner for liquidated troves, otherwise use owner
  const displayOwner = trove.owner || trove.lastOwner;
  const isLastOwner = !trove.owner && trove.lastOwner;

  // Different background colors for liquidated vs active troves
  const badgeBgClass = isLiquidated
    ? "bg-red-100 dark:bg-black/25"
    : "bg-slate-100 dark:bg-slate-800";

  return (
    <div className="text-xs">
      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 sm:items-center">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:space-x-3">
          {dateText && (
            <span className="text-slate-400 flex items-center gap-1">
              <Icon name="clock-zap" size={14} />
              {dateText}
            </span>
          )}
          <div className="flex flex-wrap sm:flex-row gap-3">
            {showDetailedInfo && displayOwner && (
              <span className={`${badgeBgClass} rounded-sm px-1.5 py-1 inline-flex items-center`}>
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Icon name="user" size={12} />
                  <Link
                    href={`/troves?ownerAddress=${displayOwner}`}
                    className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                  >
                    <HighlightableValue
                      type="ownerAddress"
                      state="after"
                      className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      variant="card"
                    >
                      {trove.ownerEns || `${displayOwner.substring(0, 6)}...${displayOwner.substring(38)}`}
                    </HighlightableValue>
                  </Link>
                  <div className="relative inline-block group">
                    <button
                      className="mx-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                      aria-label={copiedOwnerAddress ? "Copied to clipboard" : "Copy to clipboard"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (displayOwner) {
                          navigator.clipboard.writeText(displayOwner);
                          setCopiedOwnerAddress(true);
                          setTimeout(() => setCopiedOwnerAddress(false), 2000);
                        }
                      }}
                    >
                      <Icon name={copiedOwnerAddress ? "check" : "copy"} size={14} />
                    </button>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                      <div
                        className={`bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-200 px-2 py-1 rounded text-xs whitespace-nowrap transition-opacity duration-200 ${
                          copiedOwnerAddress ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {copiedOwnerAddress ? "Copied!" : "Copy"}
                      </div>
                    </div>
                  </div>
                </span>
              </span>
            )}
            {showDetailedInfo && (
              <span className={`${badgeBgClass} rounded-sm px-1.5 py-1 inline-flex items-center`}>
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Icon name="trove-id" size={12} />
                  <HighlightableValue
                    type="troveId"
                    state="after"
                    className="text-slate-600 dark:text-slate-400"
                    value={trove.id ? parseInt(trove.id) : undefined}
                    variant="card"
                  >
                    {trove.id ? `${trove.id.substring(0, 8)}...` : "n/a"}
                  </HighlightableValue>
                  <div className="relative inline-block group">
                    <button
                      className="mx-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                      aria-label={copiedTrove ? "Copied to clipboard" : "Copy to clipboard"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (trove.id) {
                          navigator.clipboard.writeText(trove.id);
                          setCopiedTrove(true);
                          setTimeout(() => setCopiedTrove(false), 2000);
                        }
                      }}
                    >
                      <Icon name={copiedTrove ? "check" : "copy"} size={14} />
                    </button>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                      <div
                        className={`bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-200 px-2 py-1 rounded text-xs whitespace-nowrap transition-opacity duration-200 ${
                          copiedTrove ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {copiedTrove ? "Copied!" : "Copy"}
                      </div>
                    </div>
                  </div>
                </span>
              </span>
            )}
            {showDetailedInfo && getTroveNftUrl(trove.collateralType, trove.id) && (
              <span className={`${badgeBgClass} rounded-sm px-1.5 py-1 inline-flex items-center`}>
                <a
                  href={getTroveNftUrl(trove.collateralType, trove.id)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 justify-center ml-0.5 transition-colors duration-150"
                  aria-label="View NFT on OpenSea"
                >
                  <HighlightableValue
                    type="nftToken"
                    state="after"
                    className="text-slate-600 dark:text-slate-400"
                    variant="card"
                  >
                    <Image size={14} className="" />
                  </HighlightableValue>
                  <Link2
                    size={14}
                    className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-200 dark:bg-slate-800 w-4 h-4 rounded-full transition-colors duration-150"
                  />
                </a>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
