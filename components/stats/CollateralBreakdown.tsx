"use client";

import { useState, Fragment } from "react";
import { CollateralStats } from "@/types/api/stats";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";

interface CollateralBreakdownProps {
  data: { [key: string]: CollateralStats };
  loading?: boolean;
}

export function CollateralBreakdown({ data, loading }: CollateralBreakdownProps) {
  const [sortBy, setSortBy] = useState<'tvl' | 'debt' | 'troves'>('tvl');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
  };

  const calculateCollateralRatio = (collateralUsd: number, debt: number) => {
    return debt > 0 ? (collateralUsd / debt) * 100 : 0;
  };

  // Sort data based on selected criteria
  const sortedData = Object.entries(data).sort(([, a], [, b]) => {
    switch (sortBy) {
      case 'tvl':
        return b.totalCollateralUsd - a.totalCollateralUsd;
      case 'debt':
        return b.totalDebt - a.totalDebt;
      case 'troves':
        return b.openTroveCount - a.openTroveCount;
      default:
        return 0;
    }
  });

  // Calculate totals
  const totalTVL = sortedData.reduce((sum, [, stats]) => sum + stats.totalCollateralUsd, 0);
  const totalDebt = sortedData.reduce((sum, [, stats]) => sum + stats.totalDebt, 0);
  const totalTroves = sortedData.reduce((sum, [, stats]) => sum + stats.openTroveCount, 0);

  if (loading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
        <div className="space-y-4">
          <div className="h-6 bg-slate-700 rounded animate-pulse w-48" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-slate-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Collateral Breakdown</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by:</span>
            <div className="flex gap-1">
              {(['tvl', 'debt', 'troves'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    sortBy === option
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {option === 'tvl' ? 'TVL' : option === 'debt' ? 'Debt' : 'Troves'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50">
            <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
              <th className="px-6 py-3">Collateral</th>
              <th className="px-6 py-3 text-right">TVL</th>
              <th className="px-6 py-3 text-right">Total Debt</th>
              <th className="px-6 py-3 text-right">Active Troves</th>
              <th className="px-6 py-3 text-right">Ratio</th>
              <th className="px-6 py-3 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {sortedData.map(([collateralType, stats]) => {
              const tvlShare = totalTVL > 0 ? (stats.totalCollateralUsd / totalTVL) * 100 : 0;
              const isExpanded = expandedRow === collateralType;
              const collateralRatio = calculateCollateralRatio(stats.totalCollateralUsd, stats.totalDebt);
              
              return (
                <Fragment key={collateralType}>
                  <tr
                    className="hover:bg-slate-700/20 transition-colors duration-150 cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : collateralType)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <TokenIcon assetSymbol={collateralType.toLowerCase()} className="w-8 h-8" />
                        <div>
                          <div className="text-white font-medium">{collateralType}</div>
                          <div className="text-xs text-slate-500">
                            {formatNumber(stats.totalCollateral)} {collateralType}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-white font-medium">${formatNumber(stats.totalCollateralUsd)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-white">${formatNumber(stats.totalDebt)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-white">{stats.openTroveCount.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">{stats.troveCount.toLocaleString()} total</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-medium ${
                        collateralRatio < 150 ? 'text-orange-400' :
                        collateralRatio < 200 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {collateralRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="text-white font-medium">{tvlShare.toFixed(1)}%</div>
                        <Icon 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={14} 
                          className="text-slate-500"
                        />
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr className="bg-slate-900/30">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-slate-500 mb-1">Average Debt</div>
                            <div className="text-white font-medium">
                              ${stats.openTroveCount > 0 
                                ? formatNumber(stats.totalDebt / stats.openTroveCount)
                                : '0'
                              }
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Average Collateral</div>
                            <div className="text-white font-medium">
                              {stats.openTroveCount > 0
                                ? formatNumber(stats.totalCollateral / stats.openTroveCount)
                                : '0'
                              } {collateralType}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Closed Troves</div>
                            <div className="text-white font-medium">
                              {(stats.troveCount - stats.openTroveCount).toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Active Rate</div>
                            <div className="text-white font-medium">
                              {stats.troveCount > 0
                                ? `${((stats.openTroveCount / stats.troveCount) * 100).toFixed(1)}%`
                                : '0%'
                              }
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-900/50">
            <tr className="text-sm">
              <td className="px-6 py-3 font-medium text-white">Total</td>
              <td className="px-6 py-3 text-right font-bold text-white">
                ${formatNumber(totalTVL)}
              </td>
              <td className="px-6 py-3 text-right font-bold text-white">
                ${formatNumber(totalDebt)}
              </td>
              <td className="px-6 py-3 text-right font-bold text-white">
                {totalTroves.toLocaleString()}
              </td>
              <td className="px-6 py-3 text-right font-bold text-white">
                {totalDebt > 0 ? `${((totalTVL / totalDebt) * 100).toFixed(1)}%` : '—'}
              </td>
              <td className="px-6 py-3 text-right font-bold text-white">
                100%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}