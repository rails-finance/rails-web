"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X, Filter } from "lucide-react";
import { useDebounce } from "@/lib/hooks/useDebounce";

export interface TroveListFilterParams {
  troveId?: string;
  status?: string;
  collateralType?: string;
  ownerAddress?: string;
  ownerEns?: string;
  activeWithin?: string;
  createdWithin?: string;
  batchOnly?: boolean;
  individualOnly?: boolean;
  hasRedemptions?: boolean;
  zombieFilter?: "only" | "hide";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface TroveListFiltersProps {
  filters: TroveListFilterParams;
  onFiltersChange: (filters: TroveListFilterParams) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (sortBy: string, sortOrder?: "asc" | "desc") => void;
  availableCollateralTypes?: string[];
}

export function TroveListFilters({
  filters,
  onFiltersChange,
  sortBy = "lastActivity",
  sortOrder = "desc",
  onSortChange,
  availableCollateralTypes = ["WETH", "wstETH", "rETH"],
}: TroveListFiltersProps) {
  // Initialize with actual filter value that's set (troveId, address, or ENS)
  const initialSearchValue = filters.troveId || filters.ownerAddress || filters.ownerEns || "";
  const [searchInput, setSearchInput] = useState<string>(initialSearchValue);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search input to reduce API calls
  const debouncedSearchInput = useDebounce(searchInput, 500);

  // Keep search input in sync with filters from props
  useEffect(() => {
    // Sync with the actual filter value that was set
    const filterValue = filters.troveId || filters.ownerAddress || filters.ownerEns || "";
    setSearchInput(filterValue);
  }, [filters.troveId, filters.ownerAddress, filters.ownerEns]);

  // Trigger search when debounced value changes
  useEffect(() => {
    // If empty, clear immediately (no debounce delay)
    if (!debouncedSearchInput.trim()) {
      if (filters.troveId || filters.ownerAddress || filters.ownerEns) {
        handleClearSearch();
      }
      return;
    }

    // Trigger search with debounced value
    handleSearchSubmit();
  }, [debouncedSearchInput]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedValue = searchInput.trim();

    // Detect input type
    const isTroveId = trimmedValue && /^\d+$/.test(trimmedValue);
    const isEns = trimmedValue && trimmedValue.toLowerCase().endsWith(".eth");
    const isAddress = trimmedValue && /^0x[a-fA-F0-9]{40}$/.test(trimmedValue);

    onFiltersChange({
      ...filters,
      troveId: isTroveId ? trimmedValue : undefined,
      ownerAddress: isAddress ? trimmedValue : undefined,
      ownerEns: isEns ? trimmedValue : undefined,
    });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    onFiltersChange({
      ...filters,
      troveId: undefined,
      ownerAddress: undefined,
      ownerEns: undefined,
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.status) count++;
    if (filters.batchOnly) count++;
    if (filters.individualOnly) count++;
    if (filters.hasRedemptions !== undefined) count++;
    if (filters.zombieFilter) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  const handleFilterChange = (updates: Partial<TroveListFilterParams>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const resetFilters = () => {
    onFiltersChange({
      ...filters,
      status: undefined,
      batchOnly: undefined,
      individualOnly: undefined,
      hasRedemptions: undefined,
      zombieFilter: undefined,
    });
  };

  // Sort options - map UI labels to backend field names
  const sortOptions = [
    { value: "lastActivity", label: "Latest Activity" },
    { value: "debt", label: "Debt" },
    { value: "coll", label: "Collateral" },
    { value: "ratio", label: "Ratio" },
    { value: "interestRate", label: "Interest Rate" },
  ];

  return (
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
      {/* Filter and Collateral row on mobile, inline on desktop */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:flex-1">
        {/* First row on mobile: Filter button and collateral buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Filter Dropdown */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex cursor-pointer items-center gap-2 px-4 h-10 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-white font-medium transition-colors"
            >
              <Filter className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 bg-slate-300 dark:bg-slate-600 rounded-full text-xs text-slate-700 dark:text-slate-200">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${isFilterDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[280px] max-h-[400px] overflow-y-auto">
                {/* Status Toggle */}
                <div className="p-3 border-b border-slate-300 dark:border-slate-700">
                  <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Status</div>
                  <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                    <button
                      onClick={() => handleFilterChange({ status: undefined })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        !filters.status
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => handleFilterChange({ status: "open" })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        filters.status === "open"
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => handleFilterChange({ status: "closed" })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        filters.status === "closed"
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Closed
                    </button>
                  </div>
                </div>

                {/* Advanced Filters */}
                <div className="p-3 border-b border-slate-300 dark:border-slate-700 space-y-3">
                  {/* Redemptions Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Redemptions</div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: undefined })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.hasRedemptions === undefined
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: true })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.hasRedemptions === true
                            ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        With
                      </button>
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: false })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.hasRedemptions === false
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Without
                      </button>
                    </div>
                  </div>

                  {/* Interest Rate Management Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Interest Rate Management</div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                      <button
                        onClick={() => handleFilterChange({ batchOnly: undefined, individualOnly: undefined })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          !filters.batchOnly && !filters.individualOnly
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ batchOnly: true, individualOnly: undefined })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.batchOnly
                            ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Delegated
                      </button>
                      <button
                        onClick={() => handleFilterChange({ batchOnly: undefined, individualOnly: true })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.individualOnly
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Individual
                      </button>
                    </div>
                  </div>

                  {/* Zombie Troves Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Zombie Troves</div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                      <button
                        onClick={() => handleFilterChange({ zombieFilter: undefined })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          !filters.zombieFilter
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ zombieFilter: "only" })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.zombieFilter === "only"
                            ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Show Zombies
                      </button>
                      <button
                        onClick={() => handleFilterChange({ zombieFilter: "hide" })}
                        className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                          filters.zombieFilter === "hide"
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Hide Zombies
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reset Filters */}
                {activeFilterCount > 0 && (
                  <div className="p-3">
                    <button
                      onClick={resetFilters}
                      className="cursor-pointer w-full px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-sm text-slate-900 dark:text-white transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Collateral Type Buttons */}
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            {availableCollateralTypes.map((type) => {
              const isSelected = filters.collateralType === type;

              return (
                <button
                  key={type}
                  onClick={() => {
                    // Single select behavior - clicking same button deselects, clicking different selects
                    onFiltersChange({
                      ...filters,
                      collateralType: filters.collateralType === type ? undefined : type,
                    });
                  }}
                  className={`flex items-center h-10 justify-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded-lg transition-all flex-1 md:flex-initial cursor-pointer ${
                    isSelected
                      ? "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-900 hover:opacity-70"
                      : "opacity-25 border-slate-300 dark:border-slate-600 border hover:border-slate-400 dark:hover:border-slate-500"
                  }`}
                >
                  <svg className="w-5 h-5 z-1">
                    <use href={`#icon-${type.toLowerCase().replace("weth", "eth")}`} />
                  </svg>
                  <svg className="w-5 h-5 -ml-2.5">
                    <use href={`#icon-bold`} />
                  </svg>
                  <span className="text-slate-500 dark:text-white font-semibold text-sm md:text-base">{type}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Second row on mobile: Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:flex-1">
          <input
            type="text"
            placeholder="Address, ENS, or ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-4 py-2 pr-10 bg-white dark:bg-slate-800 h-10 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
          onClick={() => onSortChange?.(sortBy, sortOrder === "asc" ? "desc" : "asc")}
          className="flex items-center justify-center w-10 h-10 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-900 dark:text-white border border-slate-300 dark:border-transparent"
          title={sortOrder === "asc" ? "Sort Ascending" : "Sort Descending"}
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
        <div className="relative h-10 flex-1 md:flex-initial" ref={sortDropdownRef}>
          <button
            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            className="w-full md:w-auto flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-white font-medium transition-colors md:min-w-[160px] border border-slate-300 dark:border-transparent"
          >
            <span>{sortOptions.find((o) => o.value === sortBy)?.label || "Sort"}</span>
            <ChevronDown
              className={`w-4 h-4 text-slate-600 dark:text-slate-400 ml-auto transition-transform ${isSortDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isSortDropdownOpen && (
            <div className="absolute top-full left-0 md:left-auto right-0 mt-2 bg-white dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px] overflow-hidden">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSortChange?.(option.value);
                    setIsSortDropdownOpen(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
                    sortBy === option.value ? "bg-slate-200 dark:bg-slate-800/50" : ""
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
  );
}
