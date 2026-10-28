"use client";

// The Lifetime flows timeline for a MakerDAO / Sky vault page: the vault's
// whole history replayed by lib/makerdao/flows.ts. A page that holds the whole
// history as events hands them over; a windowed or folder-served page reads
// the flat history once (the read its CSV export makes), and a read short of
// the whole history is a failed read, since a replay of part of a history
// would state the wrong lifetime. The collateral's price comes from the
// shared daily price store (/api/prices/daily, series `maker:<ILK>`), read
// once per page; where that read fails or answers nothing, each row takes the
// nearest priced moment (a liquidation's block or today's live read). Nothing
// is read per row. It also gives the page the value that ties the panel to
// the timeline (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { fetchDailyPrices } from "@/lib/api/fetch-daily-prices";
import { useMakerIlkAt, useMakerMatChanges } from "@/lib/makerdao/use-chain-history";
import { MAKER_HEALTH_SOURCE, makerCollKey, makerMatReads } from "@/lib/makerdao/flows-health";
import { useFlowsHealth } from "@/hooks/useFlowsHealth";
import type { MakerRateLogResponse } from "@/lib/api/fetch-makerdao-rate-log";
import { makerFlowChanges } from "@/lib/makerdao/flows-changes";
import {
  MK,
  makerBorrower,
  makerFeeRates,
  makerFlowEvents,
  makerFlowTimeline,
  makerFocusEvents,
  makerPricing,
  replayMaker,
  type MakerFlowOptions,
  type MakerLive,
  type MakerPriceFrom,
} from "@/lib/makerdao/flows";

const DAY_S = 86_400;
const NO_EVENTS: never[] = [];

/** The store's series key for an ilk (rails-ops reference/daily-prices.md). */
export const makerSeriesKey = (ilk: string) => `maker:${ilk}`;

export interface MakerFlowsInput {
  ilk: string | null;
  /** The page's history read is still on its way: wait for it. */
  pending?: boolean;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  collSymbol: string | null;
  debtSymbol: string | null;
  /** The page's live read of the vault, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: MakerLive | null;
  liveSettled: boolean;
  /** The frobs that deposited an auction's leftover. */
  returnedIds: ReadonlySet<string>;
  /** The card's risk figures from the live read, for the health view's
   *  today; null where the read has not landed. */
  risk: MakerRisk | null;
  /** The ilk's stability fee history, where the page read it: the fee sets
   *  the events row marks (ruling 10). */
  rateLog?: MakerRateLogResponse | null;
}

/** The card's risk figures now. */
export interface MakerRisk {
  /** The block the live read is at. */
  block: number;
  /** The Spotter's minimum ratio (mat), a multiplier. */
  mat: number | null;
  collateralUsd: number | null;
  debt: number | null;
  /** "Liquidates at": debt × mat ÷ ink. */
  liquidationPriceUsd: number | null;
}

export interface MakerFlowsFacts {
  borrower: boolean;
  /** Rows that moved the collateral, by where their price came from. */
  pricing: Record<MakerPriceFrom, number>;
  liquidations: number;
  forks: number;
  returned: number;
  /** Rows with a stability fee since the row before. */
  feeRows: number;
  /** Whether the live read set today's figures. */
  live: boolean;
  /** "store": days between events at the store's price; "carried": the store
   *  did not answer. */
  between: "store" | "carried";
}

export function useMakerFlows(p: MakerFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: MakerFlowsFacts | null;
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
  const { returnedIds } = p;
  const rows = useMemo(() => (source ? makerFlowEvents(source, returnedIds) : null), [source, returnedIds]);

  // The daily store, one read per page from the first row's day. A failed or
  // empty read leaves `prices` null.
  const want = useMemo(
    () => (p.ilk && rows && rows.length > 0 ? { ilk: p.ilk, from: Math.floor(rows[0].ts / DAY_S) } : null),
    [p.ilk, rows],
  );
  const wantKey = want ? `${want.ilk}:${want.from}` : null;
  const [daily, setDaily] = useState<{ key: string; prices: [number, number][] | null } | null>(null);
  useEffect(() => {
    if (!want || !wantKey) return;
    const ac = new AbortController();
    const key = makerSeriesKey(want.ilk);
    fetchDailyPrices(1, [key], { from: want.from, signal: ac.signal })
      .then((byKey) => setDaily({ key: wantKey, prices: byKey?.[key] ?? null }))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setDaily({ key: wantKey, prices: null });
      });
    return () => ac.abort();
    // `wantKey` stands for `want`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey]);
  const dailySettled = want != null && daily?.key === wantKey;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const dailyPrices = dailySettled ? (daily?.prices ?? null) : null;
  const opts = useMemo<MakerFlowOptions | null>(
    () =>
      now != null && p.collSymbol && p.debtSymbol && p.liveSettled
        ? { collSymbol: p.collSymbol, debtSymbol: p.debtSymbol, now, live: p.live, daily: dailyPrices }
        : null,
    [now, p.collSymbol, p.debtSymbol, p.live, p.liveSettled, dailyPrices],
  );
  const ready = opts != null && rows != null && dailySettled;
  const replayed = useMemo(() => (ready && rows && opts ? replayMaker(rows, opts) : null), [ready, rows, opts]);
  const replayedTimeline = useMemo(
    () => (ready && rows && opts ? makerFlowTimeline(rows, opts) : null),
    [ready, rows, opts],
  );

  // The health view in the card's terms (ui-jobs 328 step 5;
  // lib/makerdao/flows-health.ts): the minimum ratio at the first row, and
  // each change to it from there to the live read's block (or the last row).
  const first = rows && rows.length > 0 ? rows[0] : null;
  const toBlock = first ? Math.max(p.risk?.block ?? 0, rows![rows!.length - 1].block) : 0;
  const matFirst = useMakerIlkAt(
    p.ilk,
    useMemo(() => (first ? [first.block] : []), [first]),
  );
  const matSpans = useMemo(
    () => (first && toBlock > first.block ? [{ from: first.block, to: toBlock }] : []),
    [first, toBlock],
  );
  const matChanges = useMakerMatChanges(p.ilk, matSpans);
  const matReads = useMemo(() => {
    if (!first || !p.collSymbol) return null;
    const ilkAt = matFirst?.reads.get(first.block) ?? null;
    const span = matSpans[0];
    const changes = span ? matChanges.get(`${span.from}-${span.to}`) : { changes: [] };
    if (!ilkAt || !changes) return null;
    return makerMatReads(p.collSymbol, { ts: first.ts, ilkAt }, changes.changes);
  }, [first, p.collSymbol, matFirst, matSpans, matChanges]);
  const risk = p.risk;
  const liveHf =
    risk && risk.mat && risk.collateralUsd != null && risk.debt != null && risk.debt > 0
      ? risk.collateralUsd / risk.debt / risk.mat
      : null;
  const liveLevels = useMemo(
    () =>
      p.collSymbol && risk?.liquidationPriceUsd != null && risk.liquidationPriceUsd > 0
        ? { [makerCollKey(p.collSymbol)]: risk.liquidationPriceUsd }
        : null,
    [p.collSymbol, risk],
  );
  const healthTimeline = useFlowsHealth(replayedTimeline, {
    reader: null,
    given: matReads,
    source: MAKER_HEALTH_SOURCE,
    events: NO_EVENTS,
    liveHf,
    liveLevels,
    liveLine: risk?.mat ?? null,
  });
  // The fee sets and the minimum ratio's changes, marked on the events row.
  const changes = useMemo(() => {
    if (!p.ilk) return [];
    const ilkAt = first ? (matFirst?.reads.get(first.block) ?? null) : null;
    const span = matSpans[0];
    const read = span ? matChanges.get(`${span.from}-${span.to}`) : null;
    return makerFlowChanges(
      p.ilk,
      p.rateLog ?? null,
      read ? { first: ilkAt?.mat ?? null, changes: read.changes } : null,
    );
  }, [p.ilk, p.rateLog, first, matFirst, matSpans, matChanges]);
  const timeline = useMemo(
    () => (healthTimeline && changes.length ? { ...healthTimeline, changes } : healthTimeline),
    [healthTimeline, changes],
  );
  const focusEvents = useMemo(
    () =>
      replayed && opts && timeline
        ? makerFocusEvents(replayed, makerFeeRates(replayed, opts), opts.collSymbol, opts.debtSymbol)
        : [],
    [replayed, opts, timeline],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<MakerFlowsFacts | null>(() => {
    if (!replayed || !rows) return null;
    const has = (k: string) => replayed.filter((r) => r.legs.some((l) => l.bucket === k)).length;
    return {
      borrower: makerBorrower(rows),
      pricing: makerPricing(replayed),
      liquidations: replayed.filter((r) => r.ev.kind === "grab").length,
      forks: replayed.filter((r) => r.ev.kind === "fork").length,
      returned: has(MK.returned),
      feeRows: has(MK.fee),
      live: p.live != null,
      between: dailyPrices ? "store" : "carried",
    };
  }, [replayed, rows, p.live, dailyPrices]);
  const read: FlowsRead = p.pending
    ? "reading"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : rows == null && source != null
        ? // A row that moved the debt states no debt: nothing to replay from.
          "failed"
        : now == null ||
            !p.liveSettled ||
            !p.collSymbol ||
            !p.debtSymbol ||
            (rows != null && rows.length > 0 && !dailySettled)
          ? "reading"
          : rows != null && rows.length > 0 && timeline == null
            ? "failed"
            : "done";
  return { timeline, read, focus, facts };
}
