"use client";

import { useState, useRef, useEffect } from "react";
import { Filter, ChevronDown, Check, Minus } from "lucide-react";

export type FilterState = 'all' | 'only' | 'hide';

export interface UnifiedFilters {
  // Status
  status?: 'open' | 'closed' | 'both';

  // Collateral types (multi-select)
  collateralTypes?: string[];

  // Three-state filters
  redemptionFilter?: FilterState;
  batchFilter?: FilterState;
  zombieFilter?: FilterState;

  // Search query
  searchQuery?: string;
}

interface UnifiedFiltersProps {
  filters: UnifiedFilters;
  onFiltersChange: (filters: UnifiedFilters) => void;
  availableCollateralTypes?: string[];
  showStatusToggle?: boolean;
  showCollateralFilter?: boolean;
  showAdvancedFilters?: boolean;
}

export function UnifiedFiltersDropdown({
  filters,
  onFiltersChange,
  availableCollateralTypes = [],
  showStatusToggle = true,
  showCollateralFilter = true,
  showAdvancedFilters = true,
  keepOpen = false
}: UnifiedFiltersProps & { keepOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCollateralType = (type: string) => {
    const current = filters.collateralTypes || [];
    const newTypes = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];

    onFiltersChange({
      ...filters,
      collateralTypes: newTypes
    });
  };

  const cycleThreeState = (filterKey: 'redemptionFilter' | 'batchFilter' | 'zombieFilter') => {
    const states: FilterState[] = ['all', 'only', 'hide'];
    const currentValue = filters[filterKey] || 'all';
    const currentIndex = states.indexOf(currentValue);
    const nextValue = states[(currentIndex + 1) % states.length];

    onFiltersChange({
      ...filters,
      [filterKey]: nextValue === 'all' ? undefined : nextValue
    });
  };

  const getThreeStateIcon = (state: FilterState | undefined) => {
    if (!state || state === 'all') {
      return <div className="w-4 h-4 border border-slate-500 rounded" />;
    } else if (state === 'only') {
      return (
        <div className="w-4 h-4 border border-blue-500 bg-blue-500 rounded flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      );
    } else {
      return (
        <div className="w-4 h-4 border border-red-500 bg-red-500 rounded flex items-center justify-center">
          <Minus className="w-3 h-3 text-white" />
        </div>
      );
    }
  };

  const getActiveFilterCount = () => {
    let count = 0;

    // Count selected collateral types
    if (filters.collateralTypes && filters.collateralTypes.length > 0) {
      count++;
    }

    // Count three-state filters
    if (filters.redemptionFilter && filters.redemptionFilter !== 'all') count++;
    if (filters.batchFilter && filters.batchFilter !== 'all') count++;
    if (filters.zombieFilter && filters.zombieFilter !== 'all') count++;

    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  const getFilterSummary = () => {
    // Simple approach: just show "Filter" or "Filters" based on count
    if (activeFilterCount > 0) {
      return `Filter${activeFilterCount > 1 ? 's' : ''}`;
    }
    return 'Filters';
  };

  const resetFilters = () => {
    onFiltersChange({
      status: filters.status,
      collateralTypes: undefined,
      redemptionFilter: undefined,
      batchFilter: undefined,
      zombieFilter: undefined
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
      >
        <Filter className="w-4 h-4 text-slate-400" />
        <span>
          {getFilterSummary()}
          {activeFilterCount > 0 && (
            <span className="text-slate-400 ml-1">({activeFilterCount})</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[280px] max-h-[400px] overflow-y-auto">
          {/* Status Toggle */}
          {showStatusToggle && (
            <div className="p-3 border-b border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Status</div>
              <div className="flex bg-slate-900 rounded-lg p-1">
                <button
                  onClick={() => onFiltersChange({ ...filters, status: 'open' })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'open'
                      ? 'bg-green-900 text-green-400 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => onFiltersChange({ ...filters, status: 'closed' })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'closed'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Closed
                </button>
                <button
                  onClick={() => onFiltersChange({ ...filters, status: 'both' })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'both' || !filters.status
                      ? 'bg-blue-900 text-blue-400 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>
          )}

          {/* Collateral Types */}
          {showCollateralFilter && availableCollateralTypes.length > 0 && (
            <div className="p-3 border-b border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Collateral</div>
                <button
                  onClick={() => {
                    const allSelected = filters.collateralTypes?.length === availableCollateralTypes.length ||
                                       !filters.collateralTypes;
                    onFiltersChange({
                      ...filters,
                      collateralTypes: allSelected ? [] : availableCollateralTypes
                    });
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {filters.collateralTypes?.length === availableCollateralTypes.length ? 'Clear All' :
                   !filters.collateralTypes || filters.collateralTypes.length === 0 ? 'Select All' :
                   'Select All'}
                </button>
              </div>
              <div className="space-y-2">
                {availableCollateralTypes.map(type => {
                  const isSelected = filters.collateralTypes?.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleCollateralType(type)}
                      className="flex items-center gap-3 w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded transition-colors"
                    >
                      <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-slate-500'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-white">{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="p-3 border-b border-slate-700">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Advanced Filters</div>
              <div className="space-y-2">
                {/* Redemptions Filter */}
                <button
                  onClick={() => cycleThreeState('redemptionFilter')}
                  className="flex items-center gap-3 w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded transition-colors"
                >
                  {getThreeStateIcon(filters.redemptionFilter)}
                  <span className="text-white">
                    {filters.redemptionFilter === 'only' ? 'Has Redemptions' :
                     filters.redemptionFilter === 'hide' ? 'No Redemptions' :
                     'All (Redemptions)'}
                  </span>
                </button>

                {/* Batch Filter */}
                <button
                  onClick={() => cycleThreeState('batchFilter')}
                  className="flex items-center gap-3 w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded transition-colors"
                >
                  {getThreeStateIcon(filters.batchFilter)}
                  <span className="text-white">
                    {filters.batchFilter === 'only' ? 'Batch Only' :
                     filters.batchFilter === 'hide' ? 'Individual Only' :
                     'All (Type)'}
                  </span>
                </button>

                {/* Zombie Filter - only show for open status */}
                {filters.status === 'open' && (
                  <button
                    onClick={() => cycleThreeState('zombieFilter')}
                    className="flex items-center gap-3 w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded transition-colors"
                  >
                    {getThreeStateIcon(filters.zombieFilter)}
                    <span className="text-white">
                      {filters.zombieFilter === 'only' ? 'Zombies Only' :
                       filters.zombieFilter === 'hide' ? 'Hide Zombies' :
                       'All (Zombies)'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reset Filters */}
          {activeFilterCount > 0 && (
            <div className="p-3">
              <button
                onClick={resetFilters}
                className="w-full px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}