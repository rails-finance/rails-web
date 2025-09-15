import { useMemo, useState } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { formatDateRange } from "@/lib/date";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";
import { InfoButton } from "@/components/transaction-timeline/explanation/InfoButton";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import { TroveSummary } from "@/types/api/trove";

interface ClosedTroveCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
}

function ClosedTroveCardContent({ trove, showViewButton = false }: ClosedTroveCardProps) {
  const [showHoverContext, setShowHoverContext] = useState(false);
  const { hoveredValue, hoverEnabled, setHoverEnabled } = useHover();

  // Create hover context items for closed trove
  const hoverContextItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Peak debt explanation
    items.push(
      <span key="peak-debt" className="text-slate-500">
        This trove reached a maximum debt of <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak}>{formatPrice(trove.debt.peak)} BOLD</HighlightableValue> during its lifetime
      </span>
    );

    // Peak collateral explanation
    items.push(
      <span key="peak-collateral" className="text-slate-500">
        The highest recorded collateral was <HighlightableValue type="peakCollateral" state="after" value={trove.collateral.peakAmount}>{formatPrice(trove.collateral.peakAmount)} {trove.collateralType}</HighlightableValue>
      </span>
    );

    // Trove lifecycle
    const openDate = new Date(trove.activity.createdAt);
    const closeDate = new Date(trove.activity.lastActivityAt);
    const lifetimeDays = Math.floor((closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24));
    
    items.push(
      <span key="lifecycle" className="text-slate-500">
        Trove was active for <strong className="text-white">{lifetimeDays} days</strong> from {formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt)}
      </span>
    );

    // Closure context
    items.push(
      <span key="closure" className="text-slate-500">
        The trove has been closed and all debt has been repaid. Any collateral above the liquidation reserve was returned to the owner
      </span>
    );

    // Add NFT information if NFT URL is available
    const nftUrl = getTroveNftUrl(trove.collateralType, trove.id);
    if (nftUrl) {
      items.push(
        <span key="nft-info" className="text-slate-500">
          Trove is represented by an ERC-721 NFT token
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-rotate-45 inline-flex items-center justify-center ml-0.5 bg-slate-800 w-4 h-4 rounded-full transition-colors"
            aria-label="View NFT on OpenSea"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-link2 lucide-link-2 w-3 h-3 text-slate-500" aria-hidden="true">
              <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
              <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
              <line x1="8" x2="16" y1="12" y2="12"></line>
            </svg>
          </a>
         {' '}for ownership verification
          <InfoButton href={FAQ_URLS.NFT_TROVES} />
        </span>
      );
    }

    return items;
  }, [trove, hoveredValue]);

  return (
    <div>
      <div className="relative rounded-lg text-slate-500 bg-slate-700">
        {/* Header section with no padding on sides to allow full-width header */}
        <div className="flex items-center">
          <TroveCardHeader status="closed" assetType={trove.assetType} />
          
          {/* Status aligned with logo */}
          <div className="flex items-center ml-4">
            <span className="text-xs font-semibold px-2 py-1 bg-slate-800 text-slate-400 rounded mr-2">CLOSED</span>
          </div>
        </div>

        {/* Content section with standard grid layout */}
        <div className="grid grid-cols-1 pt-2 p-4 gap-4">

      {/* Main value */}
      <div>
        <p className="text-xs text-slate-400 mb-1">Debt</p>
        <div className="flex items-center">
          <h3 className="text-3xl font-bold">
            <HighlightableValue type="peakDebt" state="after" value={trove.debt.peak}>
              {formatPrice(trove.debt.peak)}
            </HighlightableValue>
          </h3>
          <span className="ml-2 text-green-400 text-lg">
            <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
          </span>
          <span className="ml-2 text-slate-400 text-sm">at peak</span>
        </div>
      </div>


        {showViewButton ? (
          <TroveCardFooter
            trove={trove}
            showViewButton={showViewButton}
            dateInfo={{
              prefix: "Closed",
              date: formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt),
              suffix: ""
            }}
          />
        ) : (
          <TroveCardFooter
            trove={trove}
            showViewButton={showViewButton}
            dateInfo={{
              prefix: "Closed",
              date: formatDateRange(trove.activity.createdAt, trove.activity.lastActivityAt),
              suffix: ""
            }}
          />
        )}
        </div>
      </div>

      {/* Drawer - 20px narrower than the card above */}
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

export function ClosedTroveCard({ trove, showViewButton = false }: ClosedTroveCardProps) {
  return (
    <HoverProvider>
      <ClosedTroveCardContent trove={trove} showViewButton={showViewButton} />
    </HoverProvider>
  );
}
