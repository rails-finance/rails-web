"use client";

// The Lifetime flows timeline for an f(x) position page: the position's whole
// history replayed by lib/fx/flows.ts. A page that holds the whole history
// hands its events over; a windowed page reads the flat history once (the read
// its CSV export makes), and a read that fails is a failed read, since a
// replay of part of a history would state the wrong lifetime. The replay needs
// getPosition at block − 1 and the block for every operate and every row the
// pool made (rebalances, redemptions, pool-wide liquidations), from the page's
// /api/chain/fx/event-state reads: the same requests the card already makes,
// so the first of them are shared. f(x) is not in the daily price store, so
// nothing else is read. It also gives the page the value that ties the panel
// to the timeline (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { useFxPositionReads } from "@/lib/fx/use-event-state";
import {
  FXF,
  fxFlowReadBlocks,
  fxFlowReplay,
  fxFlowRows,
  fxFlowTimeline,
  fxFocusEvents,
  fxPricing,
  replayFx,
  type FxLive,
  type FxPriceFrom,
} from "@/lib/fx/flows";

/** More blocks than any f(x) position has (1 Oct 2026: 234 operates, 226
 *  pool-made rows at most). */
const MAX_READ_BLOCKS = 5000;

export interface FxFlowsInput {
  pool: string | null;
  positionId: string | null;
  /** The pool's token is not its normalized unit (wstETH → stETH). */
  normalizes: boolean;
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  /** Reads the whole history; null where the page has no such read. */
  fetchAll: (() => Promise<{ events: BaseActivityEvent[]; missing: number }>) | null;
  /** The normalized unit (stETH, WBTC). */
  collSymbol: string | null;
  open: boolean;
  /** Today's anchor price and the pool's settled read; `liveSettled` says
   *  whether the price read is still out. */
  live: FxLive | null;
  liveSettled: boolean;
  enabled: boolean;
}

export interface FxFlowsNoteFacts {
  /** Collateral-moving rows priced at their snapshot, at the block's min
   *  leg, at the nearest priced row, and at today's read. */
  pricing: Record<FxPriceFrom, number>;
  /** Rows of each kind the pool made. */
  rebalances: number;
  redemptions: number;
  poolLiquidations: number;
  liquidations: number;
  /** Rows carrying funding, and bad debt, since the row before. */
  fundingRows: number;
  badDebtRows: number;
  /** Debt falls between rows with no row of their own. */
  unrecorded: number;
}

const leg = (ls: { bucket: string }[], k: string) => ls.some((l) => l.bucket === k);

export function useFxFlows(p: FxFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: FxFlowsNoteFacts | null;
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
  const rows = useMemo(() => (source ? fxFlowRows(source) : null), [source]);
  const blocks = useMemo(() => (rows ? fxFlowReadBlocks(rows) : { own: [], social: [] }), [rows]);
  const pool = p.pool ?? "";
  const id = p.positionId ?? "";
  // The card's reads use these URLs for their first blocks, so those are
  // shared (lib/fx/use-event-state.ts keeps each answer for the page's life).
  const ownReads = useFxPositionReads(pool, id, blocks.own, MAX_READ_BLOCKS);
  const socialReads = useFxPositionReads(pool, id, blocks.social, MAX_READ_BLOCKS, true);
  const readsIn = (blocks.own.length === 0 || ownReads != null) && (blocks.social.length === 0 || socialReads != null);
  const reads = useMemo(
    () => (readsIn ? { ...(ownReads ?? {}), ...(socialReads ?? {}) } : null),
    [readsIn, ownReads, socialReads],
  );

  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);

  const result = useMemo(
    () =>
      rows && reads && now != null && p.liveSettled
        ? replayFx(rows, reads, { normalizes: p.normalizes, livePrice: p.live?.price ?? null, now })
        : null,
    [rows, reads, now, p.liveSettled, p.normalizes, p.live],
  );
  useEffect(() => {
    if (result && !result.ok) console.warn(`Lifetime flows: f(x) replay stopped (${result.reason})`, result.blocks);
  }, [result]);
  const replay = useMemo(() => (result?.ok ? fxFlowReplay(result.replayed) : null), [result]);
  const timeline = useMemo(
    () =>
      replay && now != null && p.collSymbol
        ? fxFlowTimeline(replay, { collSymbol: p.collSymbol, now, open: p.open, live: p.live })
        : null,
    [replay, now, p.collSymbol, p.open, p.live],
  );
  const focusEvents = useMemo(
    () => (replay && timeline && p.collSymbol ? fxFocusEvents(replay, p.collSymbol) : []),
    [replay, timeline, p.collSymbol],
  );
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo<FxFlowsNoteFacts | null>(() => {
    if (!replay) return null;
    const r = replay.replayed;
    const kind = (k: string) => r.filter((x) => x.row.kind === k).length;
    return {
      pricing: fxPricing(replay),
      rebalances: kind("rebalance"),
      redemptions: kind("redemption"),
      poolLiquidations: kind("poolLiquidation"),
      // A keeper's call that found the position already emptied moved nothing.
      liquidations: r.filter((x) => x.row.kind === "liquidation" && x.legs.length > 0).length,
      fundingRows: r.filter((x) => leg(x.legs, FXF.funding)).length,
      badDebtRows: r.filter((x) => leg(x.legs, FXF.badDebt)).length,
      unrecorded: r.filter((x) => x.unrecorded).length,
    };
  }, [replay]);
  const read: FlowsRead = !p.enabled
    ? "failed"
    : p.wholeEvents == null && fetched.read !== "done"
      ? fetched.read
      : rows && rows.length === 0
        ? "done"
        : result == null || now == null || !p.collSymbol
          ? "reading"
          : !result.ok || timeline == null
            ? "failed"
            : "done";
  return { timeline, read, focus, facts };
}
