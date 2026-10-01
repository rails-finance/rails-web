"use client";

// The Lifetime flows timeline for a Maple lender page: the wallet's whole
// history replayed by lib/maple/flows.ts, one timeline per pool. A page that
// holds the whole history as events hands them over; a windowed or
// folder-served page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. It also gives
// the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx), for the pool the panel shows.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import {
  MP,
  mapleFlowTimeline,
  mapleFocusEvents,
  maplePoolReplays,
  type MapleFlowReplay,
  type MapleLive,
  type MapleReplayFacts,
} from "@/lib/maple/flows";

export interface MapleFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** The page's chain read now, per pool. */
  live: Record<string, MapleLive>;
  /** The pool the page puts first: the one it holds most of now. */
  preferred: string | null;
}

/** One pool the panel can show. */
export interface MapleFlowsPool {
  pool: string;
  poolSymbol: string;
  assetSymbol: string;
}

export interface MapleFlowsNoteFacts extends MapleReplayFacts {
  poolSymbol: string;
  assetSymbol: string;
  /** Rows by what they did, in this pool. */
  requests: number;
  cancellations: number;
  fills: number;
  transfers: number;
  /** Whether the page had a chain read of the pool's exit rate now. */
  liveRate: boolean;
}

export function useMapleFlows(p: MapleFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: MapleFlowsNoteFacts | null;
  pools: MapleFlowsPool[];
  pool: string | null;
  setPool: (pool: string) => void;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
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

  const source = p.wholeEvents ?? fetched.events;
  const replays = useMemo<MapleFlowReplay[]>(() => (source ? maplePoolReplays(source) : []), [source]);
  const pools = useMemo<MapleFlowsPool[]>(
    () =>
      replays.map((r) => {
        const cat = maplePoolOf(r.pool);
        return { pool: r.pool, poolSymbol: cat.symbol, assetSymbol: cat.assetSymbol };
      }),
    [replays],
  );
  const [chosen, setPool] = useState<string | null>(null);
  const pool =
    chosen != null && replays.some((r) => r.pool === chosen)
      ? chosen
      : p.preferred != null && replays.some((r) => r.pool === p.preferred)
        ? p.preferred
        : (replays[0]?.pool ?? p.preferred);
  const replay = replays.find((r) => r.pool === pool) ?? null;
  const cat = pool ? maplePoolOf(pool) : null;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const live = pool ? (p.live[pool] ?? null) : null;
  const timeline = useMemo(
    () =>
      replay && cat && now != null
        ? mapleFlowTimeline(replay, { assetSymbol: cat.assetSymbol, poolSymbol: cat.symbol, now, live })
        : null,
    [replay, cat, now, live],
  );
  const focusEvents = useMemo(() => (replay && cat ? mapleFocusEvents(replay, cat.assetSymbol) : []), [replay, cat]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<MapleFlowsNoteFacts | null>(() => {
    if (!replay || !cat) return null;
    const kinds = replay.replayed.map((r) => r.row.kind);
    const count = (...k: string[]) => kinds.filter((x) => k.includes(x)).length;
    return {
      ...replay.facts,
      poolSymbol: cat.symbol,
      assetSymbol: cat.assetSymbol,
      requests: count("request"),
      cancellations: count("request_cancel", "request_decrease"),
      fills: replay.replayed.filter((r) => r.legs.some((l) => l.bucket === MP.queue)).length,
      transfers: count("transfer_in", "transfer_out"),
      liveRate: live?.rate != null && live.rate > 0,
    };
  }, [replay, cat, live]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done" ? fetched.read : now == null ? "reading" : "done";
  return { timeline, read, focus, facts, pools, pool, setPool };
}
