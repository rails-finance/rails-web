"use client";

// The Lifetime flows timeline for a Morpho Blue position page (Ethereum and
// Base): the position's whole history replayed by lib/morpho/flows.ts. A page
// that holds the whole history as events hands them over; a windowed or
// folder-served page reads the flat history once (the read its CSV export
// makes), and a read short of the whole history is a failed read, since a
// replay of part of a history would state the wrong lifetime. The market
// oracle at each row's block comes from the row (liquidations) or from
// /api/chain/morpho/at-block, the read the opened card makes, six at a time.
// It also gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { loadMorphoAtBlock } from "@/lib/morpho/use-market-at-block";
import {
  MO,
  morphoFlowEvents,
  morphoFlowReplay,
  morphoFlowTimeline,
  morphoFocusEvents,
  morphoPriceBlocks,
  morphoUnpriced,
  type MorphoLive,
  type MorphoRoles,
} from "@/lib/morpho/flows";

/** At most this many blocks' oracle reads per page; the rest take the
 *  nearest priced row's price, and the Explanation counts them. */
export const MORPHO_PRICE_READS = 250;

export interface MorphoFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read
   *  (the panel then states the history was not read). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  marketId: string;
  chainId: number;
  loanSymbol: string | null;
  collSymbol: string | null;
  lltv: number | null;
  open: boolean;
  /** The page's live read of the position, where it has one. */
  live: MorphoLive | null;
}

export interface MorphoFlowsNoteFacts {
  roles: MorphoRoles;
  /** Collateral flows valued at their own block's oracle price, and at the
   *  nearest priced row's. */
  priced: number;
  nearest: number;
  /** Rows whose debt the answer states as principal (no market totals). */
  principalRows: number;
  /** Liquidations, and those that wrote debt off. */
  liquidations: number;
  badDebt: number;
}

export function useMorphoFlows(p: MorphoFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: MorphoFlowsNoteFacts | null;
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
  const bare = useMemo(() => (source ? morphoFlowEvents(source) : []), [source]);
  // The oracle at each block a row needs it, where any row holds collateral.
  const blocks = useMemo(() => {
    const borrower = bare.some((e) => Math.abs(e.collDelta) > 0 || (e.collAfter ?? 0) > 0);
    return borrower ? morphoPriceBlocks(bare, MORPHO_PRICE_READS) : [];
  }, [bare]);
  const blocksKey = `${p.marketId}:${p.chainId}:${blocks.join(",")}`;
  const [prices, setPrices] = useState<{ key: string; map: Map<number, number> } | null>(null);
  useEffect(() => {
    if (source == null) return;
    let live = true;
    const list = blocks.slice();
    const map = new Map<number, number>();
    let next = 0;
    const worker = async () => {
      while (live && next < list.length) {
        const b = list[next++];
        const r = await loadMorphoAtBlock(p.marketId, b, p.chainId);
        if (r && r.at.price > 0) map.set(b, r.at.price);
      }
    };
    Promise.all(Array.from({ length: Math.min(6, list.length) }, worker)).then(() => {
      if (live) setPrices({ key: blocksKey, map });
    });
    return () => {
      live = false;
    };
    // `blocksKey` stands for the market, the chain and the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey, source == null]);
  const priced = prices?.key === blocksKey ? prices.map : null;
  const rows = useMemo(() => (source && priced ? morphoFlowEvents(source, priced) : null), [source, priced]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.loanSymbol && p.lltv != null
        ? {
            loanSymbol: p.loanSymbol,
            collSymbol: p.collSymbol ?? "collateral",
            lltv: p.lltv,
            now,
            live: p.open ? p.live : null,
          }
        : null,
    [now, p.loanSymbol, p.collSymbol, p.lltv, p.open, p.live],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? morphoFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(() => (rows && opts ? morphoFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(
    () => (replay && p.loanSymbol ? morphoFocusEvents(replay, p.loanSymbol, p.collSymbol ?? "collateral") : []),
    [replay, p.loanSymbol, p.collSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<MorphoFlowsNoteFacts | null>(() => {
    if (!replay) return null;
    const collFlows = replay.replayed.filter((r) =>
      r.legs.some((l) => l.bucket === MO.collIn || l.bucket === MO.collOut || l.bucket === MO.collSeized),
    );
    const nearest = morphoUnpriced(replay);
    const liq = replay.replayed.filter((r) => r.ev.kind === "liquidation");
    return {
      roles: replay.roles,
      priced: collFlows.length - nearest,
      nearest,
      principalRows: replay.replayed.filter(
        (r) => r.ev.debtBefore == null && (r.ev.kind === "borrow" || r.ev.kind === "repay"),
      ).length,
      liquidations: liq.length,
      badDebt: liq.filter((r) => r.legs.some((l) => l.bucket === MO.badDebt)).length,
    };
  }, [replay]);
  const read: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && priced == null)
        ? "reading"
        : "done";
  return { timeline, read, focus, facts };
}
