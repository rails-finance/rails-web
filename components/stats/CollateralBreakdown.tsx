"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CollateralStats } from "@/types/api/stats";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";

interface CollateralBreakdownProps {
  data: { [key: string]: CollateralStats };
  loading?: boolean;
  mode?: "overview"; // Keep for backwards compatibility, but only support overview
}

export function CollateralBreakdown({ data, loading, mode = "overview" }: CollateralBreakdownProps) {
  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
  };

  // Loading state
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-lg p-6 animate-pulse">
            <div className="h-14 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-[3ch]" />
              <div className="h-7 bg-slate-100 dark:bg-slate-800 rounded w-1/4 mb-5" />
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/6" />
              <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-1/4 mb-6" />

              <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-full w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const collateralOrder = ["WETH", "wstETH", "rETH"];

  const sortedData = Object.entries(data).sort(([keyA], [keyB]) => {
    const indexA = collateralOrder.indexOf(keyA);
    const indexB = collateralOrder.indexOf(keyB);

    // If both are in the order array, sort by their position
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only keyA is in the order array, it comes first
    if (indexA !== -1) return -1;
    // If only keyB is in the order array, it comes first
    if (indexB !== -1) return 1;
    // If neither is in the order array, maintain original order
    return 0;
  });

  return (
    <div className="grid grid-cols-1 gap-4">
      {sortedData.map(([collateralType, stats]) => {
        const troveButton = (
          <span
            className="text-sm text-white group-hover:text-white font-medium dark:bg-slate-700 inline-flex items-center gap-1 rounded-full transition-all w-fit py-1 group-hover:bg-blue-500 bg-slate-300 pl-3 pr-2"
            aria-label="View Troves"
          >
            <Icon name="view-troves" className="w-[19px] h-[18px]" />
            <span>{stats.openTroveCount.toLocaleString()} Troves</span>
            <ChevronRight className="w-4 h-4" />
          </span>
        );

        return (
          <Link
            key={collateralType}
            href={`/troves?collateralType=${collateralType}`}
            className="group bg-white dark:bg-slate-900 dark:hover:bg-slate-900/50 rounded-lg p-4 hover:bg-white-50/50 hover:shadow-lg transition-all cursor-pointer"
          >
            <div className="space-y-4 md:space-y-0">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6 md:flex-1">
                  <div className="flex items-center gap-3">
                    <TokenIcon assetSymbol={collateralType.toLowerCase()} className="w-12 h-12 flex-shrink-0" />
                    <div>
                      <div className="mb-1">
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-600">Total Collateral</span>
                      </div>
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-300">
                        {formatNumber(stats.totalCollateral)} {collateralType}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <TokenIcon assetSymbol="bold" className="w-12 h-12 flex-shrink-0" />
                    <div>
                      <div className="mb-1">
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-600">Total Debt</span>
                      </div>
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-300">
                        ${formatNumber(stats.totalDebt)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex">{troveButton}</div>
              </div>
              <div className="md:hidden">{troveButton}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
