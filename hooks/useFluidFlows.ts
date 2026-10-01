"use client";

// The Lifetime flows timeline for a Fluid position page: the position's whole
// history replayed by lib/fluid/flows.ts. A page that holds the whole history
// as events hands them over; a windowed page reads the flat history once (the
// read its CSV export makes), and a read short of the whole history is a
// failed read, since a replay of part of a history would state the wrong
// lifetime. The vault oracle comes from the rows (liquidation blocks) and the
// page's live read; nothing is read per row. It also gives the page the value
// that ties the panel to the timeline (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  FL,
  fluidFlowEvents,
  fluidFlowReplay,
  fluidFlowTimeline,
  fluidFocusEvents,
  fluidPricing,
  type FluidLive,
} from "@/lib/fluid/flows";

export interface FluidFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  collSymbol: string | null;
  debtSymbol: string | null;
  open: boolean;
  /** The page's live read of the position, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: FluidLive | null;
  liveSettled: boolean;
  /** False on a smart vault: the page does not draw the panel. */
  enabled: boolean;
}

export interface FluidFlowsNoteFacts {
  borrower: boolean;
  /** Collateral flows valued at their own block's oracle price, at the
   *  nearest priced row's, and at today's oracle read. */
  pricing: { row: number; nearest: number; today: number };
  liquidations: number;
  absorbs: number;
  /** Rows before which a balance fell with no row of its own, booked as
   *  liquidations. */
  unrecorded: number;
  /** Rows with interest since the row before, per side. */
  earnedRows: number;
  accruedRows: number;
}

export function useFluidFlows(p: FluidFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: FluidFlowsNoteFacts | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.enabled && p.wholeEvents == null;
  const { fetchAll } = p;
  useEffect(() => {
    if (!needRead) return;
    if (!fetchAll) {
      setFetched({ events: null, read: "failed" });
      return;
    }
    let cancelled = false;
    setFetched({ events: null, read: "reading" });
    fetchAll()
      .then(({ events, missing }) => {
        if (!cancelled) setFetched(missing > 0 ? { events: null, read: "failed" } : { events, read: "done" });
      })
      .catch((err) => {
        console.warn("Lifetime flows history not read:", err);
        if (!cancelled) setFetched({ events: null, read: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [needRead, fetchAll]);

  const source = p.enabled ? (p.wholeEvents ?? fetched.events) : null;
  const rows = useMemo(() => (source ? fluidFlowEvents(source) : null), [source]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.collSymbol && p.debtSymbol && p.liveSettled
        ? { collSymbol: p.collSymbol, debtSymbol: p.debtSymbol, now, open: p.open, live: p.live }
        : null,
    [now, p.collSymbol, p.debtSymbol, p.open, p.live, p.liveSettled],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? fluidFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(() => (rows && opts ? fluidFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(
    () =>
      replay && timeline && p.collSymbol && p.debtSymbol ? fluidFocusEvents(replay, p.collSymbol, p.debtSymbol) : [],
    [replay, timeline, p.collSymbol, p.debtSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<FluidFlowsNoteFacts | null>(() => {
    if (!replay) return null;
    const liq = replay.replayed.filter((r) => r.ev.kind === "liquidated" || r.ev.kind === "absorbed");
    return {
      borrower: replay.borrower,
      pricing: fluidPricing(replay),
      liquidations: liq.filter((r) => r.ev.kind === "liquidated").length,
      absorbs: liq.filter((r) => r.ev.kind === "absorbed").length,
      unrecorded: replay.replayed.filter((r) => r.unrecorded).length,
      earnedRows: replay.replayed.filter((r) => r.legs.some((l) => l.bucket === FL.earned)).length,
      accruedRows: replay.replayed.filter((r) => r.legs.some((l) => l.bucket === FL.accrued)).length,
    };
  }, [replay]);
  const read: FlowsRead = !p.enabled
    ? "failed"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || !p.liveSettled || !p.collSymbol || !p.debtSymbol
        ? "reading"
        : // A borrower whose collateral has no price at all (no priced row and
          // no live read) cannot be drawn in the debt token.
          rows && rows.length > 0 && timeline == null
          ? "failed"
          : "done";
  return { timeline, read, focus, facts };
}
