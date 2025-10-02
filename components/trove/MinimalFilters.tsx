"use client";

import { FilterState } from "./TroveFilters";

interface MinimalFiltersProps {
  filters: any;
  onFiltersChange: (filters: any) => void;
  currentView: "open" | "closed";
  onViewChange: (view: "open" | "closed") => void;
  onReset: () => void;
}

export function MinimalFilters({ filters, onFiltersChange, currentView, onViewChange, onReset }: MinimalFiltersProps) {
  // Cycle through three states
  const cycleThreeState = (
    filterKey: "redemptionFilter" | "batchFilter" | "zombieFilter",
    currentValue: FilterState | undefined,
  ) => {
    const states: FilterState[] = ["all", "hide", "only"];
    const currentIndex = states.indexOf(currentValue || "all");
    const nextIndex = (currentIndex + 1) % states.length;
    const nextValue = states[nextIndex];

    onFiltersChange({
      ...filters,
      [filterKey]: nextValue === "all" ? undefined : nextValue,
    });
  };

  // Get display text for filter pills
  const getFilterPillText = (filterKey: string, value: FilterState | undefined) => {
    if (!value || value === "all") return null;

    switch (filterKey) {
      case "redemptionFilter":
        return value === "hide" ? "No Redemptions" : "Has Redemptions";
      case "batchFilter":
        return value === "hide" ? "Individual Only" : "Batch Only";
      case "zombieFilter":
        return value === "hide" ? "Hide Zombies" : "Zombies Only";
      default:
        return null;
    }
  };

  const hasActiveFilters = () => {
    return filters.redemptionFilter || filters.batchFilter || filters.zombieFilter || filters.liquidatedOnly;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* Status toggle - always visible */}
      <div className="flex">
        <button
          onClick={() => onViewChange("open")}
          className={`px-3 py-1 rounded-l transition-all ${
            currentView === "open"
              ? "bg-green-900 text-green-400 font-semibold"
              : "bg-slate-700 text-slate-400 hover:text-white"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => onViewChange("closed")}
          className={`px-3 py-1 rounded-r transition-all ${
            currentView === "closed"
              ? "bg-slate-900 text-white font-semibold"
              : "bg-slate-700 text-slate-400 hover:text-white"
          }`}
        >
          Closed
        </button>
      </div>

      {/* Separator */}
      <span className="text-slate-600 hidden md:inline"></span>

      {/* Filter pills - Desktop */}
      <div className="flex items-center gap-2">
        {currentView === "open" && (
          <>
            {/* Redemption Filter */}
            <button
              onClick={() => cycleThreeState("redemptionFilter", filters.redemptionFilter)}
              className={`px-3 py-1 rounded transition-all ${
                filters.redemptionFilter && filters.redemptionFilter !== "all"
                  ? "bg-blue-900 text-blue-400"
                  : "bg-slate-700 text-slate-400 hover:text-white"
              }`}
              title="Click to cycle: All → No Redemptions → Has Redemptions"
            >
              {getFilterPillText("redemptionFilter", filters.redemptionFilter) || "Redemptions: All"}
            </button>

            {/* Batch Filter */}
            <button
              onClick={() => cycleThreeState("batchFilter", filters.batchFilter)}
              className={`px-3 py-1 rounded transition-all ${
                filters.batchFilter && filters.batchFilter !== "all"
                  ? "bg-purple-900 text-purple-400"
                  : "bg-slate-700 text-slate-400 hover:text-white"
              }`}
              title="Click to cycle: All → Individual → Batch"
            >
              {getFilterPillText("batchFilter", filters.batchFilter) || "Type: All"}
            </button>

            {/* Zombie Filter */}
            <button
              onClick={() => cycleThreeState("zombieFilter", filters.zombieFilter)}
              className={`px-3 py-1 rounded transition-all ${
                filters.zombieFilter && filters.zombieFilter !== "all"
                  ? "bg-orange-900 text-orange-400"
                  : "bg-slate-700 text-slate-400 hover:text-white"
              }`}
              title="Click to cycle: All → Hide Zombies → Zombies Only"
            >
              {getFilterPillText("zombieFilter", filters.zombieFilter) || "Zombies: All"}
            </button>
          </>
        )}

        {currentView === "closed" && (
          <button
            onClick={() => onFiltersChange({ ...filters, liquidatedOnly: !filters.liquidatedOnly })}
            className={`px-3 py-1 rounded transition-all ${
              filters.liquidatedOnly ? "bg-red-900 text-red-400" : "bg-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            {filters.liquidatedOnly ? "Liquidated Only" : "All Closed"}
          </button>
        )}
      </div>

      {/* Reset button - only show when filters active */}
      {hasActiveFilters() && (
        <button
          onClick={onReset}
          className="px-2 py-1 bg-red-900/50 hover:bg-red-900 text-red-400 rounded transition-all ml-auto"
          title="Reset all filters"
        >
          <span className="hidden md:inline">Reset</span>
          <span className="md:hidden">✕</span>
        </button>
      )}
    </div>
  );
}
