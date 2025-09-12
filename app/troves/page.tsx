"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TroveCard } from "@/components/trove/TroveCard";
import { TroveFilters, TroveFilterParams } from "@/components/trove/TroveFilters";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";

export default function TrovesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get page from URL, default to 1
  const currentPage = Number(searchParams.get('page')) || 1;
  
  const [troves, setTroves] = useState<TroveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    page: 1,
  });
  
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
    
    // Time filters
    const activeWithin = searchParams.get('activeWithin');
    if (activeWithin) filters.activeWithin = activeWithin;
    
    const createdWithin = searchParams.get('createdWithin');
    if (createdWithin) filters.createdWithin = createdWithin;
    
    // Trove type filter
    const troveType = searchParams.get('troveType');
    if (troveType === 'batch' || troveType === 'individual') filters.troveType = troveType;
    
    const hasRedemptions = searchParams.get('hasRedemptions');
    if (hasRedemptions === 'true') filters.hasRedemptions = true;
    
    // Sort options
    const sortBy = searchParams.get('sortBy');
    if (sortBy) filters.sortBy = sortBy;
    
    const sortOrder = searchParams.get('sortOrder');
    if (sortOrder === 'asc' || sortOrder === 'desc') filters.sortOrder = sortOrder;
    
    return filters;
  };
  
  const [filters, setFilters] = useState<TroveFilterParams>(getFiltersFromUrl());
  
  // Update URL when page or filters change
  const updateUrl = (newFilters?: TroveFilterParams, newPage?: number) => {
    const params = new URLSearchParams();
    
    // Add page
    params.set('page', (newPage || currentPage).toString());
    
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
    if (appliedFilters.activeWithin) {
      params.set('activeWithin', appliedFilters.activeWithin);
    }
    if (appliedFilters.createdWithin) {
      params.set('createdWithin', appliedFilters.createdWithin);
    }
    if (appliedFilters.troveType) {
      params.set('troveType', appliedFilters.troveType);
    }
    if (appliedFilters.hasRedemptions) {
      params.set('hasRedemptions', 'true');
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
  
  const handleFiltersChange = (newFilters: TroveFilterParams) => {
    setFilters(newFilters);
    updateUrl(newFilters, 1); // Reset to page 1 when filters change
  };
  
  const handleFiltersReset = () => {
    setFilters({});
    router.push('/troves');
  };

  useEffect(() => {
    loadTroves();
  }, [currentPage, filters]);

  const loadTroves = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((currentPage - 1) * pagination.limit).toString(),
      });
      
      // Add filter parameters
      if (filters.troveId) {
        params.set('troveId', filters.troveId);
      }
      if (filters.status) {
        params.set('status', filters.status);
      }
      if (filters.collateralType) {
        params.set('collateralType', filters.collateralType);
      }
      if (filters.ownerAddress) {
        params.set('ownerAddress', filters.ownerAddress);
      }
      if (filters.activeWithin) {
        params.set('activeWithin', filters.activeWithin);
      }
      if (filters.createdWithin) {
        params.set('createdWithin', filters.createdWithin);
      }
      if (filters.troveType === 'batch') {
        params.set('batchOnly', 'true');
      } else if (filters.troveType === 'individual') {
        params.set('individualOnly', 'true');
      }
      if (filters.hasRedemptions) {
        params.set('hasRedemptions', 'true');
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
      setTroves(data.data);
      if (data.pagination) {
        setPagination({
          total: data.pagination.total,
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
        <div className="space-y-6">
          <div className="mb-6">
            <div className="flex justify-end mb-4">
              <div className="text-sm text-slate-400">Loading troves...</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-slate-700 rounded-lg h-48 animate-pulse" />
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

  return (
    <main className="min-h-screen">
      <div className="space-y-6">
        {/* Filters */}
        <TroveFilters 
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleFiltersReset}
        />
        
        {/* Header with pagination info */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-400">
              {pagination.total > 0 ? (
                <>
                  Showing {startItem} - {endItem} of {pagination.total} troves
                </>
              ) : (
                "No troves found"
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex gap-2">
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
        </div>

        {/* Results grid */}
        {troves.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 mb-8">
            {troves.map((trove) => (
              <TroveCard key={trove.id} trove={trove} showViewButton />
            ))}
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
