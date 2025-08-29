import { useMemo, useState } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { formatDateRange } from "@/lib/date";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { useHover, HoverProvider } from "@/components/transaction-timeline/context/HoverContext";

interface ClosedTroveCardProps {
  trove: any;
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
        This trove reached a maximum debt of <HighlightableValue type="peakDebt" state="after" value={trove.peakValue}>{formatPrice(trove.peakValue)} {trove.assetType}</HighlightableValue> during its lifetime
      </span>
    );

    // Peak collateral explanation
    items.push(
      <span key="peak-collateral" className="text-slate-500">
        The highest recorded collateral was <HighlightableValue type="peakCollateral" state="after" value={trove.backedBy.peakAmount}>{formatPrice(trove.backedBy.peakAmount)} {trove.collateralType}</HighlightableValue>
      </span>
    );

    // Trove lifecycle
    const openDate = new Date(trove.activity.created);
    const closeDate = new Date(trove.activity.lastActivity);
    const lifetimeDays = Math.floor((closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24));
    
    items.push(
      <span key="lifecycle" className="text-slate-500">
        Trove was active for <strong className="text-white">{lifetimeDays} days</strong> from {formatDateRange(trove.activity.created, trove.activity.lastActivity)}
      </span>
    );

    // Closure context
    items.push(
      <span key="closure" className="text-slate-500">
        The trove has been closed and all debt has been repaid. Any collateral above the liquidation reserve was returned to the owner
      </span>
    );

    return items;
  }, [trove, hoveredValue]);

  return (
    <div>
      <div className="rounded-lg text-slate-500 bg-slate-700 grid grid-cols-1 p-4 gap-4">
        <TroveCardHeader status="closed" assetType={trove.assetType} />

      {/* Main value */}
      <div>
        <div className="text-sm mb-1">Debt at peak</div>
        <div className="flex items-center">
          <h3 className="text-3xl font-bold">
            <HighlightableValue type="peakDebt" state="after" value={trove.peakValue}>
              {formatPrice(trove.peakValue)}
            </HighlightableValue>
          </h3>
          <span className="ml-2 text-green-400 text-lg">
            <TokenIcon assetSymbol={trove.assetType} />
          </span>
        </div>
      </div>

      {/* Backed by section */}
      <div>
        <p className="text-sm">Highest recorded collateral</p>
        <div className="flex items-center">
          <div className="flex items-center">
            <p className="text-xl font-medium mr-1">
              <HighlightableValue type="peakCollateral" state="after" value={trove.backedBy.peakAmount}>
                {formatPrice(trove.backedBy.peakAmount)}
              </HighlightableValue>
            </p>
            <span className="flex items-center text-slate-400">
              <TokenIcon assetSymbol={trove.collateralType} />
            </span>
          </div>
        </div>
      </div>

        <TroveCardFooter
          trove={trove}
          showViewButton={showViewButton}
          dateText={`${formatDateRange(trove.activity.created, trove.activity.lastActivity)}`}
        />
      </div>

      {/* Hover context panel - moved outside the main card */}
      <ExplanationPanel 
        items={hoverContextItems} 
        onToggle={(isOpen) => {
          setShowHoverContext(isOpen);
          setHoverEnabled(isOpen);
        }}
        defaultOpen={false}
      />
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
