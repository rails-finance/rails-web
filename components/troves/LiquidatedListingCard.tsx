import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "../icons/icon";
import { formatDuration } from "@/lib/date";
import { CardFooter } from "../trove/components/CardFooter";
import { TokenIcon } from "../icons/tokenIcon";
import { formatPrice } from "@/lib/utils/format";
import { TroveSummary } from "@/types/api/trove";

export function LiquidatedListingCard({
  trove,
  collateralAtLiquidation,
}: {
  trove: TroveSummary;
  collateralAtLiquidation?: number;
}) {
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
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-red-50 dark:bg-slate-800 hover:shadow-lg transition-all cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs">LIQUIDATED</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
            <Icon name="arrow-left-right" size={12} />
            <span className="ml-1">{trove.activity.transactionCount}</span>
          </span>
          {trove.activity.redemptionCount > 0 && (
            <span className="inline-flex items-center text-orange-400">
              <Icon name="triangle" size={12} />
              <span className="ml-1">{trove.activity.redemptionCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content section - single responsive structure */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main metrics grid - responsive columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 md:items-end">
          {/* Liquidated debt value */}
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Liquidated Debt</p>
            <div className="flex items-center">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-600 dark:text-slate-200">
                {formatPrice(trove.debt.current)}
              </h3>
              <span className="ml-2 text-green-600">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Collateral at liquidation */}
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Collateral at Liquidation</p>
            <div className="flex items-center">
              <p className="text-lg md:text-xl font-bold mr-1 text-slate-600 dark:text-slate-200">
                {collateralAtLiquidation ? collateralAtLiquidation.toFixed(4) : "—"}
              </p>
              {collateralAtLiquidation && <TokenIcon assetSymbol={trove.collateralType} />}
            </div>
          </div>

          {/* Final interest rate */}
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Final Interest Rate</p>
            <div className="text-lg md:text-xl font-medium text-slate-600 dark:text-slate-200">
              {trove.metrics.interestRate}%
            </div>
          </div>
        </div>

        {/* Footer with view button */}
        <div className="flex items-center justify-between">
          <CardFooter
            trove={trove}
            dateText={`${formatDuration(trove.activity.lastActivityAt, new Date())} ago`}
            showDetailedInfo={false}
          />
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
