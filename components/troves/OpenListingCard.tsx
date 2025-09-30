import { useMemo } from "react";
import Link from "next/link";
import { generateInterestInfo } from "@/lib/utils/interest-calculator";
import { TroveSummary } from "@/types/api/trove";
import { Icon } from "../icons/icon";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { TokenIcon } from "../icons/tokenIcon";
import { ChevronRight, Users } from "lucide-react";
import { CardFooter } from "../trove/components/CardFooter";
import { formatDuration } from "@/lib/date";

export function OpenListingCard({ trove }: { trove: TroveSummary }) {
  // Save scroll position when navigating to trove detail
  const handleClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  // Calculate interest breakdown using real lastActivityAt timestamp
  const interestInfo = useMemo(() => {
    // Use actual lastActivityAt as the last debt update timestamp
    const lastUpdate = trove.activity.lastActivityAt;
    // Use pre-calculated debt value from backend (already converted from wei)
    const recordedDebt = trove.debt.current;
    const interestRate = trove.metrics.interestRate;

    return generateInterestInfo(
      recordedDebt,
      interestRate,
      lastUpdate,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined,
    );
  }, [trove]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo.entireDebt;

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-500 bg-slate-900 hover:shadow-lg transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold px-2 py-0.5 bg-green-900 text-green-400 rounded-xs">ACTIVE</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
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

      {/* Content section - single responsive grid */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main metrics grid - responsive columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:items-end">
          {/* Debt - spans 2 columns on mobile */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-xs text-slate-600 mb-1 font-bold">Debt</p>
            <div className="flex items-center">
              <h3 className="text-2xl md:text-3xl font-bold  text-slate-200">{formatPrice(debtWithInterest)}</h3>
              <span className="ml-2 text-green-400">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Backed by */}
          <div className="md:col-span-1">
            <p className="text-xs text-slate-600 mb-1 font-bold">Backed by</p>
            <div className="flex items-center">
              <span className="flex items-center">
                <p className="text-lg md:text-xl font-bold mr-1 text-slate-200">{trove.collateral.amount}</p>
                <TokenIcon assetSymbol={trove.collateralType} />
              </span>
              <div className="ml-1 flex items-center">
                <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                  {formatUsdValue(trove.collateral.valueUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Collateral Ratio */}
          <div className="md:col-span-1">
            <p className="text-xs text-slate-600 mb-1 font-bold">
              <span className="lg:hidden">Ratio</span>
              <span className="hidden lg:inline">Collateral Ratio</span>
            </p>
            <p className="text-lg md:text-xl font-semibold  text-slate-200">
              {trove.metrics.collateralRatio.toFixed(1)}%
            </p>
          </div>

          {/* Interest Rate */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-1 mb-1">
              {trove.batch.isMember && (
                <span className="inline-flex items-center text-xs font-semibold px-1 py-0.5 bg-pink-900/50 md:bg-fuchsia-900 text-pink-400 md:text-fuchsia-400 rounded-xs">
                  <Users className="w-3 h-3" aria-hidden="true" />
                </span>
              )}
              <p className="text-xs text-slate-600 font-bold">Interest Rate</p>
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-200">{trove.metrics.interestRate}%</div>
          </div>
        </div>

        {/* Footer with view button */}
        <div className="flex items-center justify-between">
          <CardFooter
            trove={trove}
            dateText={`${formatDuration(trove.activity.lastActivityAt, new Date())} ago`}
            showDetailedInfo={false}
          />
          <div className="flex items-center bg-slate-800 group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
            <span
              className="text-sm text-slate-500 group-hover:text-white font-medium flex items-center gap-1"
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
