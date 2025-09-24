"use client";

import { useState, useRef, useEffect, Fragment } from "react";
import Link from "next/link";
import { Info, ChevronRight, ChevronDown, ChevronUp, X, Search } from "lucide-react";
import { CollateralStats } from "@/types/api/stats";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// Mode types for different display contexts
type DisplayMode = 'overview' | 'individual' | 'detailed-table';

interface CollateralBreakdownProps {
  // For overview mode (multiple collaterals)
  data?: { [key: string]: CollateralStats };
  // For individual mode (single collateral)
  collateralType?: string;
  stats?: CollateralStats;
  totalTVL?: number;
  // Display mode
  mode?: DisplayMode;
  loading?: boolean;
  // Additional customization
  showSearch?: boolean;
  showExpandedDetails?: boolean;
}

export function CollateralBreakdown({
  data,
  collateralType,
  stats,
  totalTVL = 0,
  mode = 'overview',
  loading,
  showSearch = false,
  showExpandedDetails = false
}: CollateralBreakdownProps) {
  // Individual mode state
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const collateralTypes = [
    { symbol: 'WETH', label: 'ETH/BOLD' },
    { symbol: 'wstETH', label: 'wstETH/BOLD' },
    { symbol: 'rETH', label: 'rETH/BOLD' }
  ];

  const currentOption = collateralTypes.find(c => c.symbol === collateralType) || collateralTypes[0];

  // Initialize search value from URL params (individual mode)
  useEffect(() => {
    if (mode === 'individual' && showSearch) {
      const troveId = searchParams.get('troveId');
      const ownerAddress = searchParams.get('ownerAddress');
      setSearchValue(troveId || ownerAddress || "");
    }
  }, [searchParams, mode, showSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (mode === 'individual') {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsDropdownOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mode]);

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
    return num.toFixed(decimals);
  };

  const calculateCollateralRatio = (collateralUsd: number, debt: number) => {
    return debt > 0 ? (collateralUsd / debt) * 100 : 0;
  };

  const toggleExpanded = (collateralType: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(collateralType)) {
      newExpanded.delete(collateralType);
    } else {
      newExpanded.add(collateralType);
    }
    setExpandedRows(newExpanded);
  };

  const handleSearch = (value: string) => {
    // If we have a search value, redirect to the troves page with search query
    if (value.trim()) {
      router.push(`/troves?q=${encodeURIComponent(value.trim())}`);
    } else {
      // If clearing search, just remove the filter params on the current page
      const params = new URLSearchParams(searchParams.toString());
      params.delete('troveId');
      params.delete('ownerAddress');

      const newUrl = pathname !== '/troves'
        ? `/troves?${params.toString()}`
        : `${pathname}?${params.toString()}`;

      // Safari fix: Use replace instead of push for same-page navigation
      if (pathname === '/troves') {
        router.replace(newUrl);
        setTimeout(() => {
          window.dispatchEvent(new Event('popstate'));
        }, 0);
      } else {
        router.push(newUrl);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchValue);
  };

  const handleClearSearch = () => {
    setSearchValue("");
    handleSearch("");
  };

  // Loading state
  if (loading) {
    if (mode === 'overview') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg p-6 animate-pulse">
              <div className="h-12 bg-slate-200 rounded mb-4" />
              <div className="space-y-2">
                <div className="h-6 bg-slate-100 rounded w-3/4" />
                <div className="h-4 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    } else {
      return (
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="space-y-4">
            <div className="h-6 bg-slate-700 rounded animate-pulse w-48" />
            <div className="grid grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div className="h-4 bg-slate-700 rounded animate-pulse w-20 mb-2" />
                  <div className="h-8 bg-slate-700 rounded animate-pulse w-32" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  }

  // Overview mode - Grid of collateral cards
  if (mode === 'overview' && data) {
    const sortedData = Object.entries(data).sort(([, a], [, b]) => {
      return b.totalCollateralUsd - a.totalCollateralUsd;
    });

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedData.map(([collateralType, stats]) => (
          <Link
            key={collateralType}
            href={`/troves?collateral=${collateralType}`}
            className="group bg-white rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center">
              <TokenIcon assetSymbol={collateralType.toLowerCase()} className="w-12 h-12" />
              <TokenIcon assetSymbol="bold" className="w-12 h-12 -ml-1.5" />
              </div>
              <div>
                <div className="text-slate-600 font-semibold text-xl">{collateralType}</div>
                <div className="text-sm text-slate-500">
                  {formatNumber(stats.totalCollateral)} {collateralType}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">TVL</div>
                <div className="text-2xl font-semibold text-slate-600">
                  ${formatNumber(stats.totalCollateralUsd)}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-slate-500">Total Debt</div>
                  <div className="text-lg font-medium text-slate-700">
                    ${formatNumber(stats.totalDebt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Active Troves</div>
                  <div className="text-lg font-medium text-slate-700">
                    {stats.openTroveCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <span className="text-sm text-white group-hover:text-white font-medium inline-flex items-center gap-1 rounded-full transition-all w-fit py-1 group-hover:bg-blue-500 bg-slate-300 pl-3 pr-2" aria-label="View Troves">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19 18" width="19" height="18">
                  <rect x="0" y="2"  width="5" height="3" style={{ strokeWidth: '1px', stroke: 'none', fill: 'currentColor' }} rx="2"/>
                  <rect x="6" y="2"  width="6" height="3" style={{ strokeWidth: '1px', stroke: 'none', fill: 'currentColor' }} rx="2"/>
                  <rect x="13" y="2"  width="5" height="3" style={{ strokeWidth: '1px', stroke: 'none', fill: 'currentColor' }} rx="2"/>
                  <rect x="0" y="7"  width="18"  height="3" style={{ strokeWidth: '1px', stroke: 'none', fill: 'currentColor' }} rx="2"/>
                  <rect x="0" y="12" width="18" height="3" style={{ strokeWidth: '1px', stroke: 'none', fill: 'currentColor' }} rx="2"/>
                </svg>
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // Individual mode - Single collateral with optional search
  if (mode === 'individual' && stats && collateralType) {
    const tvlShare = totalTVL > 0 ? (stats.totalCollateralUsd / totalTVL) * 100 : 0;
    const collateralRatio = calculateCollateralRatio(stats.totalCollateralUsd, stats.totalDebt);
    const avgDebt = stats.openTroveCount > 0 ? stats.totalDebt / stats.openTroveCount : 0;
    const avgCollateral = stats.openTroveCount > 0 ? stats.totalCollateral / stats.openTroveCount : 0;
    const activeRate = stats.troveCount > 0 ? (stats.openTroveCount / stats.troveCount) * 100 : 0;

    return (
      <div className="bg-slate-800 rounded-lg overflow-hidden mb-6">
        <div className="">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center">
              <TokenIcon assetSymbol={collateralType.toLowerCase()} className="w-12 h-12" />
              <TokenIcon assetSymbol="bold" className="w-12 h-12 -ml-1.5" />
              </div>
              <div>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 text-2xl font-semibold text-white hover:text-blue-200 transition-colors"
                  >
                    {currentOption.label}
                    <ChevronDown className={`w-5 h-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px]">
                      {collateralTypes.map((collateral) => (
                        <button
                          key={collateral.symbol}
                          onClick={() => {
                            setIsDropdownOpen(false);
                            const url = `/troves?collateral=${collateral.symbol}`;
                            router.replace(url);
                            setTimeout(() => {
                              window.dispatchEvent(new Event('popstate'));
                            }, 0);
                          }}
                          className={`block w-full text-left px-4 py-2 text-white hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                            collateral.symbol === collateralType ? 'bg-slate-700' : ''
                          }`}
                        >
                          {collateral.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Search Box */}
            {showSearch && (
              <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleClearSearch();
                      }
                    }}
                    placeholder="Search: address, ENS, Trove ID, or delegate name..."
                    className="w-full pl-10 pr-10 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">TVL</div>
              <div className="text-2xl font-bold text-white">
                ${formatNumber(stats.totalCollateralUsd)}
              </div>
                <div className="text-sm text-slate-400">
                  {formatNumber(stats.totalCollateral)} {collateralType}
                </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Total Debt</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">
                  ${formatNumber(stats.totalDebt)}
                </span>
                <TokenIcon assetSymbol="bold" className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Active Troves</div>
              <div className="text-2xl font-bold text-white">
                {stats.openTroveCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detailed table mode (original CollateralBreakdown)
  if (mode === 'detailed-table' && data) {
    const sortedData = Object.entries(data).sort(([, a], [, b]) => {
      return b.totalCollateralUsd - a.totalCollateralUsd;
    });

    const totalStats = sortedData.reduce((acc, [, stats]) => ({
      totalTVL: acc.totalTVL + stats.totalCollateralUsd,
      totalDebt: acc.totalDebt + stats.totalDebt,
      totalTroves: acc.totalTroves + stats.openTroveCount
    }), { totalTVL: 0, totalDebt: 0, totalTroves: 0 });

    return (
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-750">
          <h3 className="text-lg font-semibold text-white">Collateral Breakdown</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-750 border-b border-slate-700">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Collateral Type
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  TVL
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Share
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Total Debt
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  CR
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Active Troves
                </th>
                <th className="text-center px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <Info className="w-4 h-4 inline" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(([collateralType, stats]) => {
                const isExpanded = expandedRows.has(collateralType);
                const tvlShare = totalStats.totalTVL > 0
                  ? (stats.totalCollateralUsd / totalStats.totalTVL) * 100
                  : 0;
                const collateralRatio = calculateCollateralRatio(stats.totalCollateralUsd, stats.totalDebt);
                const avgDebt = stats.openTroveCount > 0 ? stats.totalDebt / stats.openTroveCount : 0;
                const avgCollateral = stats.openTroveCount > 0 ? stats.totalCollateral / stats.openTroveCount : 0;
                const activeRate = stats.troveCount > 0 ? (stats.openTroveCount / stats.troveCount) * 100 : 0;

                return (
                  <Fragment key={collateralType}>
                    <tr className="hover:bg-slate-750 transition-colors border-b border-slate-700">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <TokenIcon assetSymbol={collateralType.toLowerCase()} className="w-8 h-8" />
                          <div>
                            <div className="text-white font-medium">{collateralType}</div>
                            <div className="text-xs text-slate-400">
                              {formatNumber(stats.totalCollateral)} {collateralType}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-white font-medium">
                          ${formatNumber(stats.totalCollateralUsd)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center px-2 py-1 bg-blue-900/50 text-blue-400 rounded text-xs font-medium">
                          {tvlShare.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-white">
                            ${formatNumber(stats.totalDebt)}
                          </span>
                          <TokenIcon assetSymbol="bold" className="w-5 h-5" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-medium ${
                          collateralRatio >= 200 ? 'text-green-400' :
                          collateralRatio >= 150 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {collateralRatio.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/troves?collateral=${collateralType}`}
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          {stats.openTroveCount.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleExpanded(collateralType)}
                          className="text-slate-400 hover:text-white transition-colors p-1"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-750/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-slate-400 mb-1">Avg Collateral</div>
                              <div className="text-white font-medium">
                                {formatNumber(avgCollateral)} {collateralType}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 mb-1">Avg Debt</div>
                              <div className="text-white font-medium">
                                ${formatNumber(avgDebt)}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 mb-1">Total Troves</div>
                              <div className="text-white font-medium">
                                {stats.troveCount.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 mb-1">Active Rate</div>
                              <div className="text-white font-medium">
                                {activeRate.toFixed(1)}%
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
            <tfoot className="bg-slate-750 border-t border-slate-700">
              <tr>
                <td className="px-6 py-3 text-sm font-semibold text-white">
                  Total
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-white">
                  ${formatNumber(totalStats.totalTVL)}
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="inline-flex items-center px-2 py-1 bg-green-900/50 text-green-400 rounded text-xs font-medium">
                    100%
                  </div>
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-white">
                  ${formatNumber(totalStats.totalDebt)}
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-white">
                  {totalStats.totalDebt > 0
                    ? `${calculateCollateralRatio(totalStats.totalTVL, totalStats.totalDebt).toFixed(1)}%`
                    : '-'
                  }
                </td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-white">
                  {totalStats.totalTroves.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return null;
}