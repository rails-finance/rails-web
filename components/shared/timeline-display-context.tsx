"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usdShown } from "@/lib/shared/usd-display";

export type TimelineDisplayKey =
  | "showTimestamps"
  | "showTimelineValues"
  | "showTickerLabels"
  | "showUsdStable"
  | "showUsdOther"
  | "showEventNumbers"
  | "showInterestRates"
  | "showCollateralRatio"
  | "collapseRuns"
  | "showMarketNotes"
  | "openAllMarketNotes";

export interface TimelineDisplayState {
  showTimestamps: boolean;
  /** When true, the SpineColumn surfaces flanking values along the timeline
   * spine and event-card headers hide their amount on desktop to avoid
   * duplication. When false, values move into the card header instead. */
  showTimelineValues: boolean;
  /** When true, position-snapshot rows show the asset ticker text alongside
   * the icon. Off by default — the icon alone identifies the asset. */
  showTickerLabels: boolean;
  /** "USD for stablecoins" in Display: a stablecoin's amount shows its USD
   * value. Off by default; a stablecoin more than 1% off $1 at the event
   * shows it anyway (lib/shared/usd-display.ts). */
  showUsdStable: boolean;
  /** "USD for other tokens" in Display: every other amount shows its USD
   * value. On by default. A page without the stablecoin switch follows this
   * one for every amount. */
  showUsdOther: boolean;
  /** The page's Display menu offers the two USD switches. */
  usdSplit: boolean;
  /** When true, each timeline row displays its 1-based chronological number —
   * the position in the WHOLE history, not in the drawn list. */
  showEventNumbers: boolean;
  /** When true, event-card headers show the per-event interest-rate badge
   * (Aave supply/borrow APR). Off by default — surfaced on demand. */
  showInterestRates: boolean;
  /** When true, Polaris event-card headers show the trailing collateral-ratio
   * chip. Off by default — surfaced on demand. */
  showCollateralRatio: boolean;
  /** When true, consecutive passive/third-party events (liquidation bursts,
   * auction slices, redemption touches) collapse into one expandable run row.
   * On by default — flip it off to flatten runs back to individual cards. */
  collapseRuns: boolean;
  /** "Market notes" in Display. When true, receipted market notes
   * (facts about the market observed between two of the account's own events)
   * stand on the spine between the events they bracket, each as a marker that
   * opens its note (rails-ops TO-DO-ui-jobs item 118). Off hides every note;
   * nothing else changes. */
  showMarketNotes: boolean;
  /** "Open all market notes" in Display: every note shows its header row in
   * place of its marker. No effect while `showMarketNotes` is off. */
  openAllMarketNotes: boolean;
  /** The reader's saved phone view: true for the spine view (the phone's
   *  "Timeline | List" switch), false for the list. Read only on a phone, on
   *  a page whose timeline opted in (components/shared/mobile-spine.tsx). */
  mobileSpine: boolean;
  /** The view this page shows: `?timeline=spine` or `?timeline=list` when the
   *  URL names one, the saved `mobileSpine` otherwise. */
  spineView: boolean;
  toggle: (key: TimelineDisplayKey) => void;
  /** The switch: saves the choice and drops any `?timeline=` override. */
  setSpineView: (on: boolean) => void;
}

const DEFAULTS = {
  showTimestamps: true,
  showTimelineValues: true,
  showTickerLabels: false,
  showUsdStable: false,
  showUsdOther: true,
  showEventNumbers: false,
  showInterestRates: false,
  showCollateralRatio: false,
  collapseRuns: true,
  showMarketNotes: true,
  openAllMarketNotes: false,
  mobileSpine: false,
};
// A NEW key with a default needs no bump: the provider restores by spreading
// the stored object over DEFAULTS, so a reader whose stored preferences
// predate this key simply keeps the default for it.
const STORAGE_KEY = "timeline-display-v3";

// Without a provider (a position card, a listing) every USD value shows, as
// no Display menu governs it.
const Ctx = createContext<TimelineDisplayState>({
  ...DEFAULTS,
  showUsdStable: true,
  usdSplit: false,
  spineView: false,
  toggle: () => {},
  setSpineView: () => {},
});

/** `?timeline=spine` → true, `?timeline=list` → false, anything else → null. */
function urlSpineView(): boolean | null {
  const v = new URLSearchParams(window.location.search).get("timeline");
  return v === "spine" ? true : v === "list" ? false : null;
}

/** Keeps `<html data-timeline-view>` on the view in force. The inline script
 *  in app/layout.tsx sets it before first paint from the same two sources, so
 *  CSS can hold back an opted-in list until the spine view replaces it
 *  (app/globals.css). */
function markSpineView(on: boolean) {
  const d = document.documentElement.dataset;
  if (on) d.timelineView = "spine";
  else delete d.timelineView;
}

/** A stored preference from before the two USD switches: a reader who hid
 *  every USD value ("USD values" off) keeps both off. The retired bar
 *  switches (`showChangeBars`, `showBalanceBars`) are dropped. */
function migrate(
  parsed: Partial<typeof DEFAULTS> & { showUsdValues?: boolean; showChangeBars?: boolean; showBalanceBars?: boolean },
): Partial<typeof DEFAULTS> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showUsdValues, showChangeBars, showBalanceBars, ...rest } = parsed;
  if (showUsdValues === false && rest.showUsdOther === undefined)
    return { ...rest, showUsdOther: false, showUsdStable: false };
  return rest;
}

export function TimelineDisplayProvider({
  children,
  usdSplit = false,
}: {
  children: ReactNode;
  /** The page's Display menu offers "USD for stablecoins" and "USD for other
   *  tokens" (lib/shared/usd-display.ts). */
  usdSplit?: boolean;
}) {
  const [state, setState] = useState(DEFAULTS);
  const [override, setOverride] = useState<boolean | null>(null);
  const saved = useRef(DEFAULTS.mobileSpine);

  useEffect(() => {
    const fromUrl = urlSpineView();
    setOverride(fromUrl);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = migrate(JSON.parse(raw) as Partial<typeof DEFAULTS> & { showUsdValues?: boolean });
        saved.current = parsed.mobileSpine === true;
        setState((s) => ({ ...s, ...parsed }));
      }
    } catch {}
    markSpineView(fromUrl ?? saved.current);
    // Leaving the page puts the attribute back on the saved choice, so a URL
    // override does not reach the next page.
    return () => markSpineView(saved.current);
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

  const setSpineView = useCallback((on: boolean) => {
    setOverride(null);
    saved.current = on;
    markSpineView(on);
    setState((prev) => {
      const next = { ...prev, mobileSpine: on };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const spineView = override ?? state.mobileSpine;
  return <Ctx.Provider value={{ ...state, usdSplit, spineView, toggle, setSpineView }}>{children}</Ctx.Provider>;
}

export function useTimelineDisplay(): TimelineDisplayState {
  return useContext(Ctx);
}

/** Whether a USD value shows beside an amount, by the page's Display
 *  switches (lib/shared/usd-display.ts). */
export function useUsdShown(): (
  symbol: string | null | undefined,
  usd: number | null | undefined,
  amount: number | string | null | undefined,
) => boolean {
  const d = useContext(Ctx);
  return (symbol, usd, amount) => usdShown(d, symbol, usd, amount);
}
