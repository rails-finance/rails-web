"use client";

// The Lifetime flows timeline for an Aave V3 Pool account on Base (Aave V3 on
// Base, Seamless): the account's whole history replayed by
// lib/aave-v3-base/flows.ts. A page that holds the whole history as events
// hands them over; a folder-served page reads the flat history once (the read
// its CSV export makes). Where the page's history is elided (a heavy wallet's
// seed and tail, or more rows than the page draws), or the flat read comes
// back short, the server's replay of every row answers instead
// (/api/{aave-v3-base,seamless}/flows, lib/api/fetch-aave-base-flows.ts); a
// read that neither gives is a failed read, since a replay of part of a
// history would state the wrong lifetime. Between events each reserve takes
// its day's price from the shared daily price store (/api/prices/daily);
// where that read fails the last event's price is carried. It also gives the
// page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { fetchDailyPrices } from "@/lib/api/fetch-daily-prices";
import {
  aaveBaseFlowTimeline,
  aaveBaseFocusEvents,
  aaveBaseReplay,
  aaveBaseTimelineFromSummary,
  aaveBaseWrittenOff,
  isAaveBaseInterest,
  type AaveBaseFlowOptions,
  type AaveBaseLiveReserve,
} from "@/lib/aave-v3-base/flows";
import { fetchAaveBaseFlows, isAaveBaseSummaryAnswer, type AaveBaseFlowAnswer } from "@/lib/api/fetch-aave-base-flows";
import type { FocusEvent } from "@/lib/shared/flow-focus";

type RouteSummary = Extract<AaveBaseFlowAnswer, { days: unknown }>;

const DAY_S = 86_400;
const BASE_CHAIN_ID = 8453;

export interface AaveV3BaseFlowsInput {
  /** The daily store's family, and the flows route's lane. */
  family: "aave-v3-base" | "seamless";
  wallet: string;
  /** The page's history is elided (`coverage.omitted`): the server's replay
   *  answers without a flat read first. */
  elided: boolean;
  /** The Pool's brand: "Aave" or "Seamless". */
  brand: string;
  /** The block of the Pool's first DeficitCreated (Aave V3 on Base); null
   *  where the Pool writes nothing off unseen. */
  writeOffFrom: number | null;
  notCounted?: readonly string[];
  /** The page's history read is still on its way: wait for it. */
  pending?: boolean;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page cannot (the panel
   *  then states a failed read). */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** The Pool read, where it landed. */
  chain: AaveV3PositionChainResponse | null;
  /** The oracle's price now by lowercase reserve (the page's read). */
  prices: Record<string, number>;
}

export interface AaveV3BaseFlowsFacts {
  borrower: boolean;
  /** Legs valued at their block's price, at the store's for their day, at the
   *  nearest priced row's, and at today's. */
  priced: { block: number; day: number; nearest: number; today: number };
  liquidations: number;
  /** Liquidations whose liquidator took aTokens, and treasury fees. */
  aTokenSeizures: number;
  treasuryFees: number;
  transfersIn: number;
  transfersOut: number;
  interestRows: number;
  /** Whether the Pool read set today's balances. */
  live: boolean;
  /** "store": days between events at the daily store's price; "carried":
   *  the store did not answer, so each reserve keeps its last event's price. */
  between: "store" | "carried";
  /** Debt the Pool wrote off that no row states. */
  writtenOff: { symbol: string; amount: number }[];
  /** "route": the server replayed every row the Base box holds, `events` of
   *  them; "page": the page's rows. */
  source: "page" | "route";
  events: number;
}

export function useAaveV3BaseFlows(p: AaveV3BaseFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: AaveV3BaseFlowsFacts | null;
} {
  const [fetched, setFetched] = useState<{
    events: BaseActivityEvent[] | null;
    route: RouteSummary | null;
    read: FlowsRead;
  }>({ events: null, route: null, read: "reading" });
  const needRead = p.wholeEvents == null && !p.pending;
  const { fetchAll, family, wallet, elided } = p;
  useEffect(() => {
    if (!needRead) return;
    let cancelled = false;
    const failed = (err?: unknown) => {
      if (err) console.warn("Lifetime flows history not read:", err);
      if (!cancelled) setFetched({ events: null, route: null, read: "failed" });
    };
    // The server's replay of every row.
    const viaRoute = () =>
      fetchAaveBaseFlows(family, wallet).then((a) => {
        if (cancelled) return;
        if (isAaveBaseSummaryAnswer(a)) setFetched({ events: null, route: a, read: "done" });
        else failed(`the flows route refused (${a.refused})`);
      }, failed);
    setFetched({ events: null, route: null, read: "reading" });
    if (elided || !fetchAll) void viaRoute();
    else
      fetchAll()
        .then(({ events, missing }) => {
          if (cancelled) return;
          if (missing > 0) void viaRoute();
          else setFetched({ events, route: null, read: "done" });
        })
        .catch(() => void viaRoute());
    return () => {
      cancelled = true;
    };
  }, [needRead, fetchAll, family, wallet, elided]);

  const source = p.pending ? null : (p.wholeEvents ?? fetched.events);
  const route = p.pending || p.wholeEvents ? null : fetched.route;

  // The reserves the history names, and its first day, for the store's read.
  const want = useMemo(() => {
    if (route) {
      if (route.days.length === 0) return null;
      const list = route.assets.map((a) => a.asset).sort();
      return { reserves: list, from: route.days[0].day, key: list.join(",") };
    }
    if (!source || source.length === 0) return null;
    const reserves = new Set<string>();
    let first = Infinity;
    for (const e of source) {
      first = Math.min(first, e.timestamp);
      for (const f of e.flows) if (f.token) reserves.add(f.token.toLowerCase());
      const c = (e.context as { data?: { reserve?: string; collateralAsset?: string } }).data;
      if (c?.reserve) reserves.add(c.reserve.toLowerCase());
      if (c?.collateralAsset) reserves.add(c.collateralAsset.toLowerCase());
    }
    const list = [...reserves].sort();
    return { reserves: list, from: Math.floor(first / DAY_S), key: list.join(",") };
  }, [source, route]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  useEffect(() => {
    if (!want) return;
    const ac = new AbortController();
    fetchDailyPrices(
      BASE_CHAIN_ID,
      want.reserves.map((r) => `${family}:${r}`),
      { from: want.from, signal: ac.signal },
    )
      .then((byKey) => {
        const prices: Record<string, [number, number][]> = {};
        for (const r of want.reserves) {
          const obs = byKey?.[`${family}:${r}`];
          if (obs && obs.length > 0) prices[r] = obs;
        }
        setDaily({ key: want.key, prices: Object.keys(prices).length > 0 ? prices : null });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setDaily({ key: want.key, prices: null });
      });
    return () => ac.abort();
    // `want.key` stands for the reserves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want?.key, want?.from, family]);
  const dailySettled = want != null && daily?.key === want.key;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const live = useMemo<Record<string, AaveBaseLiveReserve> | null>(() => {
    if (!p.chain || p.chain.chainStale) return null;
    const out: Record<string, AaveBaseLiveReserve> = {};
    for (const r of p.chain.reserves) {
      const scale = 10 ** r.decimals;
      out[r.address.toLowerCase()] = {
        supply: Number(r.supplyBalanceRaw) / scale,
        debt: Number(r.debtBalanceRaw) / scale,
      };
    }
    return out;
  }, [p.chain]);
  const dailyPrices = dailySettled ? (daily?.prices ?? undefined) : undefined;
  const { brand, writeOffFrom, notCounted, prices } = p;
  const opts = useMemo<AaveBaseFlowOptions | null>(
    () =>
      now != null
        ? {
            now,
            live,
            todayPrices: prices,
            brand,
            writeOffFrom,
            ...(notCounted ? { notCounted } : {}),
            ...(dailyPrices ? { dailyPrices } : {}),
          }
        : null,
    [now, live, prices, brand, writeOffFrom, notCounted, dailyPrices],
  );
  const replay = useMemo(
    () => (source && opts && (dailySettled || source.length === 0) ? aaveBaseReplay(source, opts) : null),
    [source, opts, dailySettled],
  );
  const routeReady = route != null && opts != null && (dailySettled || route.days.length === 0);
  const timeline = useMemo(
    () =>
      replay && opts
        ? aaveBaseFlowTimeline(replay, opts)
        : routeReady && route && opts
          ? aaveBaseTimelineFromSummary(route, opts)
          : null,
    [replay, opts, route, routeReady],
  );
  const focusEvents = useMemo<FocusEvent[]>(
    () => (replay ? aaveBaseFocusEvents(replay) : route ? route.events : []),
    [replay, route],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<AaveV3BaseFlowsFacts | null>(() => {
    if (!replay && routeReady && route && opts)
      return {
        borrower: route.borrower,
        ...route.facts,
        live: live != null,
        between: dailyPrices ? "store" : "carried",
        writtenOff: aaveBaseWrittenOff(route, opts).map((w) => ({ symbol: w.symbol, amount: w.amount })),
        source: "route",
        events: route.totalEvents,
      };
    if (!replay) return null;
    const priced = { block: 0, day: 0, nearest: 0, today: 0 };
    for (const r of replay.replayed)
      for (const l of r.legs) {
        if (isAaveBaseInterest(l.bucket)) continue;
        if (l.basis === "block") priced.block++;
        else if (l.basis === "day") priced.day++;
        else if (l.basis === "nearest") priced.nearest++;
        else priced.today++;
      }
    const rows = (k: string) => replay.replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
    return {
      borrower: replay.borrower,
      priced,
      liquidations: replay.replayed.filter((r) => r.ev.context.data.eventType === "liquidation").length,
      aTokenSeizures: new Set(replay.replayed.filter((r) => r.seizureTransfer).map((r) => r.tx)).size,
      treasuryFees: replay.replayed.filter((r) => r.treasuryFee).length,
      transfersIn: rows("received"),
      transfersOut: rows("sent"),
      interestRows: replay.replayed.filter((r) => r.legs.some((l) => isAaveBaseInterest(l.bucket))).length,
      live: live != null,
      between: dailyPrices ? "store" : "carried",
      writtenOff: replay.writtenOff.map((w) => ({ symbol: w.symbol, amount: w.amount })),
      source: "page",
      events: replay.replayed.length,
    };
  }, [replay, live, dailyPrices, route, routeReady, opts]);
  const state: FlowsRead = p.pending
    ? "reading"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null ||
          (source != null && source.length > 0 && !dailySettled) ||
          (route != null && route.days.length > 0 && !dailySettled)
        ? "reading"
        : "done";
  return { timeline, read: state, focus, facts };
}
