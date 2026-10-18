"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type TimelineDisplayKey =
  | "showTickerLabels"
  | "showInterestRates"
  | "showMarketNotes"
  | "openAllMarketNotes"
  | "showTxHashes"
  | "followChart"
  | "figuresFirst";

export interface TimelineDisplayState {
  /** When true, position-snapshot rows show the asset ticker text alongside
   * the icon. Off by default — the icon alone identifies the asset. */
  showTickerLabels: boolean;
  /** When true, event-card headers show the per-event interest-rate badge
   * (Aave supply/borrow APR). Off by default — surfaced on demand. */
  showInterestRates: boolean;
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
  /** "Follows chart", the sync button's lock beside the timeline's Display (ui-jobs
   *  305): the timeline is cut at the Lifetime flows cursor wherever it goes.
   *  Off by default. Set through the page's flow-focus store, which the
   *  timeline and the chart share (`useFollowPreference`). */
  followChart: boolean;
  /** "Figures first" in Display (ui-jobs 370): an opened timeline card opens on
   *  its Figures tab in place of its Explanation. Off by default. Clicking
   *  either tab on any card sets it, so every opened card follows the last
   *  choice. The event page stands both open and ignores it. */
  figuresFirst: boolean;
  toggle: (key: TimelineDisplayKey) => void;
  set: (key: TimelineDisplayKey, value: boolean) => void;
}

const DEFAULTS = {
  showTickerLabels: false,
  showInterestRates: false,
  showMarketNotes: true,
  openAllMarketNotes: false,
  showTxHashes: false,
  followChart: false,
  figuresFirst: false,
};
// A NEW key with a default needs no bump: the provider restores by spreading
// the stored object over DEFAULTS, so a reader whose stored preferences
// predate this key simply keeps the default for it.
const STORAGE_KEY = "timeline-display-v3";

const Ctx = createContext<TimelineDisplayState>({
  ...DEFAULTS,
  toggle: () => {},
  set: () => {},
});

/** A stored preference drops the retired switches: `collapseRuns` (like
 *  events always collapse), `showTimelineValues`
 *  (the spine always carries the values), `showUsdValues`,
 *  `showChangeBars`, `showBalanceBars`, `showEventNumbers`, `showTimestamps`,
 *  `showUsdStable`, `showUsdOther`, `mobileSpine` (the phone's Timeline |
 *  List choice: the spine view is the only phone view),
 *  `showFullBreakdown` (the sheet's breakdown is each card's, ui-jobs 330),
 *  `flowsView` (the Lifetime flows panel draws both strips) and
 *  `showCollateralRatio` (Polaris's row ratio chip, ui-jobs 368). */
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
    showFullBreakdown?: boolean;
    flowsView?: unknown;
    showCollateralRatio?: boolean;
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
    showFullBreakdown,
    flowsView,
    showCollateralRatio,
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

  const set = useCallback((key: TimelineDisplayKey, value: boolean) => {
    setState((prev) => {
      if (prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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

  return <Ctx.Provider value={{ ...state, toggle, set }}>{children}</Ctx.Provider>;
}

export function useTimelineDisplay(): TimelineDisplayState {
  return useContext(Ctx);
}
