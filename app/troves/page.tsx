"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SimplifiedTroveCard } from "@/components/trove/SimplifiedTroveCard";
import { TroveFilterParams } from "@/components/trove/TroveFilters";
import { MinimalFilters } from "@/components/trove/MinimalFilters";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";
import { CollateralBreakdown } from "@/components/stats/CollateralBreakdown";
import { CollateralStats } from "@/types/api/stats";


export default function TrovesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get page from URL, default to 1
  const currentPage = Number(searchParams.get('page')) || 1;

  // Get view from URL, default to 'open'
  const currentView = (searchParams.get('view') as 'open' | 'closed') || 'open';

  const [troves, setTroves] = useState<TroveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    page: 1,
  });
  const [collateralStats, setCollateralStats] = useState<CollateralStats | null>(null);
  const [totalTVL, setTotalTVL] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(false);
  
  // Parse filters from URL
  const getFiltersFromUrl = (): TroveFilterParams => {
    const filters: TroveFilterParams = {};
    
    // Trove ID filter
    const troveId = searchParams.get('troveId');
    if (troveId) filters.troveId = troveId;
    
    // Status filter
    const status = searchParams.get('status');
    if (status) filters.status = status;
    
    // Collateral type filter
    const collateralType = searchParams.get('collateralType');
    if (collateralType) filters.collateralType = collateralType;
    
    // Owner address
    const ownerAddress = searchParams.get('ownerAddress');
    if (ownerAddress) filters.ownerAddress = ownerAddress;
    
    
    // Trove type filter
    const troveType = searchParams.get('troveType');
    if (troveType === 'batch' || troveType === 'individual') filters.troveType = troveType;
    
    const hasRedemptions = searchParams.get('hasRedemptions');
    if (hasRedemptions === 'true') filters.hasRedemptions = true;

    // Three-state filters
    const zombieFilter = searchParams.get('zombieFilter');
    if (zombieFilter === 'hide' || zombieFilter === 'only') filters.zombieFilter = zombieFilter;

    const redemptionFilter = searchParams.get('redemptionFilter');
    if (redemptionFilter === 'hide' || redemptionFilter === 'only') filters.redemptionFilter = redemptionFilter;

    const batchFilter = searchParams.get('batchFilter');
    if (batchFilter === 'hide' || batchFilter === 'only') filters.batchFilter = batchFilter;

    // Sort options
    const sortBy = searchParams.get('sortBy');
    if (sortBy) filters.sortBy = sortBy;
    
    const sortOrder = searchParams.get('sortOrder');
    if (sortOrder === 'asc' || sortOrder === 'desc') filters.sortOrder = sortOrder;
    
    return filters;
  };
  
  const [filters, setFilters] = useState<TroveFilterParams>(getFiltersFromUrl());

  // Synchronize filters with URL when searchParams change
  useEffect(() => {
    const urlFilters = getFiltersFromUrl();
    setFilters(urlFilters);
  }, [searchParams]);
  
  // Update URL when page, view, or filters change
  const updateUrl = (newFilters?: TroveFilterParams, newPage?: number, newView?: 'open' | 'closed') => {
    const params = new URLSearchParams();

    // Add page
    params.set('page', (newPage || currentPage).toString());

    // Add view
    params.set('view', newView || currentView);
    
    // Add filters
    const appliedFilters = newFilters || filters;
    if (appliedFilters.troveId) {
      params.set('troveId', appliedFilters.troveId);
    }
    if (appliedFilters.status) {
      params.set('status', appliedFilters.status);
    }
    if (appliedFilters.collateralType) {
      params.set('collateralType', appliedFilters.collateralType);
    }
    if (appliedFilters.ownerAddress) {
      params.set('ownerAddress', appliedFilters.ownerAddress);
    }
    if (appliedFilters.troveType) {
      params.set('troveType', appliedFilters.troveType);
    }
    if (appliedFilters.hasRedemptions) {
      params.set('hasRedemptions', 'true');
    }
    // Three-state filters
    if (appliedFilters.zombieFilter) {
      params.set('zombieFilter', appliedFilters.zombieFilter);
    }
    if (appliedFilters.redemptionFilter) {
      params.set('redemptionFilter', appliedFilters.redemptionFilter);
    }
    if (appliedFilters.batchFilter) {
      params.set('batchFilter', appliedFilters.batchFilter);
    }
    if (appliedFilters.sortBy) {
      params.set('sortBy', appliedFilters.sortBy);
    }
    if (appliedFilters.sortOrder) {
      params.set('sortOrder', appliedFilters.sortOrder);
    }
    
    router.push(`/troves?${params.toString()}`);
  };
  
  const setCurrentPage = (page: number) => {
    updateUrl(filters, page);
  };

  const handleViewChange = (view: 'open' | 'closed') => {
    // Reset filters (except collateralType) and page when switching views
    const preservedFilters: TroveFilterParams = {
      collateralType: filters.collateralType
    };
    setFilters(preservedFilters);
    updateUrl(preservedFilters, 1, view);
  };

  const handleFiltersChange = (newFilters: TroveFilterParams) => {
    setFilters(newFilters);
    updateUrl(newFilters, 1); // Reset to page 1 when filters change
  };

  const handleFiltersReset = () => {
    // Reset filters but preserve collateralType
    const preservedFilters: TroveFilterParams = {
      collateralType: filters.collateralType
    };
    setFilters(preservedFilters);
    updateUrl(preservedFilters, 1, currentView);
  };

  useEffect(() => {
    loadTroves();
  }, [currentPage, filters, currentView]);

  useEffect(() => {
    // Load collateral stats when collateralType changes in URL
    const collateralType = searchParams.get('collateralType');
    if (collateralType) {
      loadCollateralStats(collateralType);
    } else {
      // Clear stats if no collateral type selected
      setCollateralStats(null);
      setTotalTVL(0);
    }
  }, [searchParams.get('collateralType')]);

  const needsSingleApiCall = () => {
    // If any specific filters are applied that work better with single calls
    return (
      filters.zombieFilter === 'only' ||
      filters.zombieFilter === 'hide' ||
      filters.redemptionFilter === 'only' ||
      filters.redemptionFilter === 'hide' ||
      filters.batchFilter === 'only' ||
      filters.batchFilter === 'hide'
    );
  };

  const loadOpenAndZombieTroves = async () => {
    try {
      const baseParams = new URLSearchParams();

      // Add common filter parameters
      if (filters.troveId) baseParams.set('troveId', filters.troveId);
      if (filters.collateralType) baseParams.set('collateralType', filters.collateralType);
      if (filters.ownerAddress) baseParams.set('ownerAddress', filters.ownerAddress);

      // Handle batch filter
      if (filters.batchFilter === 'only') baseParams.set('batchOnly', 'true');
      else if (filters.batchFilter === 'hide') baseParams.set('individualOnly', 'true');

      // Handle redemption filter
      if (filters.redemptionFilter === 'only') baseParams.set('hasRedemptions', 'true');
      else if (filters.redemptionFilter === 'hide') baseParams.set('excludeRedemptions', 'true');

      if (filters.sortBy) baseParams.set('sortBy', filters.sortBy);
      if (filters.sortOrder) baseParams.set('sortOrder', filters.sortOrder);

      // Fetch only open troves (which includes zombie troves as they have isZombieTrove flag)
      const openResponse = await fetch(`/api/troves?${baseParams.toString()}&status=open&limit=200&offset=0`);

      if (!openResponse.ok) throw new Error(`Failed to fetch open troves: ${openResponse.statusText}`);

      const openData = await openResponse.json();

      // Filter based on zombie filter setting
      let allTroves: TroveSummary[] = openData.data || [];

      if (filters.zombieFilter === 'only') {
        // Show only zombie troves
        allTroves = allTroves.filter((trove) => trove.isZombieTrove === true);
      } else if (filters.zombieFilter === 'hide') {
        // Hide zombie troves
        allTroves = allTroves.filter((trove) => trove.isZombieTrove !== true);
      }
      // else show all (both zombie and non-zombie)

      // Apply sorting
      const sortedTroves = sortTroves(allTroves, filters.sortBy || 'lastActivity', filters.sortOrder || 'desc');

      // Apply pagination
      const startIndex = (currentPage - 1) * pagination.limit;
      const endIndex = startIndex + pagination.limit;
      const paginatedTroves = sortedTroves.slice(startIndex, endIndex);

      setTroves(paginatedTroves);
      setPagination({
        total: sortedTroves.length,
        limit: pagination.limit,
        page: currentPage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading open and zombie troves:", err);
    }
  };

  const loadClosedAndLiquidatedTroves = async () => {
    try {
      const baseParams = new URLSearchParams();

      // Add common filter parameters
      if (filters.troveId) baseParams.set('troveId', filters.troveId);
      if (filters.collateralType) baseParams.set('collateralType', filters.collateralType);
      if (filters.ownerAddress) baseParams.set('ownerAddress', filters.ownerAddress);
      if (filters.troveType === 'batch') baseParams.set('batchOnly', 'true');
      else if (filters.troveType === 'individual') baseParams.set('individualOnly', 'true');
      if (filters.sortBy) baseParams.set('sortBy', filters.sortBy);
      if (filters.sortOrder) baseParams.set('sortOrder', filters.sortOrder);

      // Make two parallel API calls
      const [closedResponse, liquidatedResponse] = await Promise.all([
        fetch(`/api/troves?${baseParams.toString()}&status=closed&limit=100&offset=0`),
        fetch(`/api/troves?${baseParams.toString()}&status=liquidated&limit=100&offset=0`)
      ]);

      if (!closedResponse.ok) throw new Error(`Failed to fetch closed troves: ${closedResponse.statusText}`);
      if (!liquidatedResponse.ok) throw new Error(`Failed to fetch liquidated troves: ${liquidatedResponse.statusText}`);

      const [closedData, liquidatedData] = await Promise.all([
        closedResponse.json(),
        liquidatedResponse.json()
      ]);

      // Combine and sort the results
      const allTroves = [...(closedData.data || []), ...(liquidatedData.data || [])];

      // Apply sorting if needed
      const sortedTroves = sortTroves(allTroves, filters.sortBy || 'created', filters.sortOrder || 'desc');

      // Apply pagination
      const startIndex = (currentPage - 1) * pagination.limit;
      const endIndex = startIndex + pagination.limit;
      const paginatedTroves = sortedTroves.slice(startIndex, endIndex);

      setTroves(paginatedTroves);
      setPagination({
        total: sortedTroves.length,
        limit: pagination.limit,
        page: currentPage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading closed and liquidated troves:", err);
    }
  };

  const sortTroves = (troves: any[], sortBy: string, sortOrder: string) => {
    return [...troves].sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'created':
          aVal = new Date(a.createdAt || a.closedAt || 0).getTime();
          bVal = new Date(b.createdAt || b.closedAt || 0).getTime();
          break;
        case 'debt':
          aVal = parseFloat(a.debt?.current || a.debt?.currentRaw || 0);
          bVal = parseFloat(b.debt?.current || b.debt?.currentRaw || 0);
          break;
        case 'peakDebt':
          aVal = parseFloat(a.debt?.peak || 0);
          bVal = parseFloat(b.debt?.peak || 0);
          break;
        case 'coll':
          aVal = parseFloat(a.backedBy?.amount || a.collateralAtLiquidation || 0);
          bVal = parseFloat(b.backedBy?.amount || b.collateralAtLiquidation || 0);
          break;
        case 'ratio':
          aVal = parseFloat(a.collateralRatio || 0);
          bVal = parseFloat(b.collateralRatio || 0);
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') return aVal - bVal;
      return bVal - aVal;
    });
  };

  const loadCollateralStats = async (collateralType: string) => {
    try {
      console.log('Loading stats for collateral type:', collateralType);
      setStatsLoading(true);
      const response = await fetch('/api/stats');
      if (response.ok) {
        const rawData = await response.json();
        console.log('Raw API response:', rawData);

        // The API wraps the data in a success/data structure
        const data = rawData.data || rawData;
        console.log('Extracted data:', data);

        // Use the collateralType exactly as provided in the URL
        if (data.byCollateral) {
          console.log('Available collateral types:', Object.keys(data.byCollateral));
          console.log('Looking for:', collateralType);

          if (data.byCollateral[collateralType]) {
            console.log('Found stats for', collateralType, ':', data.byCollateral[collateralType]);
            setCollateralStats(data.byCollateral[collateralType]);

            // Calculate total TVL from all collateral types
            const total = Object.values(data.byCollateral as Record<string, CollateralStats>).reduce(
              (sum, stats: any) => sum + stats.totalCollateralUsd,
              0
            );
            setTotalTVL(total);
            console.log('Total TVL calculated:', total);
          } else {
            console.log('No stats found for collateral type:', collateralType);
          }
        } else {
          console.log('No byCollateral data in response');
        }
      } else {
        console.error('Response not ok:', response.status);
      }
    } catch (error) {
      console.error('Error loading collateral stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadTroves = async () => {
    try {
      setLoading(true);
      setError(null);

      // For closed view showing both closed and liquidated, we need to make two API calls
      if (currentView === 'closed' && !filters.liquidatedOnly) {
        await loadClosedAndLiquidatedTroves();
        return;
      }

      // For open view showing both open and zombie, we need to make two API calls
      // Only when zombie filter is 'all' and no conflicting filters
      if (currentView === 'open' &&
          (!filters.zombieFilter || filters.zombieFilter === 'all') &&
          !needsSingleApiCall()) {
        await loadOpenAndZombieTroves();
        return;
      }

      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((currentPage - 1) * pagination.limit).toString(),
      });

      // Add filter parameters
      if (filters.troveId) {
        params.set('troveId', filters.troveId);
      }

      // Set status based on current view
      if (currentView === 'open') {
        // Always fetch open troves, zombie filtering will be done client-side based on isZombieTrove field
        params.set('status', 'open');
      } else {
        // For closed view, show liquidated only when filter is active
        if (filters.liquidatedOnly) {
          params.set('status', 'liquidated');
        } else {
          // This shouldn't happen now due to the early return above
          params.set('status', 'closed');
        }
      }
      if (filters.collateralType) {
        params.set('collateralType', filters.collateralType);
      }
      if (filters.ownerAddress) {
        params.set('ownerAddress', filters.ownerAddress);
      }
      // Handle batch filter
      if (filters.batchFilter === 'only') {
        params.set('batchOnly', 'true');
      } else if (filters.batchFilter === 'hide') {
        params.set('individualOnly', 'true');
      }

      // Handle redemption filter
      if (filters.redemptionFilter === 'only') {
        params.set('hasRedemptions', 'true');
      } else if (filters.redemptionFilter === 'hide') {
        params.set('excludeRedemptions', 'true');
      }
      if (filters.sortBy) {
        params.set('sortBy', filters.sortBy);
      }
      if (filters.sortOrder) {
        params.set('sortOrder', filters.sortOrder);
      }
      
      const response = await fetch(`/api/troves?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch troves: ${response.statusText}`);
      }

      const data: TrovesResponse = await response.json();
      let trovesData = data.data;

      // Apply zombie filtering on client side for open troves
      if (currentView === 'open' && filters.zombieFilter) {
        if (filters.zombieFilter === 'only') {
          trovesData = trovesData.filter((trove) => trove.isZombieTrove === true);
        } else if (filters.zombieFilter === 'hide') {
          trovesData = trovesData.filter((trove) => trove.isZombieTrove !== true);
        }
      }

      setTroves(trovesData);
      if (data.pagination) {
        setPagination({
          total: trovesData.length,
          limit: data.pagination.limit,
          page: data.pagination.page,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading troves:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const startItem = (currentPage - 1) * pagination.limit + 1;
  const endItem = Math.min(currentPage * pagination.limit, pagination.total);

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="space-y-4">
          {/* Top section - count and filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="h-10 bg-slate-700 rounded w-48 animate-pulse"></div>  
            </div>
          </div>

          {/* Desktop column headers */}
          <div className="hidden md:grid md:grid-cols-5 md:gap-6 mb-3 px-4 text-xs">
            <div className="flex items-center gap-2">
            </div>
          </div>


          {/* Trove rows */}
          <div className="grid grid-cols-1 gap-6">
            {[...Array(11)].map((_, i) => (
              <div key={i} className="rounded-lg bg-slate-900 p-4 animate-pulse">
                <div className="grid h-12  md:grid-cols-5 md:gap-6 md:items-center">
                  {/* Status/Activity column */}
                  <div className="flex items-center gap-2 mb-3 md:mb-0">
                  </div>

                  {/* Debt column */}
                  <div className="flex items-center gap-2 mb-3 md:mb-0">
                  </div>

                  {/* Collateral column */}
                  <div className="mb-3 md:mb-0">
                  </div>

                  {/* Ratio column */}

                  {/* Interest/Action column */}
                  <div className="flex items-center justify-between md:justify-end gap-2">
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen">
        <div className="space-y-6">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadTroves}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  console.log('Render check - filters.collateralType:', filters.collateralType);
  console.log('Render check - collateralStats:', collateralStats);
  console.log('Render check - statsLoading:', statsLoading);

  return (
    <main className="min-h-screen">
      <div className="space-y-4">
        {/* Individual Collateral Breakdown */}
        {filters.collateralType && (
          <CollateralBreakdown
            collateralType={filters.collateralType}
            stats={collateralStats || {
              totalCollateral: 0,
              totalCollateralUsd: 0,
              totalDebt: 0,
              openTroveCount: 0,
              troveCount: 0
            }}
            totalTVL={totalTVL}
            mode="individual"
            showSearch={true}
            loading={statsLoading || !collateralStats}
          />
        )}
        {/* Results count, filters and mobile sort - all in one line */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="text-sm text-slate-400">
              {pagination.total > 0 ? (
                <>
                  Showing {startItem} - {endItem} of {pagination.total} troves
                </>
              ) : (
                "No troves found"
              )}
            </div>

            {/* Minimal inline filters */}
            <MinimalFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              currentView={currentView}
              onViewChange={handleViewChange}
              onReset={handleFiltersReset}
            />
          </div>

          {/* Mobile sort dropdown */}
          <div className="md:hidden flex items-center gap-2">
            <span className="text-xs text-slate-400">Sort:</span>
            <select
              value={filters.sortBy || (currentView === 'open' ? 'lastActivity' : 'created')}
              onChange={(e) => handleFiltersChange({ ...filters, sortBy: e.target.value })}
              className="px-2 py-1 bg-slate-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="lastActivity">Recent Activity</option>
              <option value="debt">Debt</option>
              <option value="coll">Collateral</option>
              <option value="ratio">Collateral Ratio</option>
              <option value="interestRate">Interest Rate</option>
            </select>
            <button
              onClick={() => {
                const newOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
                handleFiltersChange({ ...filters, sortOrder: newOrder });
              }}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs transition-all"
              title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {filters.sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Results display */}
        {troves.length > 0 ? (
          <div className="mb-8">
            {/* Table header for desktop only */}
            {currentView === 'open' ? (
              <div className="hidden md:grid md:gap-6 md:items-end mb-3 px-4 text-xs" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newOrder = filters.sortBy === 'lastActivity' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                      handleFiltersChange({ ...filters, sortBy: 'lastActivity', sortOrder: newOrder });
                    }}
                    className={`flex items-center justify-center w-5 h-5 rounded hover:bg-slate-700 transition-colors ${
                      filters.sortBy === 'lastActivity' ? 'text-white' : 'text-slate-400'
                    }`}
                    title="Sort by recent activity"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {filters.sortBy === 'lastActivity' && (
                      <span className="text-slate-300 ml-0.5 text-[10px]">
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const newOrder = filters.sortBy === 'debt' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                      handleFiltersChange({ ...filters, sortBy: 'debt', sortOrder: newOrder });
                    }}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-left"
                  >
                    Debt
                    {filters.sortBy === 'debt' && (
                      <span className="text-slate-300">
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => {
                    const newOrder = filters.sortBy === 'coll' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                    handleFiltersChange({ ...filters, sortBy: 'coll', sortOrder: newOrder });
                  }}
                  className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-left"
                >
                  Backed by
                  {filters.sortBy === 'coll' && (
                    <span className="text-slate-300">
                      {filters.sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const newOrder = filters.sortBy === 'ratio' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                    handleFiltersChange({ ...filters, sortBy: 'ratio', sortOrder: newOrder });
                  }}
                  className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-left"
                >
                  Collateral Ratio
                  {filters.sortBy === 'ratio' && (
                    <span className="text-slate-300">
                      {filters.sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const newOrder = filters.sortBy === 'interestRate' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                    handleFiltersChange({ ...filters, sortBy: 'interestRate', sortOrder: newOrder });
                  }}
                  className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-left"
                >
                  Interest Rate
                  {filters.sortBy === 'interestRate' && (
                    <span className="text-slate-300">
                      {filters.sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
                <div></div> {/* Empty header for the action column */}
              </div>
            ) : (
              <div className="hidden md:grid md:gap-6 md:items-end mb-3 px-4 text-xs" style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newOrder = filters.sortBy === 'lastActivity' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                      handleFiltersChange({ ...filters, sortBy: 'lastActivity', sortOrder: newOrder });
                    }}
                    className={`flex items-center justify-center w-5 h-5 rounded hover:bg-slate-700 transition-colors ${
                      filters.sortBy === 'lastActivity' ? 'text-white' : 'text-slate-400'
                    }`}
                    title="Sort by recent activity"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {filters.sortBy === 'lastActivity' && (
                      <span className="text-slate-300 ml-0.5 text-[10px]">
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const newOrder = filters.sortBy === 'peakDebt' && filters.sortOrder === 'desc' ? 'asc' : 'desc';
                      handleFiltersChange({ ...filters, sortBy: 'peakDebt', sortOrder: newOrder });
                    }}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-left"
                  >
                    Peak Debt
                    {filters.sortBy === 'peakDebt' && (
                      <span className="text-slate-300">
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </div>
                <div></div> {/* Empty header for the action column */}
              </div>
            )}
            <div className="grid grid-cols-1 gap-6">
              {troves.map((trove) => (
                <SimplifiedTroveCard key={trove.id} trove={trove} showViewButton hideLabels />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>No troves available</p>
          </div>
        )}

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pb-8">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
