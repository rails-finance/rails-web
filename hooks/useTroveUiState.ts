"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TransactionUiState = {
  expanded: boolean;
  explanationOpen: boolean;
};

type TroveUiState = {
  hideDelegateRates: boolean;
  hideRedemptions: boolean;
  summaryExplanationOpen: boolean;
  economicsOpen: boolean;
  transactions: Record<string, TransactionUiState>;
};

const DEFAULT_TRANSACTION_STATE: TransactionUiState = {
  expanded: false,
  explanationOpen: false,
};

const DEFAULT_TROVE_STATE: TroveUiState = {
  hideDelegateRates: false,
  hideRedemptions: false,
  summaryExplanationOpen: false,
  economicsOpen: false,
  transactions: {},
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
        const parsed = JSON.parse(raw) as Partial<TroveUiState>;
        setState({
          hideDelegateRates: parsed.hideDelegateRates ?? false,
          hideRedemptions: parsed.hideRedemptions ?? false,
          summaryExplanationOpen: parsed.summaryExplanationOpen ?? false,
          economicsOpen: parsed.economicsOpen ?? false,
          transactions: parsed.transactions ?? {},
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

  const getTransactionState = useCallback(
    (transactionId: string): TransactionUiState => {
      return state.transactions[transactionId] ?? DEFAULT_TRANSACTION_STATE;
    },
    [state.transactions],
  );

  const setSummaryExplanationOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, summaryExplanationOpen: isOpen }));
  }, []);

  const setEconomicsOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, economicsOpen: isOpen }));
  }, []);

  const setHideDelegateRates = useCallback((hide: boolean) => {
    setState((prev) => ({ ...prev, hideDelegateRates: hide }));
  }, []);

  const setHideRedemptions = useCallback((hide: boolean) => {
    setState((prev) => ({ ...prev, hideRedemptions: hide }));
  }, []);

  const setTransactionExpanded = useCallback((transactionId: string, expanded: boolean) => {
    setState((prev) => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        [transactionId]: {
          ...DEFAULT_TRANSACTION_STATE,
          ...prev.transactions[transactionId],
          expanded,
        },
      },
    }));
  }, []);

  const setExplanationOpen = useCallback((transactionId: string, explanationOpen: boolean) => {
    setState((prev) => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        [transactionId]: {
          ...DEFAULT_TRANSACTION_STATE,
          ...prev.transactions[transactionId],
          explanationOpen,
        },
      },
    }));
  }, []);

  const transactions = useMemo(() => state.transactions, [state.transactions]);

  return {
    hideDelegateRates: state.hideDelegateRates,
    hideRedemptions: state.hideRedemptions,
    summaryExplanationOpen: state.summaryExplanationOpen,
    economicsOpen: state.economicsOpen,
    transactions,
    getTransactionState,
    setHideDelegateRates,
    setHideRedemptions,
    setTransactionExpanded,
    setExplanationOpen,
    setSummaryExplanationOpen,
    setEconomicsOpen,
  };
}
