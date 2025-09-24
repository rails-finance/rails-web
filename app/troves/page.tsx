"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SimplifiedTroveCard } from "@/components/trove/SimplifiedTroveCard";
import { TroveFilterParams } from "@/components/trove/TroveFilters";
import { UnifiedFiltersDropdown, UnifiedFilters, FilterState } from "@/components/filters/UnifiedFilters";
import { TroveSummary } from "@/types/api/trove";
import { CollateralBreakdown } from "@/components/stats/CollateralBreakdown";
import { CollateralStats } from "@/types/api/stats";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X, Check } from "lucide-react";
import batchManagerService from '@/lib/services/batch-manager-service';

export default function TrovesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // State management
  const [troves, setTroves] = useState<TroveSummary[]>([]);
  const [isRestoringScroll, setIsRestoringScroll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('q') || '');  // Local state for input

  // Pagination state - stored in URL for persistence
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const itemsPerPage = 10;

  // Filter and sort state - initialize from URL
  const [filters, setFilters] = useState<TroveFilterParams>(() => {
    const status = searchParams.get('status') || 'both';
    // Support both old collateralType and new collateralTypes for backwards compatibility
    const collateralTypesParam = searchParams.getAll('collateral').filter(Boolean);
    const collateralTypeParam = searchParams.get('collateralType');

    let collateralTypes: string[];
    if (collateralTypesParam?.length) {
      // Check for special 'none' value
      if (collateralTypesParam.length === 1 && collateralTypesParam[0] === 'none') {
        collateralTypes = []; // No collaterals selected
      } else {
        collateralTypes = collateralTypesParam; // Use explicit selections
      }
    } else if (collateralTypeParam) {
      collateralTypes = [collateralTypeParam]; // Old single param support
    } else {
      // No params - default to all selected (for backward compatibility)
      collateralTypes = ['WETH', 'wstETH', 'rETH'];
    }

    const redemptionFilter = searchParams.get('redemptionFilter') as 'only' | 'hide' | 'all' | undefined;
    const batchFilter = searchParams.get('batchFilter') as 'only' | 'hide' | 'all' | undefined;
    const zombieFilter = searchParams.get('zombieFilter') as 'only' | 'hide' | 'all' | undefined;
    const searchQuery = searchParams.get('q') || undefined;

    return {
      status: status as 'open' | 'closed' | 'both',
      collateralTypes,
      redemptionFilter,
      batchFilter,
      zombieFilter,
      searchQuery,
    };
  });

  const [sortBy, setSortBy] = useState<string>(searchParams.get('sortBy') || 'activity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Collateral stats
  const [collateralStats, setCollateralStats] = useState<CollateralStats | null>(null);
  const [totalTVL, setTotalTVL] = useState<number>(0);

  const availableCollateralTypes = ['WETH', 'wstETH', 'rETH'];

  // Save scroll position before navigating away
  const saveScrollPosition = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('troves-scroll-position', String(window.scrollY));
    }
  }, []);

  // Update URL without causing page refresh, preserving scroll position
  const updateUrl = useCallback((updates: Record<string, string | number | string[] | undefined>, options?: { scroll?: boolean }) => {
    const params = new URLSearchParams(window.location.search);

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'collateral' && Array.isArray(value)) {
        // Handle collateral array specially - use multiple params with same name
        params.delete('collateral');
        value.forEach(v => params.append('collateral', v));
      } else if (value !== undefined && value !== '') {
        params.set(key, String(value));
      } else {
        params.delete(key);
      }
    });

    // Remove defaults to keep URL clean
    if (params.get('page') === '1') params.delete('page');
    if (params.get('sortBy') === 'activity') params.delete('sortBy');
    if (params.get('sortOrder') === 'desc') params.delete('sortOrder');
    if (params.get('status') === 'both') params.delete('status');
    // Remove old parameters if present
    params.delete('collateralType');
    params.delete('collateralTypes');

    const newUrl = params.toString() ? `/troves?${params.toString()}` : '/troves';

    // Use router.replace with scroll option (default to false to preserve position)
    router.replace(newUrl, { scroll: options?.scroll ?? false });
  }, [router]);

  // Handle page changes - scroll to top when changing pages
  const goToPage = useCallback((page: number) => {
    updateUrl({ page: page > 1 ? String(page) : undefined }, { scroll: true });
  }, [updateUrl]);

  // Convert filters for unified component
  const convertToUnifiedFilters = (params: TroveFilterParams): UnifiedFilters => {
    return {
      status: params.status as 'open' | 'closed' | 'both' || 'both',
      collateralTypes: params.collateralTypes,
      redemptionFilter: params.redemptionFilter as FilterState || undefined,
      batchFilter: params.batchFilter as FilterState || undefined,
      zombieFilter: params.zombieFilter as FilterState || undefined,
      searchQuery: params.searchQuery
    };
  };

  const convertFromUnifiedFilters = (unified: UnifiedFilters): TroveFilterParams => {
    return {
      status: unified.status || 'both',
      collateralTypes: unified.collateralTypes,
      redemptionFilter: unified.redemptionFilter as 'only' | 'hide' | 'all' | undefined,
      batchFilter: unified.batchFilter as 'only' | 'hide' | 'all' | undefined,
      zombieFilter: unified.zombieFilter as 'only' | 'hide' | 'all' | undefined,
      searchQuery: unified.searchQuery
    };
  };

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: TroveFilterParams) => {
    setFilters(newFilters);

    // Always include collateral params for consistency
    let collateralParam: string[] | string | undefined;
    if (!newFilters.collateralTypes || newFilters.collateralTypes.length === 0) {
      // No collaterals selected - use special 'none' value
      collateralParam = ['none'];
    } else if (newFilters.collateralTypes.length === availableCollateralTypes.length) {
      // All collaterals selected - explicitly list them
      collateralParam = newFilters.collateralTypes;
    } else {
      // Some collaterals selected
      collateralParam = newFilters.collateralTypes;
    }

    updateUrl({
      page: undefined, // Reset to page 1
      collateral: collateralParam,
      collateralTypes: undefined, // Remove old parameter if it exists
      status: newFilters.status !== 'both' ? newFilters.status : undefined,
      redemptionFilter: newFilters.redemptionFilter !== 'all' ? newFilters.redemptionFilter : undefined,
      batchFilter: newFilters.batchFilter !== 'all' ? newFilters.batchFilter : undefined,
      zombieFilter: newFilters.zombieFilter !== 'all' ? newFilters.zombieFilter : undefined,
      q: newFilters.searchQuery,
    });
  }, [updateUrl, availableCollateralTypes]);

  // Handle sort changes
  const handleSortChange = useCallback((newSortBy: string, newSortOrder?: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    if (newSortOrder) setSortOrder(newSortOrder);
    updateUrl({
      sortBy: newSortBy !== 'activity' ? newSortBy : undefined,
      sortOrder: newSortOrder && newSortOrder !== 'desc' ? newSortOrder : undefined,
    });
  }, [updateUrl]);

  // Load troves for current page
  const loadTroves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // For complex filters or search filters, fetch all and paginate client-side
      const needsClientSidePagination =
        filters.status === 'both' ||
        filters.redemptionFilter ||
        filters.batchFilter ||
        filters.zombieFilter ||
        filters.searchQuery;

      if (needsClientSidePagination) {
        // Fetch all troves and handle pagination client-side
        let allTroves: TroveSummary[] = [];

        // Build API parameters
        const buildApiUrl = (status: string, collateralType?: string) => {
          const params = new URLSearchParams();
          params.set('status', status);
          params.set('limit', '500');
          params.set('offset', '0');
          if (collateralType) params.set('collateralType', collateralType);
          return `/api/troves?${params.toString()}`;
        };

        // Regular filter-based fetch
        if (filters.status === 'both' || !filters.status) {
            // Only fetch if collateral types are selected
            if (filters.collateralTypes && filters.collateralTypes.length > 0) {
              for (const collType of filters.collateralTypes) {
                const [openRes, closedRes, liquidatedRes] = await Promise.all([
                  fetch(buildApiUrl('open', collType)),
                  fetch(buildApiUrl('closed', collType)),
                  fetch(buildApiUrl('liquidated', collType))
                ]);

                const [openData, closedData, liquidatedData] = await Promise.all([
                  openRes.json(),
                  closedRes.json(),
                  liquidatedRes.json()
                ]);

                allTroves.push(...(openData.data || []), ...(closedData.data || []), ...(liquidatedData.data || []));
              }
            } else {
              // No collateral types selected = no results
              allTroves = [];
            }
          } else {
            // Fetch specific status
            if (filters.collateralTypes && filters.collateralTypes.length > 0) {
              for (const collType of filters.collateralTypes) {
                const response = await fetch(buildApiUrl(filters.status, collType));
                const data = await response.json();
                allTroves.push(...(data.data || []));
              }
            } else {
              // No collateral types selected = no results
              allTroves = [];
            }
        }

        // Apply client-side filters
        let filtered = [...allTroves];

        if (filters.redemptionFilter === 'only') {
          filtered = filtered.filter(t => t.activity?.redemptionCount && t.activity.redemptionCount > 0);
        } else if (filters.redemptionFilter === 'hide') {
          filtered = filtered.filter(t => !t.activity?.redemptionCount || t.activity.redemptionCount === 0);
        }

        if (filters.batchFilter === 'only') {
          filtered = filtered.filter(t => t.batch?.isMember === true);
        } else if (filters.batchFilter === 'hide') {
          filtered = filtered.filter(t => t.batch?.isMember !== true);
        }

        if (filters.zombieFilter === 'only') {
          filtered = filtered.filter(t => t.isZombieTrove === true);
        } else if (filters.zombieFilter === 'hide') {
          filtered = filtered.filter(t => t.isZombieTrove !== true);
        }

        // Apply search filter if query exists
        if (filters.searchQuery) {
          const query = filters.searchQuery.toLowerCase();
          filtered = filtered.filter(trove => {
            // Check trove ID
            if (trove.id && trove.id.toLowerCase().includes(query)) return true;

            // Check owner address (for open troves)
            if (trove.owner && trove.owner.toLowerCase().includes(query)) return true;

            // Check last owner address (for closed troves)
            if (trove.lastOwner && trove.lastOwner.toLowerCase().includes(query)) return true;

            // Check ENS name if available
            if (trove.ownerEns && trove.ownerEns.toLowerCase().includes(query)) return true;

            // Check batch manager address (delegate search)
            if (trove.batch?.manager && trove.batch.manager.toLowerCase().includes(query)) return true;

            return false;
          });
        }

        // Sort
        filtered.sort((a, b) => {
          let aVal, bVal;
          switch (sortBy) {
            case 'debt':
              aVal = parseFloat(a.debt?.current || a.debt?.peak || '0');
              bVal = parseFloat(b.debt?.current || b.debt?.peak || '0');
              break;
            case 'collateral':
              aVal = parseFloat(a.collateral?.amount || '0');
              bVal = parseFloat(b.collateral?.amount || '0');
              break;
            case 'ratio':
              aVal = a.metrics?.collateralRatio || 0;
              bVal = b.metrics?.collateralRatio || 0;
              break;
            case 'interestRate':
              aVal = a.metrics?.interestRate || 0;
              bVal = b.metrics?.interestRate || 0;
              break;
            case 'activity':
            default:
              aVal = new Date(a.activity?.lastActivityAt || a.activity?.createdAt || 0).getTime();
              bVal = new Date(b.activity?.lastActivityAt || b.activity?.createdAt || 0).getTime();
              break;
          }
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // Paginate
        setTotalCount(filtered.length);
        const startIdx = (currentPage - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        setTroves(filtered.slice(startIdx, endIdx));
      } else {
        // Simple server-side pagination
        const allTroves: TroveSummary[] = [];
        const offset = (currentPage - 1) * itemsPerPage;

        // If collateral types are specified, fetch for each type
        if (filters.collateralTypes && filters.collateralTypes.length > 0) {
          for (const collType of filters.collateralTypes) {
            const params = new URLSearchParams();
            params.set('status', filters.status || 'open');
            params.set('collateralType', collType);
            params.set('limit', '500');
            params.set('offset', '0');

            const response = await fetch(`/api/troves?${params.toString()}`);
            const data = await response.json();
            allTroves.push(...(data.data || []));
          }

          // Sort and paginate
          allTroves.sort((a, b) => {
            let aVal, bVal;
            switch (sortBy) {
              case 'debt':
                aVal = parseFloat(a.debt?.current || a.debt?.peak || '0');
                bVal = parseFloat(b.debt?.current || b.debt?.peak || '0');
                break;
              case 'collateral':
                aVal = parseFloat(a.collateral?.amount || '0');
                bVal = parseFloat(b.collateral?.amount || '0');
                break;
              case 'ratio':
                aVal = a.metrics?.collateralRatio || 0;
                bVal = b.metrics?.collateralRatio || 0;
                break;
              case 'interestRate':
                aVal = a.metrics?.interestRate || 0;
                bVal = b.metrics?.interestRate || 0;
                break;
              case 'activity':
              default:
                aVal = new Date(a.activity?.lastActivityAt || a.activity?.createdAt || 0).getTime();
                bVal = new Date(b.activity?.lastActivityAt || b.activity?.createdAt || 0).getTime();
                break;
            }
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          });

          setTotalCount(allTroves.length);
          setTroves(allTroves.slice(offset, offset + itemsPerPage));
        } else {
          const params = new URLSearchParams();
          params.set('status', filters.status || 'open');
          params.set('limit', String(itemsPerPage));
          params.set('offset', String(offset));

          const response = await fetch(`/api/troves?${params.toString()}`);
          const data = await response.json();

          setTroves(data.data || []);
          setTotalCount(data.totalCount || 0);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load troves');
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, sortBy, sortOrder]);

  // Load collateral stats
  const loadCollateralStats = async (collateralType: string) => {
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to load stats');

      const data = await response.json();
      if (data.success && data.data) {
        const { overall, byCollateral } = data.data;

        // Find stats for selected collateral
        const selectedStats = byCollateral[collateralType];
        if (selectedStats) {
          setCollateralStats(selectedStats);

          // Calculate total TVL from all collaterals
          const total = Object.values(byCollateral).reduce((sum: number, stats: any) => {
            return sum + (stats.totalCollateralUSD || 0);
          }, 0);
          setTotalTVL(total);
        }
      }
    } catch (err) {
      console.error('Failed to load collateral stats:', err);
    }
  };

  // Load troves when dependencies change
  useEffect(() => {
    loadTroves();
  }, [loadTroves]);

  // Restore scroll position after troves are loaded
  useEffect(() => {
    if (!loading && troves.length > 0 && !isRestoringScroll) {
      const savedPosition = sessionStorage.getItem('troves-scroll-position');
      if (savedPosition) {
        setIsRestoringScroll(true);
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedPosition, 10));
          sessionStorage.removeItem('troves-scroll-position');
          setIsRestoringScroll(false);
        });
      }
    }
  }, [loading, troves.length, isRestoringScroll]);

  // Load stats when collateral types change
  useEffect(() => {
    if (filters.collateralTypes && filters.collateralTypes.length === 1) {
      loadCollateralStats(filters.collateralTypes[0]);
    } else {
      setCollateralStats(null);
    }
  }, [filters.collateralTypes]);

  // Close sort dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync search input with filters when filters change from URL
  useEffect(() => {
    setSearchInput(filters.searchQuery || '');
  }, [filters.searchQuery]);

  // Sort options
  const sortOptions = [
    { value: 'debt', label: 'Debt' },
    { value: 'collateral', label: 'Collateral' },
    { value: 'ratio', label: 'Collateral Ratio' },
    { value: 'interestRate', label: 'Interest Rate' },
    { value: 'activity', label: 'Recent Activity' }
  ];

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const showingFrom = (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalCount);

  // Pagination controls
  const PaginationControls = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pageNumbers.push(i);
    }

    return (
      <div className="flex items-center justify-between mt-8 px-4">
        <div className="text-sm text-slate-400">
          Showing {showingFrom}-{showingTo} of {totalCount} troves
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {start > 1 && (
            <>
              <button
                onClick={() => goToPage(1)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                1
              </button>
              {start > 2 && <span className="text-slate-400">...</span>}
            </>
          )}

          {pageNumbers.map(num => (
            <button
              key={num}
              onClick={() => goToPage(num)}
              className={`px-3 py-2 rounded-lg transition-colors ${
                num === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {num}
            </button>
          ))}

          {end < totalPages && (
            <>
              {end < totalPages - 1 && <span className="text-slate-400">...</span>}
              <button
                onClick={() => goToPage(totalPages)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  if (loading && troves.length === 0) {
    return (
      <main className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-8"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-800 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  // Handle search form submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedValue = searchInput.trim();
    handleFiltersChange({ ...filters, searchQuery: trimmedValue || undefined });
  };

  // Handle clear search
  const handleClearSearch = () => {
    setSearchInput('');
    handleFiltersChange({ ...filters, searchQuery: undefined });
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with Collateral Checkboxes */}
        <div className="mb-8">
          <div className="flex items-center gap-6">
            {availableCollateralTypes.map(type => {
              const isSelected = filters.collateralTypes?.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => {
                    const current = filters.collateralTypes || [];
                    const newTypes = current.includes(type)
                      ? current.filter(t => t !== type)
                      : [...current, type];
                    handleFiltersChange({
                      ...filters,
                      collateralTypes: newTypes
                    });
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-slate-800 border-2 border-blue-500'
                      : 'bg-slate-900 border-2 border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-slate-500'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <svg className="w-6 h-6">
                      <use href={`#icon-${type.toLowerCase().replace('weth', 'eth')}`} />
                    </svg>
                    <span className="text-sm text-slate-400">/</span>
                    <svg className="w-6 h-6">
                      <use href="#icon-bold" />
                    </svg>
                    <span className="text-white font-semibold ml-1">{type}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        {filters.collateralTypes?.length === 1 && collateralStats && (
          <CollateralBreakdown
            stats={collateralStats}
            totalTVL={totalTVL}
            selectedCollateral={filters.collateralTypes[0]}
          />
        )}

        {/* Filters and Sort */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <UnifiedFiltersDropdown
              filters={convertToUnifiedFilters(filters)}
              onFiltersChange={(unified) => handleFiltersChange(convertFromUnifiedFilters(unified))}
              availableCollateralTypes={availableCollateralTypes}
              showCollateralFilter={false}
            />

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Filter by address, ENS, ID, or delegate..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full px-4 py-2 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                  title="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              )}
            </form>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={sortDropdownRef}>
              <button
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors min-w-[160px]"
              >
                <span>{sortOptions.find(o => o.value === sortBy)?.label || 'Sort'}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 ml-auto transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px] overflow-hidden">
                  {sortOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        handleSortChange(option.value);
                        setIsSortDropdownOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-3 text-white hover:bg-slate-700 transition-colors ${
                        sortBy === option.value ? 'bg-slate-700' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => handleSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')}
              className="flex items-center justify-center w-10 h-10 bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors text-white"
              title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Troves */}
        {troves.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {troves.map((trove) => (
              <SimplifiedTroveCard
                key={trove.id}
                trove={trove}
                showViewButton
                hideLabels={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-slate-400 text-lg">
              {(!filters.collateralTypes || filters.collateralTypes.length === 0) ? (
                <>
                  <p className="mb-2">No collateral types selected</p>
                  <p className="text-sm">Please select at least one collateral type from the filter dropdown</p>
                </>
              ) : filters.searchQuery ? (
                <>
                  <p className="mb-2">No troves found for "{filters.searchQuery}"</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </>
              ) : (
                <>
                  <p className="mb-2">No troves found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls />
      </div>
    </main>
  );
}