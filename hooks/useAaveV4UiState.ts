"use client";

// Per-wallet UI state for /aave-v4/[wallet]. Mirrors useTroveUiState's
// localStorage-keyed pattern so that filter / sort / heatmap-range
// preferences persist across reloads on a per-wallet basis.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HIDDEN_ACTIONS } from "@/lib/shared/event-filter-helpers";

type AaveV4UiState = {
  hiddenActions: string[];
  /** Date range filter [startUnix, endUnix], null when off. */
  dateRange: [number, number] | null;
  /** Whether the heatmap visualisation is open under the timeline header. */
  heatmapOpen: boolean;
  /** Selected spoke name for the position card + activity scope. null lets
   *  the page auto-pick the most active open spoke once events arrive. */
  selectedSpoke: string | null;
};

const DEFAULT_HIDDEN_FOR_AAVE = DEFAULT_HIDDEN_ACTIONS["aave-v4"] ?? [];

const DEFAULT_STATE: AaveV4UiState = {
  hiddenActions: [...DEFAULT_HIDDEN_FOR_AAVE],
  dateRange: null,
  heatmapOpen: false,
  selectedSpoke: null,
};

const storageKey = (wallet: string) => `rails-ui-aave-v4-${wallet.toLowerCase()}`;

export function useAaveV4UiState(wallet?: string) {
  const [state, setState] = useState<AaveV4UiState>(DEFAULT_STATE);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    setHasHydrated(false);
    setState(DEFAULT_STATE);
    try {
      const raw = localStorage.getItem(storageKey(wallet));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AaveV4UiState>;
        setState({
          hiddenActions: Array.isArray(parsed.hiddenActions) ? parsed.hiddenActions : [...DEFAULT_HIDDEN_FOR_AAVE],
          // Date range only restored if both endpoints look sane (positive
          // unix seconds) — guards against a partial / corrupted state.
          dateRange:
            Array.isArray(parsed.dateRange) &&
            parsed.dateRange.length === 2 &&
            parsed.dateRange.every((n) => typeof n === "number" && n > 0)
              ? (parsed.dateRange as [number, number])
              : null,
          heatmapOpen: parsed.heatmapOpen ?? false,
          selectedSpoke: typeof parsed.selectedSpoke === "string" ? parsed.selectedSpoke : null,
        });
      }
    } catch (err) {
      console.error("Failed to load aave-v4 UI state", err);
      setState(DEFAULT_STATE);
    } finally {
      setHasHydrated(true);
    }
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !hasHydrated) return;
    try {
      localStorage.setItem(storageKey(wallet), JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save aave-v4 UI state", err);
    }
  }, [state, wallet, hasHydrated]);

  const setHiddenActions = useCallback((next: string[]) => {
    setState((prev) => ({ ...prev, hiddenActions: next }));
  }, []);

  const toggleHiddenAction = useCallback((action: string) => {
    setState((prev) => {
      const set = new Set(prev.hiddenActions);
      if (set.has(action)) set.delete(action);
      else set.add(action);
      return { ...prev, hiddenActions: [...set] };
    });
  }, []);

  const setDateRange = useCallback((range: [number, number] | null) => {
    setState((prev) => ({ ...prev, dateRange: range }));
  }, []);

  const setHeatmapOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, heatmapOpen: open }));
  }, []);

  const setSelectedSpoke = useCallback((spoke: string | null) => {
    setState((prev) => ({ ...prev, selectedSpoke: spoke }));
  }, []);

  return {
    hiddenActions: state.hiddenActions,
    dateRange: state.dateRange,
    heatmapOpen: state.heatmapOpen,
    selectedSpoke: state.selectedSpoke,
    hasHydrated,
    setHiddenActions,
    toggleHiddenAction,
    setDateRange,
    setHeatmapOpen,
    setSelectedSpoke,
  };
}
