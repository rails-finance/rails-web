"use client";

// The Lifetime flows timeline for a Dolomite account page: the account's
// whole history replayed by lib/dolomite/flows.ts. A page that holds the whole
// history as events hands them over; a windowed page reads the flat history
// once (the read its CSV export makes), and a read short of the whole history
// is a failed read, since a replay of part of a history would state the wrong
// lifetime. Each row is valued at the oracle price the route serves at its
// block, else its market's price that day from the shared daily price store
// (/api/prices/daily), which also prices the days between; where that read
// fails each market keeps its last event's price. It also gives the page the
// value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx) and each event's account for its
// card's ledgers.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import { fetchDailyPrices } from "@/lib/api/fetch-daily-prices";
import {
  DL,
  dolomiteEventStates,
  dolomiteFlowReplay,
  dolomiteFlowRows,
  dolomiteFlowTimeline,
  dolomiteFocusEvents,
  dolomitePricing,
  dolomiteSeriesKey,
  type DolomiteEventState,
  type DolomiteFlowOptions,
  type DolomiteLiveMarket,
  type DolomitePriceBasis,
} from "@/lib/dolomite/flows";

const DAY_S = 86_400;

export interface DolomiteFlowsInput {
  owner: string;
  /** The page's history read is still on its way: wait for it. */
  pending?: boolean;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page cannot (the panel
   *  then states a failed read). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** The page's live read, where it landed. */
  chain: DolomiteChainResponse | null;
}

export interface DolomiteFlowsFacts {
  borrower: boolean;
  /** Rows with a flow by how their price was found. */
  pricing: Record<DolomitePriceBasis, number>;
  liquidations: number;
  /** Rows on which the account was the liquidator. */
  asLiquidator: number;
  /** Transfer rows in and out, and how many of them were between the
   *  owner's other accounts. */
  transfers: number;
  ownTransfers: number;
  trades: number;
  /** Every line a row filled (`DL` keys). */
  used: string[];
  /** Whether the live read set today's balances. */
  live: boolean;
  /** "store": days between events at the daily store's price; "carried":
   *  the store did not answer, so each market keeps its last event's price. */
  between: "store" | "carried";
}

/** The live read as the replay reads it, by market id. */
export function dolomiteLive(chain: DolomiteChainResponse | null): Record<string, DolomiteLiveMarket> | null {
  if (!chain || chain.chainStale) return null;
  const out: Record<string, DolomiteLiveMarket> = {};
  for (const b of chain.balances) {
    const par = Number(b.parRaw);
    const wei = Number(b.weiRaw);
    const index = par !== 0 && Number.isFinite(wei / par) ? wei / par : null;
    out[String(b.marketId)] = {
      balance: b.wei,
      supplyIndex: b.wei > 0 ? index : null,
      borrowIndex: b.wei < 0 ? index : null,
      price: b.priceUsd != null && b.priceUsd > 0 ? b.priceUsd : null,
      supplyApr: b.supplyAprPct != null ? b.supplyAprPct / 100 : null,
      borrowApr: b.borrowAprPct != null ? b.borrowAprPct / 100 : null,
    };
  }
  return out;
}

export function useDolomiteFlows(p: DolomiteFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: DolomiteFlowsFacts | null;
  states: Map<string, DolomiteEventState> | null;
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
  const { owner } = p;
  // Null where a row carries no index: the panel states a failed read.
  const rows = useMemo(() => (source ? dolomiteFlowRows(source, owner) : undefined), [source, owner]);

  // The daily store, one read per page: each market's series from its first
  // row's day. A failed or empty read carries the last event's price.
  const want = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const markets = [...new Set(rows.map((r) => r.market))];
    return { markets, from: Math.floor(rows[0].ts / DAY_S) - 1, key: markets.join(",") };
  }, [rows]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  useEffect(() => {
    if (!want) return;
    const ac = new AbortController();
    fetchDailyPrices(1, want.markets.map(dolomiteSeriesKey), { from: want.from, signal: ac.signal })
      .then((byKey) => {
        const prices: Record<string, [number, number][]> = {};
        for (const m of want.markets) {
          const obs = byKey?.[dolomiteSeriesKey(m)];
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
  }, [want?.key, want?.from]);
  const dailySettled = want != null && daily?.key === want.key;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const live = useMemo(() => dolomiteLive(p.chain), [p.chain]);
  const dailyPrices = dailySettled ? (daily?.prices ?? undefined) : undefined;
  const opts = useMemo<DolomiteFlowOptions | null>(
    () => (now != null ? { now, live, ...(dailyPrices ? { dailyPrices } : {}) } : null),
    [now, live, dailyPrices],
  );
  const ready = Array.isArray(rows) && opts != null && (dailySettled || rows.length === 0);
  const replay = useMemo(() => (rows && opts && ready ? dolomiteFlowReplay(rows, opts) : null), [rows, opts, ready]);
  const timeline = useMemo(
    () => (rows && opts && ready ? dolomiteFlowTimeline(rows, opts) : null),
    [rows, opts, ready],
  );
  const focusEvents = useMemo(() => (replay ? dolomiteFocusEvents(replay) : []), [replay]);
  const states = useMemo(() => (replay && opts ? dolomiteEventStates(replay, opts) : null), [replay, opts]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<DolomiteFlowsFacts | null>(() => {
    if (!replay) return null;
    const rowsWith = (pred: (k: string) => boolean) =>
      replay.replayed.filter((r) => r.legs.some((l) => pred(l.bucket))).length;
    const transferKeys = new Set<string>([DL.received, DL.sent, DL.borrowedSent, DL.repaidTransfer]);
    const tradeKeys = new Set<string>([DL.bought, DL.sold, DL.borrowedTrade, DL.repaidTrade]);
    return {
      borrower: replay.borrower,
      pricing: dolomitePricing(replay),
      liquidations: replay.replayed.filter(
        (r) => (r.ev.kind === "liquidation" || r.ev.kind === "vaporize") && r.legs.length > 0,
      ).length,
      asLiquidator: rowsWith((k) => k === DL.seizedIn),
      transfers: rowsWith((k) => transferKeys.has(k)),
      ownTransfers: replay.replayed.filter((r) => r.ev.ownTransfer && r.legs.some((l) => transferKeys.has(l.bucket)))
        .length,
      trades: rowsWith((k) => tradeKeys.has(k)),
      used: [...new Set(replay.replayed.flatMap((r) => r.legs.map((l) => l.bucket)))],
      live: live != null,
      between: dailyPrices ? "store" : "carried",
    };
  }, [replay, live, dailyPrices]);
  const state: FlowsRead = p.pending
    ? "reading"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : rows === null
        ? "failed"
        : now == null || (rows != null && rows.length > 0 && !dailySettled)
          ? "reading"
          : "done";
  return { timeline, read: state, focus, facts, states };
}
