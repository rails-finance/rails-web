"use client";

import { useState, useRef, useEffect } from "react";
import { Filter, ChevronDown, Check } from "lucide-react";

export type RedemptionState = 'all' | 'with' | 'without';
export type TypeState = 'all' | 'batch' | 'individual';
export type HealthState = 'all' | 'zombies' | 'healthy';
export type StatusState = 'all' | 'active' | 'closed';

export interface UnifiedFilters {
  // Status
  status?: StatusState;

  // Collateral types (multi-select)
  collateralTypes?: string[];

  // Segmented filters
  redemptionFilter?: RedemptionState;
  typeFilter?: TypeState;
  healthFilter?: HealthState;

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


  const getActiveFilterCount = () => {
    let count = 0;

    // Don't count collateral types - they're more of a data source selector than a filter

    // Count segmented filters
    if (filters.status && filters.status !== 'all') count++;
    if (filters.redemptionFilter && filters.redemptionFilter !== 'all') count++;
    if (filters.typeFilter && filters.typeFilter !== 'all') count++;
    // Only count health filter if status is active (when it's visible)
    if (filters.status === 'active' && filters.healthFilter && filters.healthFilter !== 'all') count++;

    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  const getFilterSummary = () => {
    // Simple approach: just show "Filter" or "Filters" based on count
    if (activeFilterCount > 0) {
      return `Filter${activeFilterCount > 1 ? 's' : ''}`;
    }
    return '';
  };

  const resetFilters = () => {
    onFiltersChange({
      status: 'all',
      collateralTypes: undefined,
      redemptionFilter: undefined,
      typeFilter: undefined,
      healthFilter: undefined
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center gap-2 px-4 h-10 py-2 bg-slate-900 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
      >
        <Filter className="w-4 h-4 text-slate-400" />
        {activeFilterCount > 0 && (
          <span className="px-2 py-0.5 bg-slate-600 rounded-full text-xs text-slate-200">{activeFilterCount}</span>
        )}
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
                  onClick={() => onFiltersChange({ ...filters, status: 'all', healthFilter: undefined })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'all' || !filters.status
                      ? 'bg-blue-900 text-blue-400 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => onFiltersChange({ ...filters, status: 'active' })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'active'
                      ? 'bg-green-900 text-green-400 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => onFiltersChange({ ...filters, status: 'closed', healthFilter: undefined })}
                  className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                    filters.status === 'closed'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Closed
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
            <div className="p-3 border-b border-slate-700 space-y-3">
              {/* Redemptions Filter */}
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Redemptions</div>
                <div className="flex bg-slate-900 rounded-lg p-1">
                  <button
                    onClick={() => onFiltersChange({ ...filters, redemptionFilter: 'all' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.redemptionFilter === 'all' || !filters.redemptionFilter
                        ? 'bg-blue-900 text-blue-400 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => onFiltersChange({ ...filters, redemptionFilter: 'with' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.redemptionFilter === 'with'
                        ? 'bg-orange-900 text-orange-400 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    With
                  </button>
                  <button
                    onClick={() => onFiltersChange({ ...filters, redemptionFilter: 'without' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.redemptionFilter === 'without'
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Without
                  </button>
                </div>
              </div>

              {/* Interest Rate Management Filter */}
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Interest Rate Management</div>
                <div className="flex bg-slate-900 rounded-lg p-1">
                  <button
                    onClick={() => onFiltersChange({ ...filters, typeFilter: 'all' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.typeFilter === 'all' || !filters.typeFilter
                        ? 'bg-blue-900 text-blue-400 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => onFiltersChange({ ...filters, typeFilter: 'batch' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.typeFilter === 'batch'
                        ? 'bg-purple-900 text-purple-400 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Delegated
                  </button>
                  <button
                    onClick={() => onFiltersChange({ ...filters, typeFilter: 'individual' })}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                      filters.typeFilter === 'individual'
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Individual
                  </button>
                </div>
              </div>

              {/* Health Filter - only show for active status */}
              {filters.status === 'active' && (
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Health</div>
                  <div className="flex bg-slate-900 rounded-lg p-1">
                    <button
                      onClick={() => onFiltersChange({ ...filters, healthFilter: 'all' })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        filters.healthFilter === 'all' || !filters.healthFilter
                          ? 'bg-blue-900 text-blue-400 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => onFiltersChange({ ...filters, healthFilter: 'zombies' })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        filters.healthFilter === 'zombies'
                          ? 'bg-red-900 text-red-400 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Zombies
                    </button>
                    <button
                      onClick={() => onFiltersChange({ ...filters, healthFilter: 'healthy' })}
                      className={`flex-1 px-3 py-1.5 rounded text-sm transition-all ${
                        filters.healthFilter === 'healthy'
                          ? 'bg-green-900 text-green-400 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Healthy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset Filters */}
          {activeFilterCount > 0 && (
            <div className="p-3">
              <button
                onClick={resetFilters}
                className="cursor-pointer w-full px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors"
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