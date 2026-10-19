"use client";

// The Lifetime flows timeline for a Polaris CDP page: the CDP's whole
// history replayed by lib/polaris/flows.ts. The page holds the whole history
// (the index answers it in one read), and today's figures are the page's live
// read of the CDP (/api/chain/polaris/position: the entire collateral and
// debt and each leg pending since the last touch), and the market's pETH
// price on each completed day comes from the shared daily price store
// (/api/prices/daily, series `polaris:<market>`, chain 11155111); where that
// read fails, a day between events keeps the last event's price. It also gives the page
// the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import { dailyPricesFromAnswer, fetchDailyAnswer } from "@/lib/api/fetch-daily-prices";
import {
  polarisFlowFacts,
  polarisFlowLive,
  polarisFlowRows,
  polarisFlowTimeline,
  polarisFocusEvents,
  polarisSeriesKey,
  replayPolaris,
  type PolarisFlowFacts,
} from "@/lib/polaris/flows";

const DAY_S = 86_400;
const SEPOLIA = 11155111;

export interface PolarisFlowsInput {
  /** The CDP's events (the whole history), or null while the index has not
   *  answered. */
  events: BaseActivityEvent[] | null;
  /** The live read, where it answered; `chainSettled` says whether it is
   *  still out. */
  chain: PolarisChainResponse | null;
  chainSettled: boolean;
  stable: string;
  /** The CDP is open (the page's verdict). */
  open: boolean;
}

export function usePolarisFlows(p: PolarisFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: PolarisFlowFacts | null;
} {
  const rows = useMemo(() => (p.events ? polarisFlowRows(p.events) : null), [p.events]);
  const live = useMemo(() => (p.chainSettled ? polarisFlowLive(p.chain) : null), [p.chain, p.chainSettled]);

  // The daily store, one read per page from the first row's day. A failed or
  // empty read leaves `daily` null.
  const seriesKey = polarisSeriesKey(p.stable);
  const fromDay = rows && rows.length > 0 ? Math.floor(rows[0].ts / DAY_S) : null;
  const wantKey = seriesKey && fromDay != null ? `${seriesKey}:${fromDay}` : null;
  const [store, setStore] = useState<{ key: string; prices: [number, number][] | null } | null>(null);
  useEffect(() => {
    if (!wantKey || !seriesKey || fromDay == null) return;
    const ac = new AbortController();
    fetchDailyAnswer(SEPOLIA, [seriesKey], { from: fromDay, signal: ac.signal })
      .then((body) => {
        const byKey = body ? dailyPricesFromAnswer(body, (u) => u.startsWith("token:")) : null;
        setStore({ key: wantKey, prices: byKey?.[seriesKey] ?? null });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setStore({ key: wantKey, prices: null });
      });
    return () => ac.abort();
    // `wantKey` stands for `seriesKey` and `fromDay`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey]);
  // No rows: nothing to wait for.
  const storeSettled = wantKey == null || store?.key === wantKey;
  const daily = wantKey != null && store?.key === wantKey ? store.prices : null;

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);

  const replay = useMemo(
    () => (rows && rows.length > 0 && now != null && p.chainSettled ? replayPolaris(rows, live, now) : null),
    [rows, live, now, p.chainSettled],
  );
  useEffect(() => {
    if (replay && (replay.unchained.length > 0 || replay.unbalanced.length > 0))
      console.warn("Lifetime flows: Polaris rows do not chain", replay.unchained, replay.unbalanced);
  }, [replay]);
  const ok = replay != null && replay.unchained.length === 0 && replay.unbalanced.length === 0;
  const timeline = useMemo(
    () =>
      ok && replay && now != null && storeSettled
        ? polarisFlowTimeline(replay, { stable: p.stable, now, open: p.open, live, daily })
        : null,
    [ok, replay, now, p.stable, p.open, live, storeSettled, daily],
  );
  const focusEvents = useMemo(
    () => (replay && timeline ? polarisFocusEvents(replay, p.stable) : []),
    [replay, timeline, p.stable],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(
    () => (replay && ok && storeSettled ? polarisFlowFacts(replay, live, daily) : null),
    [replay, ok, live, storeSettled, daily],
  );
  const read: FlowsRead =
    rows == null || now == null || !p.chainSettled || !storeSettled
      ? "reading"
      : rows.length === 0
        ? "done"
        : timeline == null
          ? "failed"
          : "done";
  return { timeline, read, focus, facts };
}
