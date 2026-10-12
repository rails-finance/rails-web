"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type TimelineDisplayKey =
  | "showTickerLabels"
  | "showInterestRates"
  | "showCollateralRatio"
  | "showMarketNotes"
  | "openAllMarketNotes"
  | "showTxHashes";

export interface TimelineDisplayState {
  /** When true, position-snapshot rows show the asset ticker text alongside
   * the icon. Off by default — the icon alone identifies the asset. */
  showTickerLabels: boolean;
  /** When true, event-card headers show the per-event interest-rate badge
   * (Aave supply/borrow APR). Off by default — surfaced on demand. */
  showInterestRates: boolean;
  /** When true, Polaris event-card headers show the trailing collateral-ratio
   * chip. Off by default — surfaced on demand. */
  showCollateralRatio: boolean;
  /** "Market notes" in Display. When true, receipted market notes
   * (facts about the market observed between two of the account's own events)
   * stand on the spine between the events they bracket, each as a marker that
   * opens its note (rails-ops TO-DO-ui-jobs item 118). Off hides every note;
   * nothing else changes. */
  showMarketNotes: boolean;
  /** "Open all market notes" in Display: every note shows its header row in
   * place of its marker. No effect while `showMarketNotes` is off. */
  openAllMarketNotes: boolean;
  /** "Transaction hashes" in Display (ui-jobs 294): each timeline card's
   *  number pill shows its transaction's short hash in place of the number.
   *  Off by default. The event page's pill keeps the number. */
  showTxHashes: boolean;
  toggle: (key: TimelineDisplayKey) => void;
}

const DEFAULTS = {
  showTickerLabels: false,
  showInterestRates: false,
  showCollateralRatio: false,
  showMarketNotes: true,
  openAllMarketNotes: false,
  showTxHashes: false,
};
// A NEW key with a default needs no bump: the provider restores by spreading
// the stored object over DEFAULTS, so a reader whose stored preferences
// predate this key simply keeps the default for it.
const STORAGE_KEY = "timeline-display-v3";

const Ctx = createContext<TimelineDisplayState>({
  ...DEFAULTS,
  toggle: () => {},
});

/** A stored preference drops the retired switches: `collapseRuns` (like
 *  events always collapse), `showTimelineValues`
 *  (the spine always carries the values), `showUsdValues`,
 *  `showChangeBars`, `showBalanceBars`, `showEventNumbers`, `showTimestamps`,
 *  `showUsdStable`, `showUsdOther` and `mobileSpine` (the phone's Timeline |
 *  List choice: the spine view is the only phone view). */
function migrate(
  parsed: Partial<typeof DEFAULTS> & {
    showUsdValues?: boolean;
    showChangeBars?: boolean;
    showBalanceBars?: boolean;
    showEventNumbers?: boolean;
    showTimestamps?: boolean;
    showUsdStable?: boolean;
    showUsdOther?: boolean;
    mobileSpine?: boolean;
    showTimelineValues?: boolean;
    collapseRuns?: boolean;
  },
): Partial<typeof DEFAULTS> {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    showUsdValues,
    showChangeBars,
    showBalanceBars,
    showEventNumbers,
    showTimestamps,
    showUsdStable,
    showUsdOther,
    mobileSpine,
    showTimelineValues,
    collapseRuns,
    ...rest
  } = parsed;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return rest;
}

export function TimelineDisplayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = migrate(JSON.parse(raw) as Partial<typeof DEFAULTS> & { showUsdValues?: boolean });
        setState((s) => ({ ...s, ...parsed }));
      }
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
