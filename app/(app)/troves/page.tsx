"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SimplifiedTroveCard } from "@/components/trove/SimplifiedTroveCard";
import { TroveFilterParams } from "@/components/trove/TroveFilters";
import { UnifiedFiltersDropdown, UnifiedFilters } from "@/components/filters/UnifiedFilters";
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
    const status = searchParams.get('status') || 'all';
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
      status: status as 'all' | 'active' | 'closed',
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
    if (params.get('status') === 'all') params.delete('status');
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
    // Map old filter values to new UI values
    const mapRedemptionForUI = (val?: string) => {
      if (val === 'only') return 'with' as const;
      if (val === 'hide') return 'without' as const;
      return 'all' as const;
    };

    const mapTypeForUI = (val?: string) => {
      if (val === 'only') return 'batch' as const;
      if (val === 'hide') return 'individual' as const;
      return 'all' as const;
    };

    const mapHealthForUI = (val?: string) => {
      if (val === 'only') return 'zombies' as const;
      if (val === 'hide') return 'healthy' as const;
      return 'all' as const;
    };

    return {
      status: params.status as 'all' | 'active' | 'closed' || 'all',
      collateralTypes: params.collateralTypes,
      redemptionFilter: mapRedemptionForUI(params.redemptionFilter),
      typeFilter: mapTypeForUI(params.batchFilter),
      healthFilter: mapHealthForUI(params.zombieFilter),
      searchQuery: params.searchQuery
    };
  };

  const convertFromUnifiedFilters = (unified: UnifiedFilters): TroveFilterParams => {
    // Map new filter values back to old values for backward compatibility
    const mapRedemptionFilter = (val?: string) => {
      if (val === 'with') return 'only' as const;
      if (val === 'without') return 'hide' as const;
      if (val === 'all') return undefined;
      return val as any;
    };

    const mapTypeFilter = (val?: string) => {
      if (val === 'batch') return 'only' as const;
      if (val === 'individual') return 'hide' as const;
      if (val === 'all') return undefined;
      return val as any;
    };

    const mapHealthFilter = (val?: string) => {
      if (val === 'zombies') return 'only' as const;
      if (val === 'healthy') return 'hide' as const;
      if (val === 'all') return undefined;
      return val as any;
    };

    return {
      status: unified.status || 'all',
      collateralTypes: unified.collateralTypes,
      redemptionFilter: mapRedemptionFilter(unified.redemptionFilter),
      batchFilter: mapTypeFilter(unified.typeFilter),
      zombieFilter: mapHealthFilter(unified.healthFilter),
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
      status: newFilters.status !== 'all' ? newFilters.status : undefined,
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
        filters.status === 'all' ||
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
        if (filters.status === 'all' || !filters.status) {
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
                const apiStatus = filters.status === 'active' ? 'open' : filters.status === 'closed' ? 'closed' : 'open';
                const response = await fetch(buildApiUrl(apiStatus, collType));
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

        if (filters.redemptionFilter === 'with') {
          filtered = filtered.filter(t => t.activity?.redemptionCount && t.activity.redemptionCount > 0);
        } else if (filters.redemptionFilter === 'without') {
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
            params.set('status', filters.status === 'active' ? 'open' : filters.status === 'closed' ? 'closed' : 'open');
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
          params.set('status', filters.status === 'active' ? 'open' : filters.status === 'closed' ? 'closed' : 'open');
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
    { value: 'ratio', label: 'Ratio' },
    { value: 'interestRate', label: 'Interest Rate' },
    { value: 'activity', label: 'Latest Activity' }
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
      <div className="flex items-center justify-between mt-8">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Showing {showingFrom}-{showingTo} of {totalCount} troves
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="cursor-pointer p-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {start > 1 && (
            <>
              <button
                onClick={() => goToPage(1)}
                className="cursor-pointer px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                1
              </button>
              {start > 2 && <span className="text-slate-600 dark:text-slate-400">...</span>}
            </>
          )}

          {pageNumbers.map(num => (
            <button
              key={num}
              onClick={() => goToPage(num)}
              className={`cursor-pointer px-3 py-1 rounded-lg transition-colors ${
                num === currentPage
                  ? 'bg-slate-500 dark:bg-slate-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {num}
            </button>
          ))}

          {end < totalPages && (
            <>
              {end < totalPages - 1 && <span className="text-slate-600 dark:text-slate-400">...</span>}
              <button
                onClick={() => goToPage(totalPages)}
                className="cursor-pointer px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="cursor-pointer p-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        <div className="max-w-7xl mx-auto py-8">
          <h1 className="text-2xl font-bold text-white mb-6">Liquity V2 Troves</h1>
          <div className="animate-pulse flex space-x-3">
            <div className="h-10 bg-slate-700 rounded w-1/3 mb-3"></div>
            <div className="h-10 bg-slate-700 rounded w-1/3 mb-3"></div>
            <div className="h-10 bg-slate-700 rounded w-1/3 mb-3"></div>
          </div>
          <div className="animate-pulse  flex sm:hidden space-x-3">
            <div className="h-10 bg-slate-700 rounded w-full mb-3"></div>
          </div>
          <div className="animate-pulse  flex sm:hidden space-x-3">
            <div className="h-10 bg-slate-700 rounded w-full mb-3"></div>
          </div>
          <div className="animate-pulse flex space-x-3">
            <div className="h-40 bg-slate-700 rounded-lg w-full mt-3 mb-6"></div>
          </div>
          <div className="animate-pulse flex space-x-3">
            <div className="h-40 bg-slate-700/75 rounded-lg w-full mb-6"></div>
          </div>
          <div className="animate-pulse flex space-x-3">
            <div className="h-40 bg-slate-700/50 rounded-lg w-full mb-6"></div>
          </div>
          <div className="animate-pulse flex space-x-3">
            <div className="h-40 bg-slate-700/25 rounded-lg w-full mb-6"></div>
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
      <div className="max-w-7xl mx-auto py-8">

        {/* Page Header */}
        <h1 className="text-2xl font-bold text-white mb-6">Liquity V2 Troves</h1>

        {/* Stats */}
        {filters.collateralTypes?.length === 1 && collateralStats && (
          <CollateralBreakdown
            stats={collateralStats}
            totalTVL={totalTVL}
            selectedCollateral={filters.collateralTypes[0]}
          />
        )}

        {/* Filters and Sort - Responsive layout */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          {/* Filter and Collateral row on mobile, inline on desktop */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:flex-1">
            {/* First row on mobile: Filter button and collateral buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <UnifiedFiltersDropdown
                filters={convertToUnifiedFilters(filters)}
                onFiltersChange={(unified) => handleFiltersChange(convertFromUnifiedFilters(unified))}
                availableCollateralTypes={availableCollateralTypes}
                showCollateralFilter={false}
              />

              {/* Collateral Type Buttons */}
              <div className="flex items-center gap-2 flex-1 md:flex-initial">
                {availableCollateralTypes.map(type => {
                  const isSelected = filters.collateralTypes?.includes(type);
                  const isOnlySelected = filters.collateralTypes?.length === 1 && isSelected;
                  return (
                    <button
                      key={type}
                      title={isOnlySelected ? 'At least one collateral must be selected' : undefined}
                      onClick={() => {
                        const current = filters.collateralTypes || [];

                        // If trying to deselect
                        if (current.includes(type)) {
                          // Don't allow deselecting if it's the only one selected
                          if (current.length === 1) {
                            return; // Keep at least one selected
                          }
                          // Otherwise, allow deselection
                          const newTypes = current.filter(t => t !== type);
                          handleFiltersChange({
                            ...filters,
                            collateralTypes: newTypes
                          });
                        } else {
                          // Always allow selecting
                          const newTypes = [...current, type];
                          handleFiltersChange({
                            ...filters,
                            collateralTypes: newTypes
                          });
                        }
                      }}
                      className={`flex items-center h-10  justify-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded-lg transition-all flex-1 md:flex-initial ${
                        isOnlySelected
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-900 hover:opacity-70'
                          : 'opacity-25 border-slate-400 dark:border-slate-600 border hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <svg className="w-5 h-5 z-1">
                        <use href={`#icon-${type.toLowerCase().replace('weth', 'eth')}`} />
                      </svg>
                      <svg className="w-5 h-5 -ml-2.5">
                        <use href={`#icon-bold`} />
                      </svg>
                      <span className="text-white font-semibold text-sm md:text-base">{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Second row on mobile: Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative w-full md:flex-1">
              <input
                type="text"
                placeholder="Address, ENS, ID, or delegate..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full px-4 py-2 pr-10 bg-white dark:bg-slate-800 h-10 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
              )}
            </form>
          </div>

          {/* Third row on mobile: Sort controls */}
          <div className="flex items-center gap-1 w-full md:w-auto">
            <button
              onClick={() => handleSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')}
              className="flex items-center justify-center w-10 h-10 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-900 dark:text-white border border-slate-300 dark:border-transparent"
              title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
            <div className="relative h-10 flex-1 md:flex-initial" ref={sortDropdownRef}>
              <button
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="w-full md:w-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-white font-medium transition-colors md:min-w-[160px] border border-slate-300 dark:border-transparent"
              >
                <span>{sortOptions.find(o => o.value === sortBy)?.label || 'Sort'}</span>
                <ChevronDown className={`w-4 h-4 text-slate-600 dark:text-slate-400 ml-auto transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute top-full left-0 md:left-auto right-0 mt-2 bg-white dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px] overflow-hidden">
                  {sortOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        handleSortChange(option.value);
                        setIsSortDropdownOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-3 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
                        sortBy === option.value ? 'bg-slate-200 dark:bg-slate-800/50' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <div className="text-slate-600 dark:text-slate-400 text-lg">
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