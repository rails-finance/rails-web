"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TroveListingCard } from "@/components/troves/TroveListingCard";
import { TroveListFilters, TroveListFilterParams } from "@/components/troves/components/TroveListFilters";
import { TroveSummary } from "@/types/api/trove";
import { PaginationControls } from "@/components/troves/components/PaginationControls";

// Constants
const ITEMS_PER_PAGE = 20;
const AVAILABLE_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];

export default function TrovesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // State management
  const [troves, setTroves] = useState<TroveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Get page from URL
  const currentPage = Number(searchParams.get("page")) || 1;

  // Parse filters from URL - simple and direct
  const getFiltersFromUrl = (): TroveListFilterParams => {
    const filters: TroveListFilterParams = {};

    const troveId = searchParams.get("troveId");
    if (troveId) filters.troveId = troveId;

    const status = searchParams.get("status");
    if (status) filters.status = status;

    const collateralType = searchParams.get("collateralType");
    if (collateralType) filters.collateralType = collateralType;

    const ownerAddress = searchParams.get("ownerAddress");
    const ownerEns = searchParams.get("ownerEns");
    if (ownerAddress) {
      filters.ownerAddress = ownerAddress;
      filters.owner = ownerAddress;
    } else if (ownerEns) {
      filters.ownerEns = ownerEns;
      filters.owner = ownerEns;
    }

    const activeWithin = searchParams.get("activeWithin");
    if (activeWithin) filters.activeWithin = activeWithin;

    const createdWithin = searchParams.get("createdWithin");
    if (createdWithin) filters.createdWithin = createdWithin;

    // Parse boolean parameters
    const batchOnlyParam = searchParams.get("batchOnly");
    if (batchOnlyParam === "true") filters.batchOnly = true;

    const individualOnlyParam = searchParams.get("individualOnly");
    if (individualOnlyParam === "true") filters.individualOnly = true;

    // Handle hasRedemptions with true/false values
    const hasRedemptionsParam = searchParams.get("hasRedemptions");
    if (hasRedemptionsParam === "true") filters.hasRedemptions = true;
    if (hasRedemptionsParam === "false") filters.hasRedemptions = false;

    const sortBy = searchParams.get("sortBy");
    if (sortBy) filters.sortBy = sortBy;

    const sortOrder = searchParams.get("sortOrder");
    if (sortOrder === "asc" || sortOrder === "desc") filters.sortOrder = sortOrder;

    return filters;
  };

  const filters = getFiltersFromUrl();

  // Helper to build URL search params from filters
  const buildSearchParams = (filterParams: TroveListFilterParams, page?: number, includePageAndLimit?: boolean) => {
    const params = new URLSearchParams();

    // Add pagination if requested
    if (includePageAndLimit) {
      params.set("limit", ITEMS_PER_PAGE.toString());
      // For API calls, we need to calculate offset from the page number
      params.set("offset", (((page || currentPage) - 1) * ITEMS_PER_PAGE).toString());
    } else if (page && page > 1) {
      // For URL updates, only include page if > 1
      params.set("page", page.toString());
    }

    // Add filters
    if (filterParams.troveId) params.set("troveId", filterParams.troveId);
    if (filterParams.status) params.set("status", filterParams.status);
    if (filterParams.collateralType) params.set("collateralType", filterParams.collateralType);
    if (filterParams.ownerAddress) params.set("ownerAddress", filterParams.ownerAddress);
    if (filterParams.ownerEns) params.set("ownerEns", filterParams.ownerEns);
    if (filterParams.activeWithin) params.set("activeWithin", filterParams.activeWithin);
    if (filterParams.createdWithin) params.set("createdWithin", filterParams.createdWithin);
    if (filterParams.batchOnly) params.set("batchOnly", "true");
    if (filterParams.individualOnly) params.set("individualOnly", "true");
    if (filterParams.hasRedemptions !== undefined) {
      params.set("hasRedemptions", String(filterParams.hasRedemptions));
    }
    if (filterParams.sortBy) params.set("sortBy", filterParams.sortBy);
    if (filterParams.sortOrder) params.set("sortOrder", filterParams.sortOrder);

    return params;
  };

  // Update URL when filters change - simple push to let page reload
  const updateUrl = (newFilters?: TroveListFilterParams, newPage?: number) => {
    const appliedFilters = newFilters || filters;
    const page = newPage || currentPage;
    const params = buildSearchParams(appliedFilters, page);
    const url = params.toString() ? `/troves?${params.toString()}` : "/troves";
    router.push(url);
  };

  const goToPage = (page: number) => {
    updateUrl(filters, page);
  };

  const handleFiltersChange = (newFilters: TroveListFilterParams) => {
    updateUrl(newFilters, 1); // Reset to page 1 when filters change
  };

  const handleSortChange = (newSortBy: string, newSortOrder?: "asc" | "desc") => {
    const updatedFilters = {
      ...filters,
      sortBy: newSortBy,
      sortOrder: newSortOrder || filters.sortOrder || "desc",
    };
    updateUrl(updatedFilters, currentPage);
  };

  // Load troves - simple single API call based on URL params
  const loadTroves = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = buildSearchParams(filters, currentPage, true);
      const response = await fetch(`/api/troves?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch troves: ${response.statusText}`);
      }

      const data = await response.json();
      setTroves(data.data || []);
      if (data.pagination) {
        setTotalCount(data.pagination.total || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading troves:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load troves when URL changes (filters or pagination)
  useEffect(() => {
    loadTroves();
  }, [currentPage, searchParams]); // React to URL changes

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Render loading skeleton
  const renderLoadingSkeleton = () => (
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

  if (loading && troves.length === 0) {
    return renderLoadingSkeleton();
  }

  // Render error state
  const renderError = (errorMessage: string) => (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-red-400">{errorMessage}</p>
        </div>
      </div>
    </main>
  );

  if (error) {
    return renderError(error);
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto py-8">
        {/* Page Header */}
        <h1 className="text-2xl font-bold text-white mb-6">Liquity V2 Troves</h1>

        {/* Filters */}
        <TroveListFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sortBy={filters.sortBy || "lastActivity"}
          sortOrder={filters.sortOrder || "desc"}
          onSortChange={handleSortChange}
          availableCollateralTypes={AVAILABLE_COLLATERAL_TYPES}
        />

        {/* Troves */}
        {troves.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            {troves.map((trove) => (
              <TroveListingCard key={trove.id} trove={trove} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-slate-400 text-lg">
              <p className="mb-2">No troves found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          </div>
        )}

        {/* Pagination */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={goToPage}
        />
      </div>
    </main>
  );
}
