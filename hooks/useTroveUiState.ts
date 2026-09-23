"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HIDDEN_ACTIONS } from "@/lib/shared/event-filter-helpers";

type TroveUiState = {
  /** Action keys (Liquity operation IDs) hidden from the timeline. */
  hiddenActions: string[];
  summaryExplanationOpen: boolean;
  economicsOpen: boolean;
};

const DEFAULT_HIDDEN_FOR_TROVE = DEFAULT_HIDDEN_ACTIONS["liquity-v2-troves"] ?? [];

const DEFAULT_TROVE_STATE: TroveUiState = {
  hiddenActions: [...DEFAULT_HIDDEN_FOR_TROVE],
  summaryExplanationOpen: false,
  economicsOpen: false,
};

const storageKey = (troveKey: string) => `rails-ui-${troveKey}`;

export function useTroveUiState(troveKey?: string) {
  const [state, setState] = useState<TroveUiState>(DEFAULT_TROVE_STATE);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Load persisted state per trove
  useEffect(() => {
    if (!troveKey) return;
    setHasHydrated(false);
    setState(DEFAULT_TROVE_STATE);

    try {
      const raw = localStorage.getItem(storageKey(troveKey));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TroveUiState> & {
          // legacy fields, migrated below
          hideDelegateRates?: boolean;
          hideRedemptions?: boolean;
        };
        // Migrate legacy boolean toggles into the unified hiddenActions list.
        const migrated = new Set<string>(
          Array.isArray(parsed.hiddenActions) ? parsed.hiddenActions : DEFAULT_HIDDEN_FOR_TROVE,
        );
        if (parsed.hideDelegateRates) migrated.add("setBatchManagerAnnualInterestRate");
        if (parsed.hideRedemptions) migrated.add("redeemCollateral");
        setState({
          hiddenActions: [...migrated],
          summaryExplanationOpen: parsed.summaryExplanationOpen ?? false,
          economicsOpen: parsed.economicsOpen ?? false,
        });
      } else {
        setState(DEFAULT_TROVE_STATE);
      }
    } catch (err) {
      console.error("Failed to load trove UI state", err);
      setState(DEFAULT_TROVE_STATE);
    } finally {
      setHasHydrated(true);
    }
  }, [troveKey]);

  // Persist state after hydration
  useEffect(() => {
    if (!troveKey || !hasHydrated) return;
    try {
      localStorage.setItem(storageKey(troveKey), JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save trove UI state", err);
    }
  }, [state, troveKey, hasHydrated]);

  const setSummaryExplanationOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, summaryExplanationOpen: isOpen }));
  }, []);

  const setEconomicsOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, economicsOpen: isOpen }));
  }, []);

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

  return {
    hiddenActions: state.hiddenActions,
    summaryExplanationOpen: state.summaryExplanationOpen,
    economicsOpen: state.economicsOpen,
    setHiddenActions,
    toggleHiddenAction,
    setSummaryExplanationOpen,
    setEconomicsOpen,
  };
}
