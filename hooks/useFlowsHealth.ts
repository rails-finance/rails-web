"use client";

// The Lifetime flows panel's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328, steps 4 and 5):
// the factors at the last event of each of the most recent HEALTH_READS_MAX
// days with events, read through the family's reader, and the timeline with
// its health series and each asset's level added (lib/shared/flows-health.ts).
// Where the page has the card's read, its factors stand for today. A family
// may hand its reads whole (`given`) in place of a reader. Until every
// read has settled, and where no read lands or the view has no point, the
// timeline comes back as given.

import { useEffect, useMemo, useState } from "react";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  HEALTH_READS_MAX,
  healthReadPicks,
  healthView,
  type FactorRead,
  type HealthSource,
} from "@/lib/shared/flows-health";

/** One event whose factors the view reads. */
export interface HealthPick {
  blockNumber: number;
  timestamp: number;
  txHash?: string;
}

/** A family's factor reads: `key` names what they depend on beside the
 *  block (the wallet, the market); `load` reads one pick's factors, null
 *  where the read missed. */
export interface HealthReader {
  key: string;
  load: (pick: HealthPick) => Promise<FactorRead | null>;
}

export interface FlowsHealthInput {
  /** Null asks for nothing. */
  reader: HealthReader | null;
  source: HealthSource;
  /** The page's events. */
  events: readonly HealthPick[];
  /** The card's health factor on an open position. */
  liveHf: number | null;
  /** The card's level per collateral on an open position, by asset key. */
  liveLevels?: Record<string, number> | null;
  /** The card's factors now, for today's levels; each asset it does not
   *  name keeps the last read's. */
  todayRead?: FactorRead | null;
  /** A ratio view's line today, the card's. */
  liveLine?: number | null;
  /** With no reader: the family's reads whole, ascending (MakerDAO's minimum
   *  ratio from its change history; Fluid's threshold today, held across the
   *  life). Nothing is read per event. */
  given?: readonly FactorRead[] | null;
}

export function useFlowsHealth(t: FlowTimeline | null, p: FlowsHealthInput): FlowTimeline | null {
  const { events, reader, source, liveHf, liveLevels, todayRead, liveLine, given } = p;
  const picks = useMemo(() => (reader ? healthReadPicks(events, HEALTH_READS_MAX) : []), [events, reader]);
  const joined = reader ? `${reader.key}|${picks.map((e) => e.blockNumber).join(",")}` : "";
  const [result, setResult] = useState<{ joined: string; reads: FactorRead[] } | null>(null);
  useEffect(() => {
    if (!reader || picks.length === 0) return;
    let live = true;
    Promise.all(picks.map((e) => reader.load(e).catch(() => null))).then((all) => {
      if (live) setResult({ joined, reads: all.filter((r): r is FactorRead => r != null) });
    });
    return () => {
      live = false;
    };
    // `joined` names the reader and every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  const read = result && result.joined === joined ? result.reads : null;
  const reads = reader ? read : (given ?? null);
  return useMemo(() => {
    if (!t || !reads || reads.length === 0) return t;
    let all: readonly FactorRead[] = reads;
    const last = reads[reads.length - 1];
    if (todayRead && todayRead.day >= last.day)
      all = [
        ...reads.filter((r) => r.day < todayRead.day),
        {
          ...todayRead,
          lt: { ...last.lt, ...todayRead.lt },
          ...(last.dw || todayRead.dw ? { dw: { ...last.dw, ...todayRead.dw } } : {}),
          line: todayRead.line ?? last.line,
        },
      ];
    const hv = healthView(t, all, { liveHf, liveLevels, liveLine, source });
    return hv ? { ...t, health: hv.health, priceMarks: { ...t.priceMarks, ...hv.marks } } : t;
  }, [t, reads, todayRead, liveHf, liveLevels, liveLine, source]);
}
