"use client";

// The Lifetime flows timeline for a Compound V2 account page: the account's
// whole history replayed by lib/shared/ctoken-flows.ts through
// lib/compound-v2/flows.ts. A page that holds the whole history as events
// hands them over; a windowed or folder-served page reads the flat history
// once (the read its CSV export makes), and a read short of the whole history
// is a failed read, since a replay of part of a history would state the wrong
// lifetime. The oracle price at each row's block comes from the row (a
// liquidation's legs), else from the prices the server stores for every event
// row (/api/compound-v2/prices-at), else from the archive
// (/api/chain/compound-v2/prices-at) for the pairs not stored yet: at most 400
// pairs a page. Between events each market is valued at the daily price
// store's price for the day (`cv2:<cToken>`), one read per page. It also
// gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx) and each event's account for its
// card's ledgers.

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import { fetchCompoundV2PricesAt } from "@/lib/api/fetch-compound-v2-prices-at";
import { fetchStoredV2Prices } from "@/lib/api/fetch-compound-stored-prices";
import { fetchDailyAnswer } from "@/lib/api/fetch-daily-prices";
import { compoundV2DailyPrices, compoundV2SeriesKey, storedV2Prices } from "@/lib/compound-v2/at-block-prices";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
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
  /** "store": days between events at the daily store's price; "carried":
   *  each market keeps its latest priced row's. */
  between: "store" | "carried";
}

const DAY_S = 86_400;

/** The pairs' prices: the stored ones first, the archive for the pairs the
 *  server has not stored (or all of them, where the stored read failed). */
async function pricesAt(pairs: string[], signal: AbortSignal): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const stored = await fetchStoredV2Prices(pairs, signal).catch((err) => {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return null;
  });
  let rest = pairs;
  if (stored) {
    for (const [k, v] of storedV2Prices(stored)) out.set(k, v);
    const missing = new Set(stored.missing);
    rest = pairs.filter((p) => missing.has(p));
  }
  if (rest.length > 0) {
    const read = await fetchCompoundV2PricesAt(rest, signal);
    for (const [k, v] of read ?? []) out.set(k, v);
  }
  return out;
}

export function useCompoundV2Flows(p: CompoundV2FlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: CompoundV2FlowsFacts | null;
  states: Map<string, CTokenEventState> | null;
  /** Each (block, market) price read, keyed "block:market", in USD. */
  prices: ReadonlyMap<string, number> | null;
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
    pricesAt(pairs, ac.signal)
      .then((m) => setRead({ key: pairsKey, map: m }))
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

  // The daily store, one read per page: each market's series from its first
  // row's day, and USDC's for the oracle's ETH years. A failed or empty read
  // carries each market's latest priced row.
  const want = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const markets = [...new Set(rows.map((r) => r.market))].filter((m) => COMPOUND_V2_MARKET_BY_KEY[m]);
    return { markets, from: Math.floor(rows[0].ts / DAY_S), key: markets.join(",") };
  }, [rows]);
  const [daily, setDaily] = useState<{ key: string; prices: Record<string, [number, number][]> | null } | null>(null);
  useEffect(() => {
    if (!want) return;
    const ac = new AbortController();
    const keys = [...new Set([...want.markets, "usdc"])].map((m) =>
      compoundV2SeriesKey(COMPOUND_V2_MARKET_BY_KEY[m].ctoken),
    );
    fetchDailyAnswer(1, keys, { from: want.from, signal: ac.signal })
      .then((body) => {
        const prices = body ? compoundV2DailyPrices(body, want.markets) : {};
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
  const dailyPrices = dailySettled ? (daily?.prices ?? undefined) : undefined;

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
      now != null
        ? {
            vocab: { brand: "Compound", receipt: "cToken" },
            now,
            live,
            todayPrices: p.todayPrices,
            ...(dailyPrices ? { dailyPrices } : {}),
          }
        : null,
    [now, live, p.todayPrices, dailyPrices],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? ctokenFlowReplay(rows, opts) : null), [rows, opts]);
  const timeline = useMemo(
    () => (rows && opts && (dailySettled || rows.length === 0) ? ctokenFlowTimeline(rows, opts) : null),
    [rows, opts, dailySettled],
  );
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
      between: dailyPrices ? "store" : "carried",
    };
  }, [replay, rows, live, p.fixedPrices, dailyPrices]);
  const state: FlowsRead =
    p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || (source != null && prices == null) || (rows != null && rows.length > 0 && !dailySettled)
        ? "reading"
        : "done";
  return { timeline, read: state, focus, facts, states, prices };
}
