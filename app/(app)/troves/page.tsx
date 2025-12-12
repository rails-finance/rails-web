"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TroveListingCard } from "@/components/troves/TroveListingCard";
import { TroveListFilters, TroveListFilterParams } from "@/components/troves/components/TroveListFilters";
import { TroveSummary } from "@/types/api/trove";
import { PaginationControls } from "@/components/troves/components/PaginationControls";
import { TroveListLoadingSkeleton } from "@/components/troves/components/TroveListLoadingSkeleton";
import { TroveListError } from "@/components/troves/components/TroveListError";
import { FeedbackButton } from "@/components/FeedbackButton";
import { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { motion, AnimatePresence } from "framer-motion";

// Constants
const ITEMS_PER_PAGE = 20;
const AVAILABLE_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];

// Animation variants for staggered list
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // 0.1s delay between each child
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut" as const,
    },
  },
};

function TrovesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // State management
  const [troves, setTroves] = useState<TroveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [prices, setPrices] = useState<OraclePricesData | null>(null);
  const [dataKey, setDataKey] = useState(() => searchParams.toString());

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
    }
    if (ownerEns) {
      filters.ownerEns = ownerEns;
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

    // Handle showZombie with true/false values
    const showZombieParam = searchParams.get("showZombie");
    if (showZombieParam === "true") filters.showZombie = true;
    if (showZombieParam === "false") filters.showZombie = false;

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
    if (filterParams.showZombie !== undefined) {
      params.set("showZombie", String(filterParams.showZombie));
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

  // Load oracle prices - one-time fetch
  const loadPrices = async () => {
    try {
      const response = await fetch("/api/oracle/liquity-v2");
      if (response.ok) {
        const data: OraclePricesResponse = await response.json();
        if (data.success && data.data) {
          setPrices(data.data);
        }
      }
    } catch (err) {
      console.error("Error loading oracle prices:", err);
      // Silently fail - prices are optional enhancement
    }
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
      setDataKey(searchParams.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load troves");
      console.error("Error loading troves:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load prices once on mount
  useEffect(() => {
    loadPrices();
  }, []);

  // Load troves when URL changes (filters or pagination)
  useEffect(() => {
    loadTroves();
  }, [currentPage, searchParams]); // React to URL changes

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (loading && troves.length === 0) {
    return <TroveListLoadingSkeleton />;
  }

  if (error) {
    return <TroveListError message={error} />;
  }

  return (
    <main className="min-h-screen">
      <FeedbackButton />
      <div className="max-w-7xl mx-auto py-8">
        {/* Page Header */}
        <h1 className="text-2xl font-bold text-slate-700 dark:text-white mb-6">Liquity V2 Troves</h1>

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
        <AnimatePresence mode="wait">
          {troves.length > 0 ? (
            <motion.div
              key={dataKey}
              className={`grid grid-cols-1 gap-6 ${loading ? "pointer-events-none" : ""}`}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {troves.map((trove) => (
                <motion.div key={trove.id} variants={itemVariants}>
                  <TroveListingCard trove={trove} prices={prices} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <div className="text-slate-400 text-lg">
                <p className="mb-2">No troves found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

export default function TrovesPage() {
  return (
    <Suspense fallback={<TroveListLoadingSkeleton />}>
      <TrovesPageContent />
    </Suspense>
  );
}
