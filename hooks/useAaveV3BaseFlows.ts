"use client";

// The Lifetime flows timeline for an Aave V3 Pool account on Base (Aave V3 on
// Base, Seamless): the account's whole history replayed by
// lib/aave-v3-base/flows.ts. A page that holds the whole history as events
// hands them over; a folder-served page reads the flat history once (the read
// its CSV export makes), and a read short of the whole history (a heavy
// wallet's elided rows, a holed or horizoned sweep) is a failed read, since a
// replay of part of a history would state the wrong lifetime. Between events
// each reserve takes its day's price from the shared daily price store
// (/api/prices/daily); where that read fails the last event's price is
// carried. It also gives the page the value that ties the panel to the
// timeline (components/shared/flow-focus-context.tsx).

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
  isAaveBaseInterest,
  type AaveBaseFlowOptions,
  type AaveBaseLiveReserve,
} from "@/lib/aave-v3-base/flows";

const DAY_S = 86_400;
const BASE_CHAIN_ID = 8453;

export interface AaveV3BaseFlowsInput {
  /** The daily store's family: "aave-v3-base" or "seamless". */
  family: string;
  /** The Pool's own words: "Aave" or "Seamless". */
  brand: string;
  /** The block of the Pool's first DeficitCreated (Aave V3 on Base); null
   *  where the Pool writes nothing off unseen. */
  writeOffFrom: number | null;
  notCounted?: readonly string[];
  /** The page's own history read is still on its way: wait for it. */
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
}

export function useAaveV3BaseFlows(p: AaveV3BaseFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: AaveV3BaseFlowsFacts | null;
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

  // The reserves the history names, and its first day, for the store's read.
  const want = useMemo(() => {
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
  }, [source]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  const { family } = p;
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
  const timeline = useMemo(() => (replay && opts ? aaveBaseFlowTimeline(replay, opts) : null), [replay, opts]);
  const focusEvents = useMemo(() => (replay ? aaveBaseFocusEvents(replay) : []), [replay]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<AaveV3BaseFlowsFacts | null>(() => {
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
    };
  }, [replay, live, dailyPrices]);
  const state: FlowsRead = p.pending
    ? "reading"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && source.length > 0 && !dailySettled)
        ? "reading"
        : "done";
  return { timeline, read: state, focus, facts };
}
