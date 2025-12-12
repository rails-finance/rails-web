"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X, Filter, Check } from "lucide-react";
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
  showZombie?: boolean;
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
  const [hoveredCollateral, setHoveredCollateral] = useState<string | null>(null);
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

  // Close dropdowns on outside click and Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSortDropdownOpen(false);
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
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
    if (filters.showZombie !== undefined) count++;
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
      showZombie: undefined,
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
    <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 xl:gap-4">
      {/* Filter and Collateral row on mobile, inline on desktop */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:flex-1">
        {/* First row on mobile: Filter button and collateral buttons */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          {/* Filter Dropdown */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex cursor-pointer items-center gap-2 px-4 h-10 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-white font-bold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-expanded={isFilterDropdownOpen}
              aria-label={`Filter troves${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
            >
              <Filter className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5  bg-white dark:bg-slate-800 rounded-full text-xs text-slate-400 dark:text-slate-500" aria-hidden="true">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${isFilterDropdownOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute top-full border-1 border-slate-700  left-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl z-50 min-w-[280px] max-h-[400px] overflow-y-auto" role="menu">
                {/* Status Toggle */}
                <div className="p-3 ">
                  <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Status</div>
                  <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1" role="group" aria-label="Filter by trove status">
                    <button
                      onClick={() => handleFilterChange({ status: undefined })}
                      className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        !filters.status
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      aria-pressed={!filters.status}
                      aria-label="Show all trove statuses"
                    >
                      All
                    </button>
                    <button
                      onClick={() => handleFilterChange({ status: "open" })}
                      className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        filters.status === "open"
                          ? "text-white bg-green-500 dark:bg-green-950 dark:text-green-500 rounded"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      aria-pressed={filters.status === "open"}
                      aria-label="Show only active troves"
                    >
                      Active
                    </button>
                    <button
                      onClick={() => handleFilterChange({ status: "closed" })}
                      className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        filters.status === "closed"
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      aria-pressed={filters.status === "closed"}
                      aria-label="Show only closed troves"
                    >
                      Closed
                    </button>
                  </div>
                </div>

                {/* Advanced Filters */}
                <div className="p-3 space-y-3">
                  {/* Redemptions Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Redemptions
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1" role="group" aria-label="Filter by redemptions">
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: undefined })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.hasRedemptions === undefined
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.hasRedemptions === undefined}
                        aria-label="Show troves with or without redemptions"
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: true })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.hasRedemptions === true
                            ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.hasRedemptions === true}
                        aria-label="Show only troves with redemptions"
                      >
                        With
                      </button>
                      <button
                        onClick={() => handleFilterChange({ hasRedemptions: false })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.hasRedemptions === false
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.hasRedemptions === false}
                        aria-label="Show only troves without redemptions"
                      >
                        Without
                      </button>
                    </div>
                  </div>

                  {/* Interest Rate Management Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Interest Rate Management
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1" role="group" aria-label="Filter by interest rate management">
                      <button
                        onClick={() => handleFilterChange({ batchOnly: undefined, individualOnly: undefined })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          !filters.batchOnly && !filters.individualOnly
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={!filters.batchOnly && !filters.individualOnly}
                        aria-label="Show all troves regardless of interest rate management"
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ batchOnly: true, individualOnly: undefined })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.batchOnly
                            ? "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.batchOnly === true}
                        aria-label="Show only troves with delegated interest rate management"
                      >
                        Delegated
                      </button>
                      <button
                        onClick={() => handleFilterChange({ batchOnly: undefined, individualOnly: true })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.individualOnly
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.individualOnly === true}
                        aria-label="Show only troves with individual interest rate management"
                      >
                        Individual
                      </button>
                    </div>
                  </div>

                  {/* Zombie Troves Filter */}
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Zombie Troves
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1" role="group" aria-label="Filter zombie troves">
                      <button
                        onClick={() => handleFilterChange({ showZombie: undefined })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.showZombie === undefined
                            ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.showZombie === undefined}
                        aria-label="Show all troves including zombie troves"
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange({ showZombie: true })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.showZombie === true
                            ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400 font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.showZombie === true}
                        aria-label="Show only zombie troves"
                      >
                        Show
                      </button>
                      <button
                        onClick={() => handleFilterChange({ showZombie: false })}
                        className={`cursor-pointer flex-1 px-3 py-1.5 rounded text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          filters.showZombie === false
                            ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                        aria-pressed={filters.showZombie === false}
                        aria-label="Hide zombie troves"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reset Filters */}
                {activeFilterCount > 0 && (
                  <div className="p-3">
                    <button
                      onClick={resetFilters}
                      className="cursor-pointer w-full px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-sm text-slate-900 dark:text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Reset all filters"
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Collateral Type Buttons */}
          <div className="flex items-center gap-2 flex-1 lg:flex-initial" role="group" aria-label="Filter by collateral type">
            {availableCollateralTypes.map((type) => {
              // isVisible = this collateral type is currently being shown in the list
              const isVisible = !filters.collateralType || filters.collateralType === type;
              // isExclusivelySelected = this is the ONLY collateral type being shown
              const isExclusivelySelected = filters.collateralType === type;
              // Preview state: when hovering over exclusively selected button, highlight the others
              const isPreviewHighlighted =
                filters.collateralType &&
                hoveredCollateral &&
                hoveredCollateral !== type &&
                filters.collateralType === hoveredCollateral;

              return (
                <button
                  key={type}
                  onMouseEnter={() => setHoveredCollateral(type)}
                  onMouseLeave={() => setHoveredCollateral(null)}
                  onClick={() => {
                    // Single select behavior - clicking same button deselects, clicking different selects
                    onFiltersChange({
                      ...filters,
                      collateralType: filters.collateralType === type ? undefined : type,
                    });
                  }}
                  className={`cursor-pointer relative flex items-center duration-150 border-2 h-10 justify-center gap-1 lg:gap-2 px-2 lg:px-3 py-2 rounded-lg transition-colors flex-1 lg:flex-initial cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isExclusivelySelected
                      ? "border-blue-700  "
                      : isVisible
                      ? "border-slate-200 dark:border-slate-700 hover:border-blue-700/50"
                      : isPreviewHighlighted
                      ? "border-blue-400 dark:border-slate-700/50 opacity-75 "
                      : "border-slate-200 dark:border-slate-700 hover:dark:border-blue-700/50 "
                  }`}
                  aria-pressed={isExclusivelySelected}
                  aria-label={`${isExclusivelySelected ? 'Showing only' : 'Filter to'} ${type} collateral troves`}
                >
                  <svg className="w-5 h-5 z-1" aria-hidden="true">
                    <use href={`#icon-${type.toLowerCase().replace("weth", "eth")}`} />
                  </svg>
                  <svg className="w-5 h-5 -ml-2.5" aria-hidden="true">
                    <use href={`#icon-bold`} />
                  </svg>
                  <span className="hidden sm:inline text-slate-700 dark:text-white font-bold text-sm lg:text-base">{type}</span>


                </button>
              );
            })}
          </div>
        </div>

        {/* Second row on mobile: Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative w-full lg:flex-1">
          <input
            type="text"
            placeholder="Address, ENS, or ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-4 py-2 pr-10 bg-white dark:bg-slate-800 h-10 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Search by wallet address, ENS name, or trove ID"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={handleClearSearch}
              className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" aria-hidden="true" />
          )}
        </form>
      </div>

      {/* Third row on mobile: Sort controls */}
      <div className="flex items-center gap-1 w-full lg:w-auto">
        <button
          onClick={() => onSortChange?.(sortBy, sortOrder === "asc" ? "desc" : "asc")}
          className="cursor-pointer flex items-center justify-center w-10 h-10 bg-slate-100 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700/75 rounded-lg transition-colors text-slate-700 dark:text-white dark:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={sortOrder === "asc" ? "Sort ascending" : "Sort descending"}
        >
          <span aria-hidden="true">{sortOrder === "asc" ? "↑" : "↓"}</span>
        </button>
        <div className="relative h-10 flex-1 lg:flex-initial" ref={sortDropdownRef}>
          <button
            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            className="cursor-pointer w-full lg:w-auto flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700/75 rounded-lg text-slate-700 dark:text-white font-medium transition-colors lg:min-w-[160px]  dark:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-expanded={isSortDropdownOpen}
            aria-label={`Sort by ${sortOptions.find((o) => o.value === sortBy)?.label || "Sort"}`}
          >
            <span>{sortOptions.find((o) => o.value === sortBy)?.label || "Sort"}</span>
            <ChevronDown
              className={`w-4 h-4 text-slate-600 dark:text-slate-400 ml-auto transition-transform ${isSortDropdownOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {isSortDropdownOpen && (
            <div className="absolute top-full left-0 lg:left-auto right-0 mt-2 bg-white dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px] overflow-hidden" role="menu">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSortChange?.(option.value);
                    setIsSortDropdownOpen(false);
                  }}
                  className={`cursor-pointer block w-full text-left px-4 py-3 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    sortBy === option.value ? "bg-slate-200 dark:bg-slate-800/50" : ""
                  }`}
                  role="menuitem"
                  aria-label={`Sort by ${option.label}`}
                  aria-current={sortBy === option.value ? "true" : undefined}
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
