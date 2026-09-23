"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type TimelineDisplayKey =
  | "showTimestamps"
  | "showChangeBars"
  | "showBalanceBars"
  | "showTimelineValues"
  | "showTickerLabels"
  | "showUsdValues"
  | "showEventNumbers"
  | "showInterestRates"
  | "showCollateralRatio"
  | "collapseRuns"
  | "showMarketNotes";

export interface TimelineDisplayState {
  showTimestamps: boolean;
  /** Top delta bar: the collateral/debt value transacted in this event. */
  showChangeBars: boolean;
  /** Bottom total bar: the underlying collateral/debt balance after this event. */
  showBalanceBars: boolean;
  /** When true, the SpineColumn surfaces flanking values along the timeline
   * spine and event-card headers hide their amount on desktop to avoid
   * duplication. When false, values move into the card header instead. */
  showTimelineValues: boolean;
  /** When true, position-snapshot rows show the asset ticker text alongside
   * the icon. Off by default — the icon alone identifies the asset. */
  showTickerLabels: boolean;
  /** When true, position-snapshot / simulator rows show the USD-equivalent
   * value next to the asset amount. */
  showUsdValues: boolean;
  /** When true, each timeline row displays its 1-based chronological number —
   * the position in the WHOLE history, not in the drawn list. */
  showEventNumbers: boolean;
  /** When true, event-card headers show the per-event interest-rate badge
   * (Aave supply/borrow APR). Off by default — surfaced on demand. */
  showInterestRates: boolean;
  /** When true, Liquity event-card headers show the trailing collateral-ratio
   * (CR / LTV) chip. Off by default — surfaced on demand. */
  showCollateralRatio: boolean;
  /** When true, consecutive passive/third-party events (liquidation bursts,
   * auction slices, redemption touches) collapse into one expandable run row.
   * On by default — flip it off to flatten runs back to individual cards. */
  collapseRuns: boolean;
  /** When true, receipted market notes (facts about the market observed
   * between two of the account's own events) render between the events they
   * bracket. Off hides every note; nothing else changes. */
  showMarketNotes: boolean;
  toggle: (key: TimelineDisplayKey) => void;
}

const DEFAULTS = {
  showTimestamps: true,
  showChangeBars: false,
  showBalanceBars: false,
  showTimelineValues: true,
  showTickerLabels: false,
  showUsdValues: true,
  showEventNumbers: false,
  showInterestRates: false,
  showCollateralRatio: false,
  collapseRuns: true,
  showMarketNotes: true,
};
// A NEW key with a default needs no bump: the provider restores by spreading
// the stored object over DEFAULTS, so a reader whose stored preferences
// predate this key simply keeps the default for it.
const STORAGE_KEY = "timeline-display-v3";

const Ctx = createContext<TimelineDisplayState>({
  ...DEFAULTS,
  toggle: () => {},
});

export function TimelineDisplayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>;
      setState((s) => ({ ...s, ...parsed }));
    } catch {}
  }, []);

  const toggle = useCallback((key: TimelineDisplayKey) => {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ ...state, toggle }}>{children}</Ctx.Provider>;
}

export function useTimelineDisplay(): TimelineDisplayState {
  return useContext(Ctx);
}
