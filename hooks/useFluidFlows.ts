"use client";

// The Lifetime flows timeline for a Fluid position page: the position's whole
// history replayed by lib/fluid/flows.ts. A page that holds the whole history
// as events hands them over; a windowed page reads the flat history once (the
// read its CSV export makes), and a read short of the whole history is a
// failed read, since a replay of part of a history would state the wrong
// lifetime. The vault oracle comes from the rows (each row's block, server mig
// 114), the shared daily price store between events (/api/prices/daily,
// series `fluid:<vault>`, read once per page) and the page's live read;
// nothing is read per row. Where the store's read fails or answers nothing,
// the collateral keeps its latest event's price between events. It also gives
// the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { dailyPricesFromAnswer, fetchDailyAnswer } from "@/lib/api/fetch-daily-prices";
import {
  FL,
  fluidFlowEvents,
  fluidFlowReplay,
  fluidFlowTimeline,
  fluidFocusEvents,
  fluidPricing,
  type FluidLive,
} from "@/lib/fluid/flows";
import {
  FLUID_COLL_KEY,
  FLUID_HEALTH_SOURCE,
  FLUID_HISTORY_HEALTH_SOURCE,
  fluidHeldRead,
} from "@/lib/fluid/flows-health";
import { fluidThresholdChanges, fluidThresholdReads, type FluidThresholdHistory } from "@/lib/fluid/threshold-history";
import { withChanges } from "@/lib/shared/flows-changes";
import { useFlowsHealth } from "@/hooks/useFlowsHealth";

const DAY_S = 86_400;
const NO_EVENTS: never[] = [];

/** The store's series key for a vault (rails-ops reference/daily-prices.md). */
export const fluidSeriesKey = (vault: string) => `fluid:${vault.toLowerCase()}`;

export interface FluidFlowsInput {
  /** The vault's address, for the daily store's series. */
  vault: string | null;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole flat history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  collSymbol: string | null;
  debtSymbol: string | null;
  open: boolean;
  /** The page's live read of the position, null until it lands or where it
   *  failed; `liveSettled` says whether it is still out. */
  live: FluidLive | null;
  liveSettled: boolean;
  /** False on a smart vault: the page does not draw the panel. */
  enabled: boolean;
  /** The card's risk figures from the live read, for the health view; null
   *  where the read has not landed. */
  risk: FluidRisk | null;
}

/** The card's risk figures now. */
export interface FluidRisk {
  /** The block the live read is at. */
  block: number;
  /** The vault's liquidation threshold, a fraction. */
  liquidationThreshold: number;
  /** The card's position ratio: debt ÷ (collateral × liquidate price). */
  ratio: number | null;
  /** The price, debt per collateral, at which that ratio reaches the
   *  threshold. */
  liqPriceDebtPerCol: number | null;
}

export interface FluidFlowsNoteFacts {
  borrower: boolean;
  /** Collateral flows valued at their own block's oracle price (`rowLiq`
   *  of them liquidations), at the nearest priced row's, and at today's
   *  oracle read. */
  pricing: { row: number; rowLiq: number; nearest: number; today: number };
  /** "store": days between events at the store's price; "carried": the store
   *  did not answer. */
  between: "store" | "carried";
  liquidations: number;
  absorbs: number;
  /** Rows before which a balance fell with no row of its own, booked as
   *  liquidations. */
  unrecorded: number;
  /** Rows with interest since the row before, per side. */
  earnedRows: number;
  accruedRows: number;
}

export function useFluidFlows(p: FluidFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: FluidFlowsNoteFacts | null;
} {
  const [fetched, setFetched] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const needRead = p.enabled && p.wholeEvents == null;
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

  const source = p.enabled ? (p.wholeEvents ?? fetched.events) : null;
  const rows = useMemo(() => (source ? fluidFlowEvents(source) : null), [source]);

  // The daily store, one read per page from the first row's day. A failed or
  // empty read leaves `prices` null.
  const want = useMemo(
    () => (p.vault && rows && rows.length > 0 ? { vault: p.vault, from: Math.floor(rows[0].ts / DAY_S) } : null),
    [p.vault, rows],
  );
  const wantKey = want ? `${want.vault}:${want.from}` : null;
  const [daily, setDaily] = useState<{ key: string; prices: [number, number][] | null } | null>(null);
  useEffect(() => {
    if (!want || !wantKey) return;
    const ac = new AbortController();
    const key = fluidSeriesKey(want.vault);
    fetchDailyAnswer(1, [key], { from: want.from, signal: ac.signal })
      .then((body) => {
        const byKey = body ? dailyPricesFromAnswer(body, (u) => u.startsWith("token:")) : null;
        setDaily({ key: wantKey, prices: byKey?.[key] ?? null });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setDaily({ key: wantKey, prices: null });
      });
    return () => ac.abort();
    // `wantKey` stands for `want`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey]);
  // No rows: nothing to wait for.
  const dailySettled = want == null || daily?.key === wantKey;
  const dailyPrices = want != null && daily?.key === wantKey ? daily.prices : null;

  // The vault's threshold history (/api/fluid/threshold-history), one read
  // per page. A failed read leaves `history` null: the view holds today's
  // threshold.
  const vaultKey = p.enabled && p.vault ? p.vault.toLowerCase() : null;
  const [thresholds, setThresholds] = useState<{ key: string; history: FluidThresholdHistory | null } | null>(null);
  useEffect(() => {
    if (!vaultKey) return;
    const ac = new AbortController();
    fetch(`/api/fluid/threshold-history?vault=${vaultKey}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<FluidThresholdHistory>) : null))
      .then((history) => setThresholds({ key: vaultKey, history }))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setThresholds({ key: vaultKey, history: null });
      });
    return () => ac.abort();
  }, [vaultKey]);
  const thresholdsSettled = vaultKey == null || thresholds?.key === vaultKey;
  const history = vaultKey != null && thresholds?.key === vaultKey ? thresholds.history : null;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const opts = useMemo(
    () =>
      now != null && p.collSymbol && p.debtSymbol && p.liveSettled && dailySettled
        ? { collSymbol: p.collSymbol, debtSymbol: p.debtSymbol, now, open: p.open, live: p.live, daily: dailyPrices }
        : null,
    [now, p.collSymbol, p.debtSymbol, p.open, p.live, p.liveSettled, dailySettled, dailyPrices],
  );
  const replay = useMemo(() => (rows && opts && rows.length > 0 ? fluidFlowReplay(rows, opts) : null), [rows, opts]);
  const replayedTimeline = useMemo(() => (rows && opts ? fluidFlowTimeline(rows, opts) : null), [rows, opts]);
  // The health view in the card's terms (ui-jobs 328 steps 5 and 8;
  // lib/fluid/flows-health.ts): the threshold in force each day from the
  // vault's config logs, or today's held across the life where they do not
  // reach the first event.
  const risk = p.risk;
  const stepped = useMemo(
    () => (rows && rows.length > 0 ? fluidThresholdReads(history, { ts: rows[0].ts, block: rows[0].block }) : null),
    [history, rows],
  );
  const given = useMemo(() => {
    if (!thresholdsSettled) return null;
    if (stepped) return stepped;
    const r = risk ? fluidHeldRead(risk.liquidationThreshold, risk.block) : null;
    return r ? [r] : null;
  }, [thresholdsSettled, stepped, risk]);
  const grain = 10 ** (replayedTimeline?.unit?.scale ?? 0);
  const liveLevels = useMemo(
    () =>
      risk?.liqPriceDebtPerCol != null && risk.liqPriceDebtPerCol > 0
        ? { [FLUID_COLL_KEY]: risk.liqPriceDebtPerCol * grain }
        : null,
    [risk, grain],
  );
  const healthTimeline = useFlowsHealth(replayedTimeline, {
    reader: null,
    given,
    source: stepped ? FLUID_HISTORY_HEALTH_SOURCE : FLUID_HEALTH_SOURCE,
    events: NO_EVENTS,
    liveHf: risk?.ratio != null && risk.ratio > 0 ? risk.liquidationThreshold / risk.ratio : null,
    liveLevels,
    liveLine: risk?.liquidationThreshold ?? null,
  });
  // Each change to the threshold, marked on the events row.
  const changes = useMemo(() => fluidThresholdChanges(history), [history]);
  const timeline = useMemo(() => withChanges(healthTimeline, changes), [healthTimeline, changes]);
  const focusEvents = useMemo(
    () =>
      replay && timeline && p.collSymbol && p.debtSymbol ? fluidFocusEvents(replay, p.collSymbol, p.debtSymbol) : [],
    [replay, timeline, p.collSymbol, p.debtSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<FluidFlowsNoteFacts | null>(() => {
    if (!replay) return null;
    const liq = replay.replayed.filter((r) => r.ev.kind === "liquidated" || r.ev.kind === "absorbed");
    return {
      borrower: replay.borrower,
      pricing: fluidPricing(replay),
      liquidations: liq.filter((r) => r.ev.kind === "liquidated").length,
      absorbs: liq.filter((r) => r.ev.kind === "absorbed").length,
      unrecorded: replay.replayed.filter((r) => r.unrecorded).length,
      earnedRows: replay.replayed.filter((r) => r.legs.some((l) => l.bucket === FL.earned)).length,
      accruedRows: replay.replayed.filter((r) => r.legs.some((l) => l.bucket === FL.accrued)).length,
      between: dailyPrices && dailyPrices.length > 0 ? "store" : "carried",
    };
  }, [replay, dailyPrices]);
  const read: FlowsRead = !p.enabled
    ? "failed"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : now == null || !p.liveSettled || !p.collSymbol || !p.debtSymbol || !dailySettled || !thresholdsSettled
        ? "reading"
        : // A borrower whose collateral has no price at all (no priced row and
          // no live read) cannot be drawn in the debt token.
          rows && rows.length > 0 && timeline == null
          ? "failed"
          : "done";
  return { timeline, read, focus, facts };
}
