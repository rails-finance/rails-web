"use client";

import { useState, useEffect, useRef } from "react";

export interface TroveFilterParams {
  troveId?: string;
  status?: string;
  collateralType?: string;
  ownerAddress?: string;
  ownerEns?: string;
  owner?: string; // Combined field for UI input
  activeWithin?: string;
  createdWithin?: string;
  troveType?: "batch" | "individual";
  hasRedemptions?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface TroveFiltersProps {
  filters: TroveFilterParams;
  onFiltersChange: (filters: TroveFilterParams) => void;
  onReset: () => void;
}

const TIME_OPTIONS = [
  { value: "", label: "All time" },
  { value: "86400000", label: "Last 24 hours" },
  { value: "604800000", label: "Last 7 days" },
  { value: "2592000000", label: "Last 30 days" },
  { value: "7776000000", label: "Last 90 days" },
];

const SORT_OPTIONS = [
  { value: "lastActivity", label: "Last Activity" },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
  { value: "collUsd", label: "Collateral USD" },
  { value: "ratio", label: "Collateral Ratio" },
  { value: "interestRate", label: "Interest Rate" },
  { value: "created", label: "Created Date" },
  { value: "redemptions", label: "Redemptions" },
  { value: "transactions", label: "Transactions" },
  { value: "peakDebt", label: "Peak Debt" },
  { value: "peakColl", label: "Peak Collateral" },
  { value: "batchRate", label: "Batch Rate" },
  { value: "managementFee", label: "Management Fee" },
];

export function TroveFilters({ filters, onFiltersChange, onReset }: TroveFiltersProps) {
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

  const handleTroveTypeChange = (type: string) => {
    // If clicking the same type, deselect it
    const newType = localFilters.troveType === type ? undefined : (type as "batch" | "individual" | undefined);
    const newFilters = { ...localFilters, troveType: newType };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleRedemptionsChange = () => {
    const newFilters = { ...localFilters, hasRedemptions: !localFilters.hasRedemptions };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleSortChange = (field: "sortBy" | "sortOrder", value: string) => {
    const newFilters = { ...localFilters, [field]: value as any };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const hasActiveFilters = () => {
    return (
      localFilters.troveId ||
      localFilters.status ||
      localFilters.collateralType ||
      localFilters.owner ||
      localFilters.activeWithin ||
      localFilters.createdWithin ||
      localFilters.troveType ||
      localFilters.hasRedemptions ||
      localFilters.sortBy ||
      localFilters.sortOrder !== "desc"
    );
  };

  const handleReset = () => {
    setLocalFilters({});
    onReset();
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
      <div className="space-y-2.5">
        {/* First Row: Status, Collateral, and Trove Type */}
        <div className="flex items-center gap-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Status:</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
                <input
                  type="radio"
                  name="status"
                  checked={!localFilters.status}
                  onChange={() => handleStatusChange("")}
                  className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs">All</span>
              </label>
              {["open", "closed", "liquidated"].map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <input
                    type="radio"
                    name="status"
                    checked={localFilters.status === status}
                    onChange={() => handleStatusChange(status)}
                    className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                  />
                  <span className="text-xs capitalize">{status}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Collateral */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Collateral:</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
                <input
                  type="radio"
                  name="collateral"
                  checked={!localFilters.collateralType}
                  onChange={() => handleCollateralChange("")}
                  className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs">All</span>
              </label>
              {["WETH", "wstETH", "rETH"].map((collateral) => (
                <label
                  key={collateral}
                  className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <input
                    type="radio"
                    name="collateral"
                    checked={localFilters.collateralType === collateral}
                    onChange={() => handleCollateralChange(collateral)}
                    className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                  />
                  <span className="text-xs">{collateral}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Trove Type */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Type:</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
                <input
                  type="radio"
                  name="troveType"
                  checked={!localFilters.troveType}
                  onChange={() => handleTroveTypeChange("")}
                  className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs">All</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
                <input
                  type="radio"
                  name="troveType"
                  checked={localFilters.troveType === "batch"}
                  onChange={() => handleTroveTypeChange("batch")}
                  className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs">Batch</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
                <input
                  type="radio"
                  name="troveType"
                  checked={localFilters.troveType === "individual"}
                  onChange={() => handleTroveTypeChange("individual")}
                  className="bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs">Individual</span>
              </label>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Redemptions */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={localFilters.hasRedemptions || false}
                onChange={handleRedemptionsChange}
                className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
              />
              <span className="text-xs">Has Redemptions</span>
            </label>
          </div>
        </div>

        {/* Second Row: Time and Sort */}
        <div className="flex items-center gap-3">
          {/* Time filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Active:</span>
            <select
              value={localFilters.activeWithin || ""}
              onChange={(e) => handleTimeFilterChange("activeWithin", e.target.value)}
              className="px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 min-w-[100px]"
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Created:</span>
            <select
              value={localFilters.createdWithin || ""}
              onChange={(e) => handleTimeFilterChange("createdWithin", e.target.value)}
              className="px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 min-w-[100px]"
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by:</span>
            <select
              value={localFilters.sortBy || "lastActivity"}
              onChange={(e) => handleSortChange("sortBy", e.target.value)}
              className="px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 min-w-[120px]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={localFilters.sortOrder || "desc"}
              onChange={(e) => handleSortChange("sortOrder", e.target.value)}
              className="px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 min-w-[100px]"
            >
              <option value="desc">↓ Newest first</option>
              <option value="asc">↑ Oldest first</option>
            </select>
          </div>
        </div>

        {/* Third Row: Trove ID, Owner Address and Clear */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Trove ID:</span>
            <input
              type="text"
              value={localFilters.troveId || ""}
              onChange={(e) => handleTroveIdChange(e.target.value)}
              placeholder="Enter trove ID..."
              className="px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 w-[200px]"
            />
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-slate-500">Owner:</span>
            <input
              type="text"
              value={localFilters.owner || ""}
              onChange={(e) => handleOwnerAddressChange(e.target.value)}
              placeholder="Enter address (0x...) or ENS name (.eth)"
              className="flex-1 px-2 py-1 bg-slate-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 max-w-[300px]"
            />
          </div>

          {/* Clear All */}
          {hasActiveFilters() && (
            <>
              <div className="h-4 w-px bg-slate-700" />
              <button
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 hover:bg-slate-700 rounded"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
