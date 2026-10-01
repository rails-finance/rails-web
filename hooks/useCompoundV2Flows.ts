"use client";

// The Lifetime flows timeline for a Compound V2 account page: the account's
// whole history replayed by lib/shared/ctoken-flows.ts through
// lib/compound-v2/flows.ts. A page that holds the whole history as events
// hands them over; a windowed or folder-served page reads the flat history
// once (the read its CSV export makes), and a read short of the whole history
// is a failed read, since a replay of part of a history would state the wrong
// lifetime. The oracle price at each row's block comes from the row (a
// liquidation's legs) or from /api/chain/compound-v2/prices-at, one read of
// at most 400 pairs. It also gives the page the value that ties the panel to
// the timeline (components/shared/flow-focus-context.tsx) and each event's
// account for its card's ledgers.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import { fetchCompoundV2PricesAt } from "@/lib/api/fetch-compound-v2-prices-at";
import {
  ctokenEventStates,
  ctokenFlowReplay,
  ctokenFlowTimeline,
  ctokenFocusEvents,
  ctokenPricing,
  CT,
  type CTokenEventState,
  type CTokenFlowOptions,
  type CTokenLiveMarket,
} from "@/lib/shared/ctoken-flows";
import {
  compoundV2EthEraRows,
  compoundV2FlowRows,
  compoundV2PricePairs,
  compoundV2RowPrices,
} from "@/lib/compound-v2/flows";

export interface CompoundV2FlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history. */
  fetchAll: () => Promise<{ events: BaseActivityEvent[]; missing: number }>;
  /** The page's live read, where it landed. */
  chain: CompoundV2ChainResponse | null;
  /** Today's oracle price by market, from the listing row. */
  todayPrices: Record<string, number> | undefined;
  /** Markets whose oracle price is a stored constant with no feed. */
  fixedPrices: Record<string, boolean> | undefined;
}

export interface CompoundV2FlowsFacts {
  borrower: boolean;
  /** Rows with a flow valued at their own block's price, and at the nearest
   *  priced row's. */
  priced: number;
  nearest: number;
  /** Rows before the oracle's USD switch. */
  ethEra: number;
  liquidations: number;
  transfersIn: number;
  transfersOut: number;
  seizedAsLiquidator: number;
  /** Whether the live read set today's balances. */
  live: boolean;
  /** Symbols of markets on a fixed oracle price. */
  fixed: string[];
}

export function useCompoundV2Flows(p: CompoundV2FlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: CompoundV2FlowsFacts | null;
  states: Map<string, CTokenEventState> | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null;
  const { fetchAll } = p;
  useEffect(() => {
    if (!needRead) return;
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
  const rowPrices = useMemo(() => (source ? compoundV2RowPrices(source) : null), [source]);
  const pairs = useMemo(
    () => (source && rowPrices ? compoundV2PricePairs(source, rowPrices) : []),
    [source, rowPrices],
  );
  const pairsKey = pairs.join(",");
  const [read, setRead] = useState<{ key: string; map: Map<string, number> } | null>(null);
  useEffect(() => {
    if (source == null) return;
    if (pairs.length === 0) {
      setRead({ key: pairsKey, map: new Map() });
      return;
    }
    const ac = new AbortController();
    fetchCompoundV2PricesAt(pairs, ac.signal)
      .then((m) => setRead({ key: pairsKey, map: m ?? new Map() }))
      .catch((err) => {
        // A failed read leaves every row on the rows' own prices and the
        // nearest priced row's; the Explanation counts them.
        if ((err as { name?: string })?.name !== "AbortError") setRead({ key: pairsKey, map: new Map() });
      });
    return () => ac.abort();
    // `pairsKey` stands for the pairs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey, source == null]);
  const prices = useMemo(() => {
    if (!rowPrices || read?.key !== pairsKey) return null;
    return new Map([...rowPrices, ...read.map]);
  }, [rowPrices, read, pairsKey]);
  const rows = useMemo(() => (source && prices ? compoundV2FlowRows(source, prices) : null), [source, prices]);

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const live = useMemo<Record<string, CTokenLiveMarket> | null>(() => {
    if (!p.chain || p.chain.chainStale) return null;
    const out: Record<string, CTokenLiveMarket> = {};
    for (const m of p.chain.markets)
      out[m.market] = {
        supply: m.supplyUnderlying,
        debt: m.borrowUnderlying,
        exchangeRate: m.exchangeRate > 0 ? m.exchangeRate : null,
        price: m.priceUsd != null && m.priceUsd > 0 ? m.priceUsd : null,
        supplyApr: m.supplyApr,
        borrowApr: m.borrowApr,
      };
    return out;
  }, [p.chain]);
  const opts = useMemo<CTokenFlowOptions | null>(
    () =>
      now != null ? { vocab: { brand: "Compound", receipt: "cToken" }, now, live, todayPrices: p.todayPrices } : null,
    [now, live, p.todayPrices],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? ctokenFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(() => (rows && opts ? ctokenFlowTimeline(rows, opts) : null), [rows, opts]);
  const focusEvents = useMemo(() => (replay ? ctokenFocusEvents(replay) : []), [replay]);
  const states = useMemo(() => (replay && opts ? ctokenEventStates(replay, opts) : null), [replay, opts]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<CompoundV2FlowsFacts | null>(() => {
    if (!replay || !rows) return null;
    const pricing = ctokenPricing(replay);
    const has = (k: string) => replay.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
    const fixed = new Set<string>();
    for (const r of replay.replayed) if (p.fixedPrices?.[r.ev.market]) fixed.add(r.ev.symbol);
    return {
      borrower: replay.borrower,
      priced: pricing.own,
      nearest: pricing.nearest,
      ethEra: compoundV2EthEraRows(rows),
      liquidations: replay.replayed.filter((r) => r.ev.kind === "liquidation").length,
      transfersIn: has(CT.received),
      transfersOut: has(CT.sent),
      seizedAsLiquidator: has(CT.seizedIn),
      live: live != null,
      fixed: [...fixed],
    };
  }, [replay, rows, live, p.fixedPrices]);
  const state: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && prices == null)
        ? "reading"
        : "done";
  return { timeline, read: state, focus, facts, states };
}
