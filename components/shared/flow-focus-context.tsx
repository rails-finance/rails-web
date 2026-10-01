"use client";

// The page-level tie between the Lifetime flows panel, the timeline and the
// event cards (lib/shared/flow-focus.ts; rails-ops TO-DO-ui-jobs 141). A page
// that has it (the Aave and Liquity families) wraps both in <FlowFocusContext.Provider>: a
// click on a chart segment opens a short tip with its line, value and share,
// the chart's "Show timeline to {date}" cuts the timeline at its cursor's day, each
// day's last card carries the day's date and a button that freezes the chart
// there, and each event card can state the lifetime sum as of its event. A
// page without it keeps the segment panels (Sky Savings).

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { formatUtcDay, parseUtcDay } from "@/hooks/useTimelineEvents";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { buildFlowModel, type FlowModel, type FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  createFlowFocusStore,
  type FlowFocusState,
  type FlowFocusStore,
  type FocusEvent,
} from "@/lib/shared/flow-focus";

export interface FlowFocusValue {
  store: FlowFocusStore;
  /** The whole life's model (not the bars' window), once the day rows land. */
  model: FlowModel | null;
  /** The page's events as the flow lines read them, ascending. */
  events: FocusEvent[];
}

export const FlowFocusContext = createContext<FlowFocusValue | null>(null);

export function useFlowFocus(): FlowFocusValue | null {
  return useContext(FlowFocusContext);
}

const NOOP_STORE = createFlowFocusStore();

/** The shared state, read through `select` (a stable result re-renders
 *  nothing). Without a provider, the empty state. */
export function useFlowFocusState<T>(select: (s: FlowFocusState) => T): T {
  const store = useContext(FlowFocusContext)?.store ?? NOOP_STORE;
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}

/** A page's side of it, in two steps because the timeline's hook comes
 *  before the flow model on a page: `useFlowFocusRoot` (the store and the
 *  page's events), then `useFlowFocusValue` (the context value, once the day
 *  rows are in hand). */
export interface FlowFocusRoot {
  store: FlowFocusStore;
  events: FocusEvent[];
}

export function useFlowFocusRoot(events: FocusEvent[]): FlowFocusRoot {
  const store = useMemo(() => createFlowFocusStore(), []);
  return useMemo(() => ({ store, events }), [store, events]);
}

export function useFlowFocusValue(root: FlowFocusRoot, timeline: FlowTimeline | null): FlowFocusValue {
  const model = useMemo(() => (timeline ? buildFlowModel(timeline) : null), [timeline]);
  const { store, events } = root;
  return useMemo<FlowFocusValue>(() => ({ store, model, events }), [store, model, events]);
}

const DAY_S = 86_400;

/** The cut in the address bar: `?to=2025-06-15`, the UTC day whose close it
 *  ends at. On mount a `to` before today restores the cut and freezes the
 *  chart's cursor on its day. A link from before Dates was removed on these
 *  pages carries `from` and `to`; it lands on the cut at `to`, the range's last
 *  day, and `from` goes. After that the param follows the cut: written when
 *  "Show timeline to {date}" moves it, removed with the chip's ×. Other params stay as they are. */
export function useRewindParam(store: FlowFocusStore | null): void {
  useEffect(() => {
    if (!store) return;
    const write = (endTs: number | null) => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("from");
        if (endTs == null) url.searchParams.delete("to");
        else url.searchParams.set("to", formatUtcDay(endTs));
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (next !== current) window.history.replaceState(window.history.state, "", next);
      } catch {
        /* non-fatal: the cut stands, it just is not in the link */
      }
    };
    let last: number | null = store.get().rewind?.endTs ?? null;
    try {
      const sp = new URLSearchParams(window.location.search);
      const day = parseUtcDay(sp.get("to"));
      const today = Math.floor(Date.now() / 1000 / DAY_S) * DAY_S;
      if (day != null && day < today && last == null) {
        const endTs = day + DAY_S - 1;
        store.set({
          rewind: { endTs, word: `${shortDate(day)} ${shortDateYear(day)}` },
          restore: { endTs, n: (store.get().restore?.n ?? 0) + 1 },
        });
        last = endTs;
        if (sp.has("from")) write(endTs);
      } else if (sp.has("from") || sp.has("to")) write(last);
    } catch {
      /* a malformed query string restores nothing */
    }
    return store.subscribe(() => {
      const endTs = store.get().rewind?.endTs ?? null;
      if (endTs === last) return;
      last = endTs;
      write(endTs);
    });
  }, [store]);
}
