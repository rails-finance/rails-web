"use client";

// The Lifetime flows timeline for a Moonwell account page, Ethereum or Base:
// the account's whole history replayed by lib/shared/ctoken-flows.ts through
// lib/moonwell/flows.ts. A page that holds the whole history as events hands
// them over; a windowed or folder-served page reads the flat history once
// (the read its CSV export makes), and a read short of the whole history is a
// failed read, since a replay of part of a history would state the wrong
// lifetime. Every row carries its oracle price at its block, so nothing is
// read per row; between events each market takes its day's price from the
// shared daily price store (/api/prices/daily), and where that read fails the
// last event's price is carried. It also gives the page the value that ties
// the panel to the timeline (components/shared/flow-focus-context.tsx) and
// each event's account for its card's ledgers.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { fetchDailyPrices } from "@/lib/api/fetch-daily-prices";
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
import { moonwellFlowRows, moonwellSeriesKey } from "@/lib/moonwell/flows";

const DAY_S = 86_400;

export interface MoonwellFlowsInput {
  /** 1 or 8453: the daily store's chain. */
  chainId: number;
  /** The page's own history read is still on its way: wait for it. */
  pending?: boolean;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page cannot (the panel
   *  then states a failed read). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** The page's live read, where it landed. */
  chain: MoonwellChainResponse | null;
  /** A market key's mToken address, lowercased. */
  mtokenOf: (market: string) => string;
}

export interface MoonwellFlowsFacts {
  borrower: boolean;
  /** Rows with a flow valued at their own block's price, and at the nearest
   *  priced row's. */
  priced: number;
  nearest: number;
  liquidations: number;
  transfersIn: number;
  transfersOut: number;
  /** Whether the live read set today's balances. */
  live: boolean;
  /** "store": days between events at the daily store's price; "carried":
   *  the store did not answer, so each market keeps its last event's price. */
  between: "store" | "carried";
}

export function useMoonwellFlows(p: MoonwellFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: MoonwellFlowsFacts | null;
  states: Map<string, CTokenEventState> | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.wholeEvents == null && !p.pending;
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

  const source = p.pending ? null : (p.wholeEvents ?? fetched.events);
  const { mtokenOf } = p;
  const rows = useMemo(() => (source ? moonwellFlowRows(source, mtokenOf) : null), [source, mtokenOf]);

  // The daily store, one read per page: each market's series from its first
  // row's day. A failed or empty read carries the last event's price.
  const want = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const markets = [...new Set(rows.map((r) => r.market))];
    return { markets, from: Math.floor(rows[0].ts / DAY_S), key: markets.join(",") };
  }, [rows]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  const { chainId } = p;
  useEffect(() => {
    if (!want) return;
    const ac = new AbortController();
    fetchDailyPrices(
      chainId,
      want.markets.map((m) => moonwellSeriesKey(mtokenOf(m))),
      { from: want.from, signal: ac.signal },
    )
      .then((byKey) => {
        const prices: Record<string, [number, number][]> = {};
        for (const m of want.markets) {
          const obs = byKey?.[moonwellSeriesKey(mtokenOf(m))];
          if (obs) prices[m] = obs;
        }
        setDaily({ key: want.key, prices: Object.keys(prices).length > 0 ? prices : null });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setDaily({ key: want.key, prices: null });
      });
    return () => ac.abort();
    // `want.key` stands for the markets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want?.key, want?.from, chainId, mtokenOf]);
  const dailySettled = want != null && daily?.key === want.key;

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
  const dailyPrices = dailySettled ? (daily?.prices ?? undefined) : undefined;
  const opts = useMemo<CTokenFlowOptions | null>(
    () =>
      now != null
        ? { vocab: { brand: "Moonwell", receipt: "mToken" }, now, live, ...(dailyPrices ? { dailyPrices } : {}) }
        : null,
    [now, live, dailyPrices],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? ctokenFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(
    () => (rows && opts && (dailySettled || rows.length === 0) ? ctokenFlowTimeline(rows, opts) : null),
    [rows, opts, dailySettled],
  );
  const focusEvents = useMemo(() => (replay ? ctokenFocusEvents(replay) : []), [replay]);
  const states = useMemo(() => (replay && opts ? ctokenEventStates(replay, opts) : null), [replay, opts]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<MoonwellFlowsFacts | null>(() => {
    if (!replay || !rows) return null;
    const pricing = ctokenPricing(replay);
    const has = (k: string) => replay.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
    return {
      borrower: replay.borrower,
      priced: pricing.own,
      nearest: pricing.nearest,
      liquidations: replay.replayed.filter((r) => r.ev.kind === "liquidation" && r.legs.length > 0).length,
      transfersIn: has(CT.received),
      transfersOut: has(CT.sent),
      live: live != null,
      between: dailyPrices ? "store" : "carried",
    };
  }, [replay, rows, live, dailyPrices]);
  const state: FlowsRead = p.pending
    ? "reading"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (rows != null && rows.length > 0 && !dailySettled)
        ? "reading"
        : "done";
  return { timeline, read: state, focus, facts, states };
}
