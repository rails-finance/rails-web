"use client";

import { useState, useEffect, useRef } from "react";

// Three-state filter values
export type FilterState = 'all' | 'hide' | 'only';

// Segmented Control Component
interface SegmentedControlProps {
  label: string;
  value: FilterState;
  onChange: (value: FilterState) => void;
  options: { value: FilterState; label: string }[];
}

function SegmentedControl({ label, value, onChange, options }: SegmentedControlProps) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="flex bg-slate-700 rounded p-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-all ${
              value === option.value
                ? "bg-slate-600 text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-600"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface TroveFilterParams {
  status?: string;
  collateralTypes?: string[];
  ownerEns?: string;
  owner?: string; // Combined field for UI input
  activeWithin?: string;
  createdWithin?: string;

  // Three-state filters
  zombieFilter?: FilterState;
  redemptionFilter?: FilterState;
  batchFilter?: FilterState;

  // Search query
  searchQuery?: string;

  // Legacy closed view filter
  liquidatedOnly?: boolean;

  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface TroveFiltersProps {
  filters: TroveFilterParams;
  onFiltersChange: (filters: TroveFilterParams) => void;
  onReset: () => void;
  currentView: 'open' | 'closed';
  onViewChange: (view: 'open' | 'closed') => void;
  showAllFilters?: boolean;
  onToggleFilters?: () => void;
  isMobile?: boolean;
}

const TIME_OPTIONS = [
  { value: "", label: "All" },
  { value: "86400000", label: "1" },
  { value: "604800000", label: "7" },
  { value: "2592000000", label: "30" },
  { value: "7776000000", label: "90" },
];


export function TroveFilters({
  filters,
  onFiltersChange,
  onReset,
  currentView,
  onViewChange,
  showAllFilters = true,
  onToggleFilters = () => {},
  isMobile = false
}: TroveFiltersProps) {
  const [localFilters, setLocalFilters] = useState<TroveFilterParams>(filters);
  const ownerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);


  useEffect(() => {
    // Cleanup debounce timer on unmount
    return () => {
      if (ownerDebounceRef.current) clearTimeout(ownerDebounceRef.current);
    };
  }, []);

  const handleStatusChange = (status: string) => {
    // If clicking the same status, deselect it
    const newStatus = localFilters.status === status ? undefined : status;
    const newFilters = { ...localFilters, status: newStatus };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleCollateralChange = (collateral: string) => {
    // If clicking the same collateral, deselect it
    const newCollateral = localFilters.collateralType === collateral ? undefined : collateral;
    const newFilters = { ...localFilters, collateralType: newCollateral };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleOwnerAddressChange = (value: string) => {
    // Detect if it's an ENS name or Ethereum address
    const isEns = value && value.toLowerCase().endsWith('.eth');
    const isAddress = value && /^0x[a-fA-F0-9]{40}$/.test(value);

    const newFilters = {
      ...localFilters,
      owner: value || undefined,
      ownerAddress: isAddress ? value : undefined,
      ownerEns: isEns ? value : undefined
    };
    setLocalFilters(newFilters);

    // Clear existing timeout
    if (ownerDebounceRef.current) {
      clearTimeout(ownerDebounceRef.current);
    }

    // Debounce the API call
    ownerDebounceRef.current = setTimeout(() => {
      onFiltersChange(newFilters);
    }, 1000);
  };

  const handleTroveIdChange = (value: string) => {
    const newFilters = { ...localFilters, troveId: value || undefined };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleTimeFilterChange = (field: "activeWithin" | "createdWithin", value: string) => {
    const newFilters = { ...localFilters, [field]: value || undefined };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };


  const handleLiquidatedChange = () => {
    const newStatus = localFilters.liquidatedOnly ? undefined : 'liquidated';
    const newFilters = {
      ...localFilters,
      liquidatedOnly: !localFilters.liquidatedOnly,
      status: newStatus
    };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleThreeStateChange = (filterType: 'zombieFilter' | 'redemptionFilter' | 'batchFilter', value: FilterState) => {
    const newFilters = { ...localFilters, [filterType]: value === 'all' ? undefined : value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };


  const hasActiveFilters = () => {
    return (
      localFilters.zombieFilter ||
      localFilters.redemptionFilter ||
      localFilters.batchFilter ||
      localFilters.liquidatedOnly
    );
  };

  const handleReset = () => {
    setLocalFilters({});
    onReset();
  };


  // Mobile layout
  if (isMobile) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
        {/* Always visible section on mobile */}
        <div className="space-y-4">
          {/* Status Toggle - Full width on mobile */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-300">Status</span>
            <div className="flex gap-1 bg-slate-700 rounded p-1">
              <button
                onClick={() => onViewChange('open')}
                className={`cursor-pointer flex-1 px-4 py-2 text-sm font-semibold rounded transition-all ${
                  currentView === 'open'
                    ? "bg-green-900 text-green-400 shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-slate-600"
                }`}
              >
                ACTIVE
              </button>
              <button
                onClick={() => onViewChange('closed')}
                className={`cursor-pointer flex-1 px-4 py-2 text-sm font-semibold rounded transition-all ${
                  currentView === 'closed'
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-slate-600"
                }`}
              >
                CLOSED
              </button>
            </div>
          </div>

        </div>

        {/* Collapsible advanced filters */}
        {showAllFilters && (
          <div className="space-y-4 pt-4 border-t border-slate-700">
            {/* View-specific filters */}
            {currentView === 'open' && (
              <div className="space-y-3">
                <SegmentedControl
                  label="Redemptions"
                  value={localFilters.redemptionFilter || 'all'}
                  onChange={(value) => handleThreeStateChange('redemptionFilter', value)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'hide', label: 'None' },
                    { value: 'only', label: 'Has' }
                  ]}
                />

                <SegmentedControl
                  label="Trove Type"
                  value={localFilters.batchFilter || 'all'}
                  onChange={(value) => handleThreeStateChange('batchFilter', value)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'hide', label: 'Indiv.' },
                    { value: 'only', label: 'Batch' }
                  ]}
                />

                <SegmentedControl
                  label="Zombie Troves"
                  value={localFilters.zombieFilter || 'all'}
                  onChange={(value) => handleThreeStateChange('zombieFilter', value)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'hide', label: 'Hide' },
                    { value: 'only', label: 'Only' }
                  ]}
                />
              </div>
            )}

            {currentView === 'closed' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={localFilters.liquidatedOnly || false}
                    onChange={handleLiquidatedChange}
                    className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-sm">Liquidated Only</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Toggle button for advanced filters */}
        <button
          onClick={onToggleFilters}
          className="w-full py-2 text-sm text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <span>{showAllFilters ? 'Hide Filters' : 'Show More Filters'}</span>
          <svg
            className={`w-4 h-4 transition-transform ${showAllFilters ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Reset button if filters are active */}
        {hasActiveFilters() && (
          <button
            onClick={handleReset}
            className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-all"
          >
            Reset Filters
          </button>
        )}
      </div>
    );
  }

  // Desktop layout - horizontal for top placement
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300">Status:</span>
          <div className="flex gap-1 bg-slate-700 rounded p-1">
            <button
              onClick={() => onViewChange('open')}
              className={`cursor-pointer px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                currentView === 'open'
                  ? "bg-green-900 text-green-400 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-600"
              }`}
            >
              ACTIVE
            </button>
            <button
              onClick={() => onViewChange('closed')}
              className={`cursor-pointer px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                currentView === 'closed'
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-600"
              }`}
            >
              CLOSED
            </button>
          </div>
        </div>

        {/* View-specific filters */}
        {currentView === 'open' && (
          <>
            {/* Redemptions Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Redemptions:</span>
              <div className="flex bg-slate-700 rounded p-1">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'hide', label: 'None' },
                  { value: 'only', label: 'Has' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThreeStateChange('redemptionFilter', option.value as FilterState)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                      (localFilters.redemptionFilter || 'all') === option.value
                        ? "bg-slate-600 text-white shadow-sm"
                        : "text-slate-300 hover:text-white hover:bg-slate-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Batch/Individual Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Type:</span>
              <div className="flex bg-slate-700 rounded p-1">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'hide', label: 'Individual' },
                  { value: 'only', label: 'Batch' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThreeStateChange('batchFilter', option.value as FilterState)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                      (localFilters.batchFilter || 'all') === option.value
                        ? "bg-slate-600 text-white shadow-sm"
                        : "text-slate-300 hover:text-white hover:bg-slate-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zombie Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Zombie:</span>
              <div className="flex bg-slate-700 rounded p-1">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'hide', label: 'Hide' },
                  { value: 'only', label: 'Only' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThreeStateChange('zombieFilter', option.value as FilterState)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                      (localFilters.zombieFilter || 'all') === option.value
                        ? "bg-slate-600 text-white shadow-sm"
                        : "text-slate-300 hover:text-white hover:bg-slate-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {currentView === 'closed' && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer hover:text-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={localFilters.liquidatedOnly || false}
                onChange={handleLiquidatedChange}
                className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
              />
              <span className="text-xs">Liquidated Only</span>
            </label>
          </div>
        )}

        {/* Reset button */}
        {hasActiveFilters() && (
          <button
            onClick={handleReset}
            className="ml-auto px-4 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs transition-all"
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}
