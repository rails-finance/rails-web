import Link from "next/link";
import { TroveSummary } from "@/types/api/trove";
import { Icon } from "../icons/icon";
import { formatApproximate, formatUsdValue } from "@/lib/utils/format";
import { TokenIcon } from "../icons/tokenIcon";
import { ChevronRight, Users } from "lucide-react";
import { CardFooter } from "../trove/components/CardFooter";
import { formatDuration } from "@/lib/date";
import { formatBatchManagerDisplay } from "@/lib/services/batch-manager-service";
import { OraclePricesData } from "@/types/api/oracle";

export function OpenListingCard({ trove, prices }: { trove: TroveSummary; prices?: OraclePricesData | null }) {
  // Save scroll position when navigating to trove detail
  const handleClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  // Calculate collateral ratio when prices are available
  // Use live prices for ratio (price volatility >> debt staleness)
  const collateralTokenKey = trove.collateralType.toLowerCase() as keyof OraclePricesData;
  const currentPrice = prices ? prices[collateralTokenKey] : null;
  const collateralUsd = currentPrice ? trove.collateral.amount * currentPrice : null;
  const collateralRatio =
    collateralUsd && trove.debt.current > 0 ? (collateralUsd / trove.debt.current) * 100 : null;

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 hover:dark:bg-slate-900/70 hover:bg-slate-50/70 transition-all cursor-pointer group"
      aria-label={`View active trove ${trove.id.substring(0, 8)}... with ${formatApproximate(trove.debt.current)} BOLD debt`}
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold tracking-wider px-2 py-0.5 text-white bg-green-500 dark:bg-green-950 dark:text-green-500/70 rounded-xs text-xs">
            ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
            <Icon name="arrow-left-right" size={12} />
            <span className="ml-1">{trove.activity.transactionCount - trove.activity.redemptionCount}</span>
          </span>
          {trove.activity.redemptionCount > 0 && (
            <span className="inline-flex items-center text-orange-400">
              <Icon name="triangle" size={12} />
              <span className="ml-1">{trove.activity.redemptionCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content section - single responsive grid */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main metrics grid - responsive columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:items-start">
          {/* Debt - spans 2 columns on mobile */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Debt</p>
            <div className="flex items-center">
              <h3 className="text-xl lg:text-3xl font-bold text-slate-600 dark:text-slate-200">
                {formatApproximate(trove.debt.current)}
              </h3>
              <span className="ml-2 font-bold text-green-500">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Backed by - full width on mobile */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Backed by</p>
            <div className="flex items-center">
              <span className="flex items-center">
                <p className="text-lg md:text-xl font-bold mr-1 text-slate-600 dark:text-slate-200">
                  {trove.collateral.amount}
                </p>
                <TokenIcon assetSymbol={trove.collateralType} />
              </span>
              {collateralUsd && (
                <div className="ml-1 flex items-center">
                  <span className="text-xs flex items-center font-bold text-green-500 border-l-2 border-r-2 border-green-500 rounded-sm px-1 py-0">
                    {formatUsdValue(collateralUsd)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Collateral Ratio */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-xs text-slate-400 dark:text-slate-600 mb-1 font-bold">Collateral Ratio</p>
            {collateralRatio !== null ? (
              <div className="text-lg md:text-xl font-bold text-slate-600 dark:text-slate-200">
                {collateralRatio.toFixed(1)}%
              </div>
            ) : (
              <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            )}
          </div>

          {/* Interest Rate */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-1 mb-1">
              {trove.batch.isMember && (
                <span className="inline-flex items-center text-xs font-semibold px-1 py-0.5 bg-pink-300 text-white dark:bg-pink-900/50 dark:text-pink-400 rounded-xs">
                  <Users className="w-3 h-3" aria-hidden="true" />
                </span>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-600 font-bold">Interest Rate</p>
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-600 dark:text-slate-200">
              {trove.metrics.interestRate}%
            </div>
            {trove.batch.isMember && trove.batch.manager && (
              <div className="text-xs font-medium text-pink-500 dark:text-pink-400 mt-1 truncate">
                {formatBatchManagerDisplay(trove.batch.manager)}
              </div>
            )}
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
            <span className="text-sm text-slate-50 dark:text-slate-500 group-hover:text-white font-bold flex items-center gap-1">
              <Icon name="timeline" size={20} aria-hidden="true" />
              View
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
