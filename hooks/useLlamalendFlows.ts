"use client";

// The Lifetime flows timeline for a LlamaLend position page: the position's
// whole history replayed by lib/llamalend/flows.ts. A page that holds the
// whole history as events hands them over; a windowed page reads the flat
// history once (the read its CSV export makes), and a read short of the whole
// history is a failed read, since a replay of part of a history would state
// the wrong lifetime. Each row carries what the server stored at its block
// (rails-server mig 373: the AMM's oracle price and the position's state,
// once its filler has reached the block). For a row it has not stored, the
// price is read from the archive (/api/chain/llamalend/liq-price, six at a
// time, up to LLAMALEND_PRICE_READS blocks; the route caches each block's
// answer at the edge), and a row with no after-image (an underwater repay, a
// partial liquidation) has the position read at its block
// (/api/chain/llamalend/event-state, the read its card's detail makes).
// LlamaLend is not in the shared daily price store, so nothing is read
// between events: the collateral keeps its latest event's price. It also
// gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  llamalendStateBlocks,
  llamalendFlowEvents,
  llamalendFlowFacts,
  llamalendFlowReplay,
  llamalendFlowTimeline,
  llamalendFocusEvents,
  llamalendPriceBlocks,
  type LlamalendFlowFacts,
  type LlamalendLive,
  type LlamalendStateRead,
} from "@/lib/llamalend/flows";

const cache = new Map<string, Promise<number | null>>();

/** The AMM's oracle price at one block, cached for the page's life (a past
 *  block's answer never changes); null where the read failed. */
function loadPriceAt(controller: string, block: number): Promise<number | null> {
  const url = `/api/chain/llamalend/liq-price?controller=${controller}&block=${block}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (typeof d?.price === "number" && d.price > 0 ? (d.price as number) : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

const stateCache = new Map<string, Promise<LlamalendStateRead | null>>();

/** The position at the end of one block (collateral in the bands and debt,
 *  base units), cached for the page's life; null where the read failed. */
function loadStateAt(controller: string, user: string, block: number): Promise<LlamalendStateRead | null> {
  const url = `/api/chain/llamalend/event-state?controller=${controller}&user=${user}&block=${block}`;
  let p = stateCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const a = d?.after;
        if (!a) return null;
        if (!a.hasLoan) return { coll: BigInt(0), debt: BigInt(0) };
        if (a.collateralRaw == null || a.debtRaw == null) return null;
        return { coll: BigInt(a.collateralRaw), debt: BigInt(a.debtRaw) };
      })
      .catch(() => null);
    p.then((v) => {
      if (v == null) stateCache.delete(url);
    });
    stateCache.set(url, p);
  }
  return p;
}

/** Runs `load` over `items`, six at a time. */
async function sixAtATime<T, R>(items: T[], load: (t: T) => Promise<R | null>, live: () => boolean) {
  const out = new Map<T, R>();
  let next = 0;
  const worker = async () => {
    while (live() && next < items.length) {
      const t = items[next++];
      const v = await load(t);
      if (v != null) out.set(t, v);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return out;
}

export interface LlamalendFlowsInput {
  controller: string;
  /** The position's owner, for the reads of its state at a block. */
  user: string;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  collSymbol: string | null;
  debtSymbol: string | null;
  open: boolean;
  /** The page's live read of the position, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: LlamalendLive | null;
  liveSettled: boolean;
}

export function useLlamalendFlows(p: LlamalendFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: LlamalendFlowFacts | null;
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
  const bare = useMemo(() => (source ? llamalendFlowEvents(source) : null), [source]);
  const blocks = useMemo(() => (bare ? llamalendPriceBlocks(bare) : null), [bare]);
  const stateBlocks = useMemo(() => (bare ? llamalendStateBlocks(bare) : null), [bare]);
  const blocksKey =
    blocks && stateBlocks ? `${p.controller}:${p.user}:${blocks.join(",")}:${stateBlocks.join(",")}` : null;
  const [reads, setReads] = useState<{
    key: string;
    prices: Map<number, number>;
    states: Map<number, LlamalendStateRead>;
  } | null>(null);
  useEffect(() => {
    if (!blocks || !stateBlocks || !blocksKey) return;
    let live = true;
    const alive = () => live;
    Promise.all([
      sixAtATime(blocks, (b) => loadPriceAt(p.controller, b), alive),
      sixAtATime(stateBlocks, (b) => loadStateAt(p.controller, p.user, b), alive),
    ]).then(([prices, states]) => {
      if (live) setReads({ key: blocksKey, prices, states });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the controller, the owner and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);
  const got = reads != null && reads.key === blocksKey ? reads : null;
  const rows = useMemo(
    () => (source && got ? llamalendFlowEvents(source, got.prices, got.states) : null),
    [source, got],
  );

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
  const replay = useMemo(
    () => (rows && opts && rows.length > 0 ? llamalendFlowReplay(rows, opts) : null),
    [rows, opts],
  );
  const timeline = useMemo(() => (rows && opts ? llamalendFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(
    () =>
      replay && timeline && p.collSymbol && p.debtSymbol
        ? llamalendFocusEvents(replay, p.collSymbol, p.debtSymbol)
        : [],
    [replay, timeline, p.collSymbol, p.debtSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(() => (replay ? llamalendFlowFacts(replay, timeline) : null), [replay, timeline]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || !p.liveSettled || !p.collSymbol || !p.debtSymbol || rows == null
        ? "reading"
        : // A position whose collateral has no price at all (no block read and
          // no live read) cannot be drawn in the borrowed token.
          rows.length > 0 && timeline == null
          ? "failed"
          : "done";
  return { timeline, read, focus, facts };
}
