import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { CardFooter } from "./components/CardFooter";
import { formatDateRange, formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";
import { formatPrice } from "@/lib/utils/format";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { TroveSummary } from "@/types/api/trove";
import { Link2 } from "lucide-react";

interface ClosedTroveCardProps {
  trove: TroveSummary;
}

function ClosedTroveCardContent({ trove }: ClosedTroveCardProps) {
  const { hoveredValue, setHoverEnabled } = useHover();

  // Create hover context items for closed trove
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Peak debt explanation
    items.push(
      <span key="peak-debt" className="text-slate-600 dark:text-slate-500">
        This trove reached a maximum debt of{" "}
        <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak}>
          {formatPrice(trove.debt.peak)} BOLD
        </HighlightableValue>{" "}
        during its lifetime
      </span>,
    );

    // Peak collateral explanation
    items.push(
      <span key="peak-collateral" className="text-slate-600 dark:text-slate-500">
        The highest recorded collateral was{" "}
        <HighlightableValue type="peakCollateral" state="after" value={trove.collateral.peakAmount}>
          {formatPrice(trove.collateral.peakAmount)} {trove.collateralType}
        </HighlightableValue>
      </span>,
    );

    // Trove lifecycle
    const duration = formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt);
    const durationInSeconds =
      (new Date(trove.activity.lastActivityAt).getTime() - new Date(trove.activity.createdAt).getTime()) / 1000;

    items.push(
      <span key="lifecycle" className="text-slate-600 dark:text-slate-500">
        Trove was active for{" "}
        <HighlightableValue type="duration" state="after" value={durationInSeconds}>
          {duration}
        </HighlightableValue>{" "}
        from{" "}
        <HighlightableValue
          type="dateRange"
          state="after"
          value={`${trove.activity.createdAt}-${trove.activity.lastActivityAt}`}
        >
          {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
        </HighlightableValue>
      </span>,
    );

    // Closure context
    items.push(
      <span key="closure" className="text-slate-600 dark:text-slate-500">
        The trove has been closed and all debt has been repaid. Any collateral above the liquidation reserve was
        returned to the owner
      </span>,
    );

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl) {
      items.push(
        <span key="nft-info" className="text-slate-600 dark:text-slate-500">
          Trove is represented by an ERC-721 NFT token
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-200 dark:bg-slate-800 w-4 h-4 rounded-full transition-colors duration-150"
            aria-label="View NFT on OpenSea"
          >
            <Link2 className="w-3 h-3" />
          </a>{" "}
          for ownership verification
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>,
      );
    }

    return items;
  }, [trove, hoveredValue]);

  return (
    <div>
      <div className="relative rounded-lg text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-700 dark:border-transparent">
        {/* Header section */}
        <div className="grid grid-cols-[auto_1fr] gap-2 p-4 pb-0 items-start">
          <div className="flex items-center">
            {/* Status */}
            <span className="font-bold px-2 py-0.5 bg-slate-500 dark:bg-slate-800 text-white dark:text-slate-400 rounded text-xs">
              CLOSED
            </span>
          </div>
          {/* Metrics moved to the right */}
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end pt-0.5">
            <span className="text-slate-600 dark:text-slate-400">
              <HighlightableValue
                type="dateRange"
                state="after"
                value={`${trove.activity.createdAt}-${trove.activity.lastActivityAt}`}
                variant="card"
              >
                {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
              </HighlightableValue>
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              <HighlightableValue
                type="duration"
                state="after"
                value={
                  (new Date(trove.activity.lastActivityAt).getTime() - new Date(trove.activity.createdAt).getTime()) /
                  1000
                }
                variant="card"
              >
                {formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
              </HighlightableValue>
            </span>
            {trove.activity.redemptionCount > 0 && (
              <span className="inline-flex items-center text-orange-400">
                <Icon name="triangle" size={12} />
                <span className="ml-1">{trove.activity.redemptionCount}</span>
              </span>
            )}
            <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
              <Icon name="arrow-left-right" size={12} />
              <span className="ml-1">{trove.activity.transactionCount - trove.activity.redemptionCount}</span>
            </span>
          </div>
        </div>

        {/* Content section with standard grid layout */}
        <div className="grid grid-cols-1 pt-2 p-4 gap-4">
          {/* Main values grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:items-start">
            {/* Highest recorded debt - spans 2 columns on mobile */}
            <div className="col-span-2 md:col-span-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-600">Highest recorded debt</span>
              <div className="flex items-center">
                <span className="text-3xl font-bold">
                  <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak} variant="card">
                    {formatPrice(trove.debt.peak)}
                  </HighlightableValue>
                </span>
                <span className="ml-2 text-green-600 text-lg">
                  <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
                </span>
              </div>
            </div>

            {/* Highest recorded collateral - full width on mobile */}
            <div className="col-span-2 md:col-span-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-600">Highest recorded collateral</span>
              <div className="flex items-center">
                <span className="flex items-center">
                  <span className="text-2xl font-bold mr-1">
                    <HighlightableValue type="peakCollateral" state="after" value={trove.collateral.peakAmount} variant="card">
                      {formatPrice(trove.collateral.peakAmount)}
                    </HighlightableValue>
                  </span>
                  <TokenIcon assetSymbol={trove.collateralType} />
                </span>
              </div>
            </div>
          </div>

          <CardFooter trove={trove} />
        </div>
      </div>

      {/* Drawer - 20px narrower than the card above */}
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

export function ClosedSummaryCard({ trove }: ClosedTroveCardProps) {
  return (
    <HoverProvider>
      <ClosedTroveCardContent trove={trove} />
    </HoverProvider>
  );
}
