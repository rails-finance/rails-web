import { useMemo } from "react";
import Link from "next/link";
import { CardFooter } from "./components/CardFooter";
import { formatDateRange, formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { getLiquidationThreshold } from "@/lib/utils/liquidation-utils";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { TroveSummary } from "@/types/api/trove";

interface LiquidatedTroveCardProps {
  trove: TroveSummary;
}

function LiquidatedTroveCardContent({ trove }: LiquidatedTroveCardProps) {
  const { hoveredValue, setHoverEnabled } = useHover();

  // Get the liquidation threshold for this collateral type
  const liquidationThreshold = getLiquidationThreshold(trove.collateralType);

  // Truncate trove ID for display (first 6 + last 4 characters)
  const truncatedTroveId = trove.id.length > 10
    ? `${trove.id.slice(0, 6)}...${trove.id.slice(-4)}`
    : trove.id;

  // Calculate date values outside useMemo for use in both header and explanation
  const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);
  const dateRange = formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt);

  // Create hover context items for liquidated trove
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Liquidation explanation
    items.push(
      <span key="liquidation" className="text-slate-500">
        Trove ID{" "}
        <HighlightableValue
          type="troveId"
          state="after"
          value={trove.id ? parseInt(trove.id) : undefined}
        >
          {truncatedTroveId}
        </HighlightableValue>
        {" "}was liquidated when the collateral ratio fell below the minimum threshold ({liquidationThreshold}% for {trove.collateralType})
        <InfoButton href={FAQ_URLS.LIQUIDATIONS} />
      </span>,
    );

    // Trove lifecycle

    items.push(
      <span key="lifecycle" className="text-slate-500">
        Trove was active for{" "}
        <HighlightableValue type="duration" state="after">
          {duration}
        </HighlightableValue>{" "}
        before liquidation from{" "}
        <HighlightableValue type="dateRange" state="after">
          {dateRange}
        </HighlightableValue>
      </span>,
    );

    // Add NFT and owner information
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl && trove.lastOwner) {
      const truncatedOwner = trove.ownerEns || `${trove.lastOwner.substring(0, 6)}...${trove.lastOwner.substring(38)}`;
      items.push(
        <span key="nft-info" className="text-slate-500">
          The{" "}
          <HighlightableValue type="nftToken" state="after">
            NFT
          </HighlightableValue>{" "}
          representing trove{" "}
          <HighlightableValue
            type="troveId"
            state="after"
            value={trove.id ? parseInt(trove.id) : undefined}
          >
            {`${trove.id.substring(0, 8)}...`}
          </HighlightableValue>{" "}
          was held by{" "}
          <Link
            href={`/troves?ownerAddress=${trove.lastOwner}`}
            className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            <HighlightableValue type="ownerAddress" state="after">
              {truncatedOwner}
            </HighlightableValue>
          </Link>{" "}
          at the time of liquidation
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>,
      );
    } else if (nftUrl) {
      items.push(
        <span key="nft-info" className="text-slate-500">
          Trove is represented by an ERC-721 NFT token for ownership verification
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>,
      );
    }

    return items;
  }, [trove, hoveredValue, liquidationThreshold, truncatedTroveId, duration, dateRange]);

  return (
    <div>
      <div className="rounded-lg text-slate-600 dark:text-slate-500 bg-red-50 dark:bg-red-950  dark:border-red-900">
        {/* Header section */}
        <div className="grid grid-cols-[auto_1fr] gap-2 p-4 pb-0 items-start">
          <div className="flex items-center">
            {/* Status */}
            <span className="font-bold tracking-wider px-2 py-0.5 bg-red-700 text-white rounded-xs text-xs">LIQUIDATED</span>
          </div>
          {/* Metrics moved to the right */}
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end pt-0.5">
            <HighlightableValue type="dateRange" state="after">
              <span className="text-slate-400">
                {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
              </span>
            </HighlightableValue>
            <div className="flex items-center gap-1">
              <HighlightableValue type="duration" state="after">
                <span className="text-slate-600 dark:text-slate-400 rounded-lg bg-red-200 dark:bg-black/25 px-2">
                  {formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
                </span>
              </HighlightableValue>
              {trove.activity.redemptionCount > 0 && (
                <span className="inline-flex items-center text-orange-400">
                  <Icon name="triangle" size={12} />
                  <span className="ml-1">{trove.activity.redemptionCount}</span>
                </span>
              )}
              <span className="inline-flex items-center text-slate-400">
                <Icon name="arrow-left-right" size={12} />
                <span className="ml-1">{trove.activity.transactionCount - trove.activity.redemptionCount}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Content section */}
        <div className="p-4 pt-2">
          <CardFooter trove={trove} isLiquidated={true} />
        </div>
      </div>

      {/* Explanation Panel */}
      <div className="px-2.5">
        <ExplanationPanel
          items={hoverContextItems}
          onToggle={(isOpen) => {
            setHoverEnabled(isOpen);
          }}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}

export function LiquidatedSummaryCard({ trove }: LiquidatedTroveCardProps) {
  return (
    <HoverProvider>
      <LiquidatedTroveCardContent trove={trove} />
    </HoverProvider>
  );
}
