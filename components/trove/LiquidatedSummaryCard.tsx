import { useMemo, useState } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { CardFooter } from "./components/CardFooter";
import { formatDate, formatDateRange, formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";
import { formatPrice } from "@/lib/utils/format";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { TroveSummary } from "@/types/api/trove";

interface LiquidatedTroveCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
}

function LiquidatedTroveCardContent({ trove, showViewButton = false }: LiquidatedTroveCardProps) {
  const [showHoverContext, setShowHoverContext] = useState(false);
  const { hoveredValue, hoverEnabled, setHoverEnabled } = useHover();

  // Create hover context items for liquidated trove
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Liquidation explanation
    items.push(
      <span key="liquidation" className="text-slate-500">
        This trove was liquidated when the collateral ratio fell below the minimum threshold (110%)
        <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
      </span>,
    );

    // Debt at liquidation
    items.push(
      <span key="liquidated-debt" className="text-slate-500">
        Total debt of{" "}
        <HighlightableValue type="debt" state="after" value={trove.debt.peak}>
          {formatPrice(trove.debt.peak)} BOLD
        </HighlightableValue>{" "}
        was liquidated
      </span>,
    );

    // Collateral seized
    items.push(
      <span key="collateral-seized" className="text-slate-500">
        <HighlightableValue type="collateral" state="after" value={trove.collateral.peakAmount}>
          {formatPrice(trove.collateral.peakAmount)} {trove.collateralType}
        </HighlightableValue>{" "}
        collateral was seized during liquidation
      </span>,
    );

    // Trove lifecycle
    const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);

    items.push(
      <span key="lifecycle" className="text-slate-500">
        Trove was active for <strong className="text-white">{duration}</strong> before liquidation from{" "}
        {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
      </span>,
    );

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl) {
      items.push(
        <span key="nft-info" className="text-slate-500">
          Trove is represented by an ERC-721 NFT token for ownership verification
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors"
            aria-label="View NFT on OpenSea"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-link2 lucide-link-2 w-3 h-3 text-slate-500"
              aria-hidden="true"
            >
              <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
              <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
              <line x1="8" x2="16" y1="12" y2="12"></line>
            </svg>
          </a>
        </span>,
      );
    }

    return items;
  }, [trove, hoveredValue]);

  return (
    <div>
      <div className="rounded-lg text-slate-500 bg-red-950 text-red-800 border border-red-900">
        {/* Header section */}
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-center">
            {/* Status */}
            <span className="font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs text-xs">LIQUIDATED</span>
          </div>
          {/* Metrics moved to the right */}
          <div className="flex items-center gap-2 text-xs">
            {!showViewButton && (
              <span className="text-slate-400">
                {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
              </span>
            )}
            <span className="text-slate-400">
              {formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
            </span>
            {trove.activity.redemptionCount > 0 && (
              <span className="inline-flex items-center text-orange-400">
                <Icon name="triangle" size={12} />
                <span className="ml-1">{trove.activity.redemptionCount}</span>
              </span>
            )}
            <span className="inline-flex items-center text-slate-400">
              <Icon name="arrow-left-right" size={12} />
              <span className="ml-1">{trove.activity.transactionCount}</span>
            </span>
          </div>
        </div>

        {/* Content section with standard grid layout */}
        <div className="grid grid-cols-1 pt-2 p-4 gap-4">
          {/* Main value */}
          <div>
            <div className="text-sm mb-1">Liquidated Amount</div>
            <div className="flex items-center">
              <h3 className="text-3xl font-bold text-white">
                <HighlightableValue type="debt" state="after" value={trove.debt.peak}>
                  {formatPrice(trove.debt.peak)}
                </HighlightableValue>
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Collateral at liquidation */}
          <div>
            <p className="text-sm">Collateral at liquidation</p>
            <div className="flex items-center">
              <div className="flex items-center">
                <p className="text-xl font-medium text-white mr-1">
                  <HighlightableValue type="collateral" state="after" value={trove.collateral.peakAmount}>
                    {formatPrice(trove.collateral.peakAmount)}
                  </HighlightableValue>
                </p>
                <span className="flex items-center text-slate-400">
                  <TokenIcon assetSymbol={trove.collateralType} />
                </span>
              </div>
            </div>
          </div>

          <CardFooter
            trove={trove}
            dateText={
              showViewButton ? `${formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}` : undefined
            }
          />
        </div>
      </div>

      {/* Explanation Panel */}
      <div className="px-2.5">
        <ExplanationPanel
          items={hoverContextItems}
          onToggle={(isOpen) => {
            setShowHoverContext(isOpen);
            setHoverEnabled(isOpen);
          }}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}

export function LiquidatedSummaryCard({ trove, showViewButton = false }: LiquidatedTroveCardProps) {
  return (
    <HoverProvider>
      <LiquidatedTroveCardContent trove={trove} showViewButton={showViewButton} />
    </HoverProvider>
  );
}
