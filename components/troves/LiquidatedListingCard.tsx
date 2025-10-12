import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "../icons/icon";
import { TokenIcon } from "../icons/tokenIcon";
import { formatDuration } from "@/lib/date";
import { TroveSummary } from "@/types/api/trove";

export function LiquidatedListingCard({ trove }: { trove: TroveSummary }) {
  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-red-50 dark:bg-red-950 hover:shadow-lg transition-all cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold tracking-wider px-2 py-0.5 bg-red-700 text-white rounded-xs text-xs">LIQUIDATED</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
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

      {/* Content section */}
      <div className="p-4 pt-2">
        {/* Footer with asset icons, owner, trove ID, and view button */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="flex items-center">
              <TokenIcon assetSymbol={trove.collateralType} className="w-6 md:w-7 h-6 md:h-7 z-1" />
              <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 -ml-1" />
            </span>
            <span className="text-slate-400">
              <Icon name="clock-zap" size={14} className="inline mr-1" />
              {formatDuration(trove.activity.lastActivityAt, new Date())} ago
            </span>
            {trove.lastOwner && (
              <span className="bg-slate-100 dark:bg-slate-800 rounded-sm px-1.5 py-1 text-slate-600 dark:text-slate-400">
                <Icon name="user" size={12} className="inline mr-1" />
                {`${trove.lastOwner.substring(0, 6)}...${trove.lastOwner.substring(38)}`}
              </span>
            )}
            <span className="bg-slate-100 dark:bg-slate-800 rounded-sm px-1.5 py-1 text-slate-600 dark:text-slate-400">
              <Icon name="trove-id" size={12} className="inline mr-1" />
              {trove.id ? `${trove.id.substring(0, 8)}...` : "n/a"}
            </span>
          </div>
          <div className="flex items-center bg-slate-300 dark:bg-slate-800 group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
            <span
              className="text-sm text-slate-50 dark:text-slate-500 group-hover:text-white font-bold flex items-center gap-1"
              aria-label="View Trove"
            >
              <Icon name="timeline" size={20} />
              View
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
