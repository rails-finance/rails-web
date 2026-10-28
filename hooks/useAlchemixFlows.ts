"use client";

// The Lifetime flows timeline for an Alchemist position page (Alchemix V3,
// Ethereum and Base): the position's V3 rows replayed by lib/alchemix/flows.ts,
// every balance a getCDP reading the rows carry, so nothing is read beyond the
// page's rows and its live read. A page whose rows stop short of the whole
// history withholds the panel: a replay of part of a history would state the
// wrong lifetime. The chart opens on the card's collateralisation against the
// Alchemist's lower bound read at each picked event's block
// (lib/alchemix/flows-health.ts), over the vault's share price per reading.
// It also gives the page the value that ties the panel to the timeline
// (components/shared/flow-focus-context.tsx).

import { useEffect, useMemo, useState } from "react";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { useFlowFocusRoot, useFlowFocusValue, type FlowFocusValue } from "@/components/shared/flow-focus-context";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { useFlowsHealth, type HealthPick, type HealthReader } from "@/hooks/useFlowsHealth";
import { healthRead } from "@/lib/shared/health-reads";
import { withChanges } from "@/lib/shared/flows-changes";
import {
  ALCHEMIX_MYT_KEY,
  alchemixFlowEvents,
  alchemixFlowFacts,
  alchemixFlowReplay,
  alchemixFlowTimeline,
  alchemixFocusEvents,
  type AlchemixFlowFacts,
  type AlchemixLive,
} from "@/lib/alchemix/flows";
import {
  alchemistOf,
  alchemixBoundChanges,
  alchemixBoundRead,
  alchemixHealthFinish,
  alchemixHealthSource,
  alchemixLiqSharePrice,
  isAlchemixBoundAt,
} from "@/lib/alchemix/flows-health";

const NO_EVENTS: never[] = [];
const DAY_S = 86_400;

export interface AlchemixFlowsInput {
  /** The page's events, when they are the whole history; null otherwise. */
  wholeEvents: BaseActivityEvent[] | null;
  chainId: number;
  lineKey: string;
  underlyingSymbol: string | null;
  underlyingDecimals: number | null;
  mytSymbol: string;
  mytAddress?: string | null;
  syntheticSymbol: string;
  open: boolean;
  /** The page's live read, where it landed. */
  live: AlchemixLive | null;
  /** The card's lower bound and collateralisation now, fractions (1.25 is
   *  125 %); the collateralisation null with no debt. */
  bound: number | null;
  collateralisation: number | null;
}

export function useAlchemixFlows(p: AlchemixFlowsInput): {
  timeline: FlowTimeline | null;
  read: FlowsRead;
  focus: FlowFocusValue;
  facts: AlchemixFlowFacts | null;
} {
  // Set on mount, so the server's render and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const { wholeEvents, underlyingDecimals } = p;
  const rows = useMemo(
    () => (wholeEvents && underlyingDecimals != null ? alchemixFlowEvents(wholeEvents, underlyingDecimals) : null),
    [wholeEvents, underlyingDecimals],
  );
  const replay = useMemo(() => (rows ? alchemixFlowReplay(rows) : null), [rows]);
  // Keyed by its figures: the page hands a new object on each render.
  const live = p.open ? p.live : null;
  const [lShares, lDebt, lPrice, lBlock] = [live?.shares, live?.debt, live?.sharePrice, live?.block];
  const opts = useMemo(
    () =>
      now != null && p.underlyingSymbol
        ? {
            underlyingSymbol: p.underlyingSymbol,
            mytSymbol: p.mytSymbol,
            syntheticSymbol: p.syntheticSymbol,
            mytAddress: p.mytAddress ?? null,
            chainId: p.chainId,
            lineKey: p.lineKey,
            now,
            live:
              lShares != null && lDebt != null && lBlock != null
                ? { shares: lShares, debt: lDebt, sharePrice: lPrice ?? null, block: lBlock }
                : null,
          }
        : null,
    [
      now,
      p.underlyingSymbol,
      p.mytSymbol,
      p.syntheticSymbol,
      p.mytAddress,
      p.chainId,
      p.lineKey,
      lShares,
      lDebt,
      lPrice,
      lBlock,
    ],
  );
  const replayedTimeline = useMemo(() => (replay && opts ? alchemixFlowTimeline(replay, opts) : null), [replay, opts]);

  // The health view in the card's terms (ui-jobs 328 steps 6 and 8): the
  // collateralisation against the lower bound at each picked event's block.
  const bound = p.bound != null && p.bound > 0 ? p.bound : null;
  const alchemist = useMemo(() => (wholeEvents ? alchemistOf(wholeEvents) : null), [wholeEvents]);
  const healthEvents = useMemo<HealthPick[]>(
    () => (replay ? replay.replayed.map((r) => ({ blockNumber: r.ev.block, timestamp: r.ev.ts })) : NO_EVENTS),
    [replay],
  );
  const reader = useMemo<HealthReader | null>(() => {
    if (!alchemist) return null;
    const qs = `chain=${p.chainId}&alchemist=${alchemist}`;
    return {
      key: `alchemix:${qs}`,
      load: (e) =>
        healthRead(`/api/chain/alchemix/bound-at-block?${qs}&block=${e.blockNumber}`, (b) =>
          isAlchemixBoundAt(b) ? b : null,
        ).then((a) => (a ? alchemixBoundRead(a, e.timestamp) : null)),
    };
  }, [alchemist, p.chainId]);
  const healthSource = useMemo(
    () => alchemixHealthSource(p.chainId, p.underlyingSymbol ?? "the underlying", p.mytSymbol),
    [p.chainId, p.underlyingSymbol, p.mytSymbol],
  );
  const grain = replay?.grain ?? 1;
  const [rColl, rBound] = [p.open ? (p.collateralisation ?? 0) : 0, bound ?? 0];
  const liveLevels = useMemo(
    () =>
      rColl > 0 && rBound > 0 && lPrice != null && lPrice > 0
        ? { [ALCHEMIX_MYT_KEY]: ((lPrice * rBound) / rColl) * grain }
        : lShares != null && lShares > 0 && lDebt != null && lDebt > 0 && rBound > 0
          ? { [ALCHEMIX_MYT_KEY]: alchemixLiqSharePrice(lShares, lDebt, rBound) * grain }
          : null,
    [rColl, rBound, lPrice, lShares, lDebt, grain],
  );
  const withHealth = useFlowsHealth(replayedTimeline, {
    reader,
    source: healthSource,
    events: healthEvents,
    liveHf: rColl > 0 && rBound > 0 ? rColl / rBound : null,
    liveLevels,
    liveLine: rBound > 0 ? rBound : null,
  });
  // The share price line carries the shares' level, and the view prints as
  // the card does, its days with no reading dotted.
  const timeline = useMemo(() => {
    const t = withHealth;
    if (!t || !t.health || !t.shareLine) return t;
    const readDays = new Set(
      (replay?.rows ?? []).filter((r) => r.reading?.sharePrice != null).map((r) => Math.floor(r.ts / DAY_S)),
    );
    const level = t.priceMarks?.[ALCHEMIX_MYT_KEY]?.level;
    // Each step of the bound, marked on the day its read first showed it.
    const changes = alchemixBoundChanges(t.health.level?.points ?? [], lBlock ?? null, alchemist);
    return withChanges(
      {
        ...t,
        health: alchemixHealthFinish(t.health, readDays, live && opts ? Math.floor(opts.now / DAY_S) : null),
        shareLine: level ? { ...t.shareLine, series: { ...t.shareLine.series, level } } : t.shareLine,
      },
      changes,
    );
  }, [withHealth, replay, live, opts, lBlock, alchemist]);

  const focusEvents = useMemo(() => (replay && opts ? alchemixFocusEvents(replay, opts) : []), [replay, opts]);
  const focus = useFlowFocusValue(useFlowFocusRoot(focusEvents), timeline);
  const facts = useMemo(() => (replay ? alchemixFlowFacts(replay) : null), [replay]);
  const read: FlowsRead =
    wholeEvents == null || underlyingDecimals == null || !p.underlyingSymbol
      ? "withheld"
      : now == null
        ? "reading"
        : "done";
  return { timeline, read, focus, facts };
}
