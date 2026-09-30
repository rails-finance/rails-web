"use client";

// The page-level tie between the Lifetime flows panel, the timeline and the
// event cards (lib/shared/flow-focus.ts; rails-ops TO-DO-ui-jobs 141). A page
// that has it (the Aave family) wraps both in <FlowFocusContext.Provider>: a
// click on a chart segment opens a short tip with its line, value and share,
// the chart's "Apply to timeline" cuts the timeline at its cursor's day, each
// day's last card carries the day's date and a button that freezes the chart
// there, and each event card can state the lifetime sum as of its event. A
// page without it keeps the segment panels (the Liquity family).

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
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
