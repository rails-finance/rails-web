"use client";

// One CDP's remembered UI state — today exactly one field: whether the
// position card's Explanation pane was left open.
//
// Polaris's timeline persists its filters for itself under
// `polaris-<market>-<cdpId>` (useTimelineEvents, wired in position-view.tsx),
// and a second writer for the same facts is how the two drift apart. So this
// hook owns the one thing nothing else stores. A card that adopts the
// closed/opened disclosure (ui-jobs 209) remembers its Explanation in the
// disclosure's store instead (components/shared/position-card-disclosure.tsx),
// and this hook goes with it.
//
// The key joins the `rails-ui-` family every explorer's UI state lives in
// (`rails-ui-aave-v4-<wallet>` on V4) and is per CDP, because the pane's usefulness is per position: a reader who opened the
// explanation on a CDP they are studying should not have it forced open on
// every other CDP they glance at.
//
// The load runs after mount, never during render, and the first write is
// gated on `hasHydrated` — without that gate the default state would be
// written over the stored one on the very first effect pass, and the pane
// would forget on every reload. Storage is wrapped in try/catch throughout:
// a browser with site data blocked must cost the reader a remembered pane,
// not the page.

import { useCallback, useEffect, useState } from "react";

interface PolarisUiState {
  /** The position card's Explanation pane, left open by the reader. */
  explanationOpen: boolean;
}

const DEFAULT_STATE: PolarisUiState = { explanationOpen: false };

const storageKey = (cdpKey: string) => `rails-ui-polaris-${cdpKey}`;

export function usePolarisUiState(cdpKey?: string) {
  const [state, setState] = useState<PolarisUiState>(DEFAULT_STATE);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (!cdpKey) return;
    setHasHydrated(false);
    setState(DEFAULT_STATE);
    try {
      const raw = localStorage.getItem(storageKey(cdpKey));
      const parsed = raw ? (JSON.parse(raw) as Partial<PolarisUiState>) : null;
      setState({ explanationOpen: parsed?.explanationOpen === true });
    } catch (err) {
      console.error("Failed to load Polaris UI state", err);
      setState(DEFAULT_STATE);
    } finally {
      setHasHydrated(true);
    }
  }, [cdpKey]);

  useEffect(() => {
    if (!cdpKey || !hasHydrated) return;
    try {
      localStorage.setItem(storageKey(cdpKey), JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save Polaris UI state", err);
    }
  }, [state, cdpKey, hasHydrated]);

  const setExplanationOpen = useCallback((isOpen: boolean) => {
    setState((prev) => (prev.explanationOpen === isOpen ? prev : { ...prev, explanationOpen: isOpen }));
  }, []);

  return { explanationOpen: state.explanationOpen, hasHydrated, setExplanationOpen };
}
