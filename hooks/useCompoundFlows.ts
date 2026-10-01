"use client";

// The Lifetime flows timeline for a Compound V3 position page (Ethereum's
// (market, wallet) page and each market of the Base wallet page): the
// position's whole history replayed by lib/compound/flows.ts. A page that
// holds the whole history as events hands them over; a windowed or
// folder-served page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. Comet's oracle
// prices at each row's block come from /api/chain/compound/prices-at-block,
// six at a time, up to COMPOUND_PRICE_READS blocks. It also gives the page the
// value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { isCompoundEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import {
  compoundAssets,
  compoundFlowEvents,
  compoundFlowFacts,
  compoundFlowReplay,
  compoundFlowTimeline,
  compoundFocusEvents,
  compoundPriceBlocks,
  type CompoundFlowFacts,
  type CompoundFlowReplay,
  type CompoundLive,
} from "@/lib/compound/flows";

/** At most this many blocks' price reads per position; the rest take the
 *  nearest priced row's prices, and the Explanation counts them. */
export const COMPOUND_PRICE_READS = 250;

const cache = new Map<string, Promise<Record<string, number> | null>>();

/** Comet's oracle prices at one block, cached for the page's life (a past
 *  block's answer never changes); null where the read failed. */
function loadPricesAt(
  deployment: "ethereum" | "base",
  market: string,
  block: number,
  assets: string[],
): Promise<Record<string, number> | null> {
  const url = `/api/chain/compound/prices-at-block?deployment=${deployment}&market=${market}&block=${block}&assets=${assets.join(",")}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.prices && typeof d.prices === "object" ? (d.prices as Record<string, number>) : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

export interface CompoundFlowsInput {
  /** The page's events in this market, when they are the whole history;
   *  null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read
   *  (the panel then states the history was not read). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  deployment: "ethereum" | "base";
  market: CometMarket;
  open: boolean;
  /** The page's live read of the position, where it has one. */
  live: CompoundLive | null;
}

export function useCompoundFlows(p: CompoundFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: CompoundFlowFacts | null;
  replay: CompoundFlowReplay | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll, market } = p;
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

  const source = useMemo(
    () =>
      (p.wholeEvents ?? fetched.events)?.filter((e) => !isCompoundEvent(e) || e.context.data.market === market.key) ??
      null,
    [p.wholeEvents, fetched.events, market.key],
  );
  const bare = useMemo(
    () => (source ? compoundFlowEvents(source, market.baseToken, market.baseDecimals) : []),
    [source, market.baseToken, market.baseDecimals],
  );
  const blocks = useMemo(() => compoundPriceBlocks(bare, COMPOUND_PRICE_READS), [bare]);
  const assets = useMemo(() => compoundAssets(bare, market.baseToken), [bare, market.baseToken]);
  const blocksKey = `${p.deployment}:${market.key}:${assets.join(",")}:${blocks.join(",")}`;
  const [prices, setPrices] = useState<{ key: string; map: Map<number, Record<string, number>> } | null>(null);
  useEffect(() => {
    if (source == null) return;
    let live = true;
    const list = blocks.slice();
    const map = new Map<number, Record<string, number>>();
    let next = 0;
    const worker = async () => {
      while (live && next < list.length) {
        const b = list[next++];
        const r = await loadPricesAt(p.deployment, market.key, b, assets);
        if (r) map.set(b, r);
      }
    };
    Promise.all(Array.from({ length: Math.min(6, list.length) }, worker)).then(() => {
      if (live) setPrices({ key: blocksKey, map });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the deployment, the market, the assets and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey, source == null]);
  const priced = prices?.key === blocksKey ? prices.map : null;
  const rows = useMemo(
    () => (source && priced ? compoundFlowEvents(source, market.baseToken, market.baseDecimals, priced) : null),
    [source, priced, market.baseToken, market.baseDecimals],
  );

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null
        ? {
            baseToken: market.baseToken,
            baseSymbol: market.baseSymbol,
            baseDecimals: market.baseDecimals,
            now,
            live: p.open ? p.live : null,
          }
        : null,
    [now, market.baseToken, market.baseSymbol, market.baseDecimals, p.open, p.live],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? compoundFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(() => (rows && opts ? compoundFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(() => (replay ? compoundFocusEvents(replay) : []), [replay]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(() => (replay ? compoundFlowFacts(replay) : null), [replay]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && priced == null)
        ? "reading"
        : "done";
  return { timeline, read, focus, facts, replay };
}
