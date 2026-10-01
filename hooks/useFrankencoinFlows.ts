"use client";

// The Lifetime flows timeline for a Frankencoin position page: the position's
// whole history replayed by lib/frankencoin/flows.ts. A page that holds the
// whole history as events hands them over; a windowed page reads the flat
// history once (the read its CSV export makes), and a read short of the whole
// history is a failed read, since a replay of part of a history would state
// the wrong lifetime. Every mint and repayment is split by its transaction's
// receipt (/api/chain/frankencoin/event, the read its card makes, shared
// through the page's cache), six at a time. Frankencoin runs no oracle and is
// not in the shared daily price store: nothing is priced, each side is stated
// in its own token. It also gives the page the value that ties the panel to
// the timeline (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";
import {
  frankencoinEventMovesZchf,
  frankencoinEventReadUrl,
  loadFrankencoinEventRead,
} from "@/lib/frankencoin/use-event-read";
import {
  frankencoinFlowEvents,
  frankencoinFlowFacts,
  frankencoinFlowReplay,
  frankencoinFlowTimeline,
  frankencoinFocusEvents,
  type FrankencoinFlowFacts,
  type FrankencoinLive,
} from "@/lib/frankencoin/flows";

/** Runs `load` over `items`, six at a time. */
async function sixAtATime<T, R>(items: T[], load: (t: T) => Promise<R | null>, live: () => boolean) {
  const out = new Map<T, R | null>();
  let next = 0;
  const worker = async () => {
    while (live() && next < items.length) {
      const t = items[next++];
      out.set(t, await load(t));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return out;
}

export interface FrankencoinFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** What the page does to its rows before they are read (the opening
   *  transaction's figures put in place); applied to a fetched history too. */
  prepare: (events: BaseActivityEvent[]) => BaseActivityEvent[];
  /** The page's opening read is still out: the rows will change when it lands. */
  preparing: boolean;
  collSymbol: string | null;
  open: boolean;
  /** The page's live read of the position, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: FrankencoinLive | null;
  liveSettled: boolean;
}

export function useFrankencoinFlows(p: FrankencoinFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: FrankencoinFlowFacts | null;
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

  const { prepare } = p;
  const source = useMemo(
    () => p.wholeEvents ?? (fetched.events ? prepare(fetched.events) : null),
    [p.wholeEvents, fetched.events, prepare],
  );
  // The receipt reads: each row that moved the debt through a wallet.
  const urls = useMemo(() => {
    if (!source) return null;
    const out: { id: string; url: string }[] = [];
    for (const e of source) {
      if (!isFrankencoinEvent(e)) continue;
      const ctx = e.context.data as FrankencoinContext;
      if (!frankencoinEventMovesZchf(ctx)) continue;
      const url = frankencoinEventReadUrl(ctx, e.txHash, e.id);
      if (url) out.push({ id: e.id, url });
    }
    return out;
  }, [source]);
  const urlsKey = urls ? urls.map((u) => u.url).join("|") : null;
  const [reads, setReads] = useState<{ key: string; map: Map<string, FrankencoinEventRead | null> } | null>(null);
  useEffect(() => {
    if (!urls || urlsKey == null) return;
    let live = true;
    sixAtATime(
      urls,
      (u) => loadFrankencoinEventRead(u.url),
      () => live,
    ).then((got) => {
      if (!live) return;
      const map = new Map<string, FrankencoinEventRead | null>();
      for (const [u, v] of got) map.set(u.id, v);
      setReads({ key: urlsKey, map });
    });
    return () => {
      live = false;
    };
    // `urlsKey` stands for the reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey]);
  const got = reads != null && reads.key === urlsKey ? reads.map : null;
  const rows = useMemo(() => (source && got ? frankencoinFlowEvents(source, got) : null), [source, got]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.collSymbol && p.liveSettled
        ? { collSymbol: p.collSymbol, now, open: p.open, live: p.live }
        : null,
    [now, p.collSymbol, p.open, p.live, p.liveSettled],
  );
  const replay = useMemo(
    () => (rows && opts && rows.length > 0 ? frankencoinFlowReplay(rows, opts) : null),
    [rows, opts],
  );
  const timeline = useMemo(() => (rows && opts ? frankencoinFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(
    () => (replay && timeline && p.collSymbol ? frankencoinFocusEvents(replay, p.collSymbol) : []),
    [replay, timeline, p.collSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(() => (replay ? frankencoinFlowFacts(replay, p.live, p.open) : null), [replay, p.live, p.open]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || !p.liveSettled || !p.collSymbol || p.preparing || rows == null
        ? "reading"
        : "done";
  return { timeline, read, focus, facts };
}
