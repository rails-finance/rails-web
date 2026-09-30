"use client";

// The page-level tie between the Lifetime flows panel, the timeline and the
// event cards (lib/shared/flow-focus.ts; rails-ops TO-DO-ui-jobs 141). A page
// that has it (the Aave family) wraps both in <FlowFocusContext.Provider>: a
// segment's click then filters the timeline instead of opening a panel, the
// timeline draws the chip and the flow lines in its filter menu, and each
// event card can state the lifetime sum as of its event and move the chart to
// its day. A page without it keeps the segment panels (the Liquity family).

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import type { TimelineExtraFilter } from "@/hooks/useTimelineEvents";
import { buildFlowModel, type FlowModel, type FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  AAVE_FAMILY_KINDS,
  bucketsById,
  createFlowFocusStore,
  filterPasses,
  flowLines,
  folderUnderFilter,
  type FlowFocusState,
  type FlowFocusStore,
  type FlowLine,
  type FocusEvent,
  type FolderKinds,
} from "@/lib/shared/flow-focus";

export interface FlowFocusValue {
  store: FlowFocusStore;
  /** The whole life's model (not the bars' window), once the day rows land. */
  model: FlowModel | null;
  /** The page's events as the flow lines read them, ascending. */
  events: FocusEvent[];
  buckets: Map<string, Set<string>>;
  lines: FlowLine[];
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

const NONE = null;

/** A page's side of it, in two steps because the timeline's hook comes
 *  before the flow model on a page: `useFlowFocusRoot` (the store, the
 *  events' buckets, and the filter the timeline adds to its axes while a
 *  flow line is picked; the page re-renders when the filter or, while one is
 *  in force, the cursor moves), then `useFlowFocusValue` (the context value,
 *  once the day rows are in hand). */
export interface FlowFocusRoot {
  store: FlowFocusStore;
  events: FocusEvent[];
  buckets: Map<string, Set<string>>;
  extraFilter: TimelineExtraFilter | null;
}

export function useFlowFocusRoot(events: FocusEvent[], kinds: FolderKinds = AAVE_FAMILY_KINDS): FlowFocusRoot {
  const store = useMemo(() => createFlowFocusStore(), []);
  const buckets = useMemo(() => bucketsById(events), [events]);
  const active = useSyncExternalStore(
    store.subscribe,
    () => {
      const s = store.get();
      return s.filter && s.cursor ? s : NONE;
    },
    () => NONE,
  );
  const filter = active?.filter ?? null;
  const cursor = active?.cursor ?? null;
  const extraFilter = useMemo<TimelineExtraFilter | null>(() => {
    if (!filter || !cursor) return null;
    return {
      passes: (e: BaseActivityEvent) => filterPasses(filter, cursor, buckets, e.id, e.timestamp),
      folder: (f: ServedFolder) => folderUnderFilter(f, filter, cursor, kinds),
    };
  }, [filter, cursor, buckets, kinds]);
  return { store, events, buckets, extraFilter };
}

export function useFlowFocusValue(root: FlowFocusRoot, timeline: FlowTimeline | null): FlowFocusValue {
  const model = useMemo(() => (timeline ? buildFlowModel(timeline) : null), [timeline]);
  const lines = useMemo(() => (model ? flowLines(model) : []), [model]);
  const { store, events, buckets } = root;
  return useMemo<FlowFocusValue>(
    () => ({ store, model, events, buckets, lines }),
    [store, model, events, buckets, lines],
  );
}

/** A segment's side of the filter: whether a line is the one in force, and
 *  the toggle a click, a tap or Enter makes. Null without a provider. */
export function useFlowLineToggle(): {
  pressed: string | null;
  toggle: (key: string, side: "collateral" | "debt", label: string) => void;
} | null {
  const ctx = useContext(FlowFocusContext);
  const pressed = useFlowFocusState((s) => s.filter?.key ?? null);
  return useMemo(() => {
    if (!ctx) return null;
    const { store } = ctx;
    return {
      pressed,
      toggle: (key, side, label) => {
        const s = store.get();
        if (s.filter?.key === key) store.set({ filter: null });
        else store.set({ filter: { key, side, label }, applied: s.applied + 1 });
      },
    };
  }, [ctx, pressed]);
}
