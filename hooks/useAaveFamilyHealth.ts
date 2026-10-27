"use client";

// The Lifetime flows panel's health view on an Aave V3 Pool page (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328, steps 4 and 5):
// the position state at the last event of each of the most recent
// HEALTH_READS_MAX days with events the page holds, read through the family's
// position-state route (hooks/useAaveV3PositionState.ts, by market) or, for an
// Aave V4 spoke, the spoke's state at the block (lib/aave-v4/use-spoke-reads.ts),
// and the
// timeline with its health series and each asset's level added
// (lib/aave-v3/flows-health.ts). Until every read has settled, and where no
// read lands or the view has no point, the timeline comes back as given.

import { useMemo } from "react";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  aaveV3HealthReadPicks,
  aaveV3HealthView,
  aaveV3ThresholdRead,
  type AaveHealthSource,
  type AaveV3ThresholdRead,
} from "@/lib/aave-v3/flows-health";
import { useAaveV3PositionStates } from "@/hooks/useAaveV3PositionState";
import { useAaveV4SpokeReads } from "@/lib/aave-v4/use-spoke-reads";
import { aaveV4FactorRead } from "@/lib/aave-v4/flows-health";

/** The most position-state reads one page asks for its health view. */
export const HEALTH_READS_MAX = 60;

const TX_HASH = /0x[0-9a-fA-F]{64}/;

/** An event's transaction: its hash, or the one its id spells. */
function txOf(e: { txHash?: string; id: string | number }): string | undefined {
  return e.txHash?.match(TX_HASH)?.[0] ?? String(e.id).match(TX_HASH)?.[0];
}

export interface AaveFamilyHealthInput {
  wallet: string;
  /** The position-state route's market: an Ethereum market ("core",
   *  "prime", …), "spark", "base" or "seamless"; for Aave V4 the spoke's key
   *  ("main"). Null asks for nothing. */
  market: string | null;
  source: AaveHealthSource;
  /** The page's events. */
  events: readonly { blockNumber: number; timestamp: number; txHash?: string; id: string | number }[];
  /** The card's health factor on an open position. */
  liveHf: number | null;
  /** The card's level per collateral on an open position, by asset key. */
  liveLevels?: Record<string, number> | null;
}

export function useAaveFamilyHealth(t: FlowTimeline | null, p: AaveFamilyHealthInput): FlowTimeline | null {
  const { events, market, wallet, source, liveHf, liveLevels } = p;
  const picks = useMemo(
    () =>
      market
        ? aaveV3HealthReadPicks(
            events.map((e) => ({ blockNumber: e.blockNumber, timestamp: e.timestamp, txHash: txOf(e) })),
            HEALTH_READS_MAX,
          ).map((e) => ({ block: e.blockNumber, txHash: e.txHash!, timestamp: e.timestamp }))
        : [],
    [events, market],
  );
  const v4 = source.reader === "aave-v4-spoke";
  const states = useAaveV3PositionStates({ wallet, market: v4 ? undefined : (market ?? undefined), reads: picks });
  const blocks = useMemo(() => (v4 ? picks.map((p) => p.block) : []), [v4, picks]);
  const spokeReads = useAaveV4SpokeReads({ wallet, spoke: v4 ? (market ?? undefined) : undefined, blocks });
  return useMemo(() => {
    if (!t) return t;
    let reads: AaveV3ThresholdRead[];
    if (v4) {
      if (!spokeReads) return t;
      reads = spokeReads.flatMap((r, i) => {
        const read = r ? aaveV4FactorRead(r, picks[i].timestamp) : null;
        return read ? [read] : [];
      });
    } else {
      if (!states) return t;
      reads = states.flatMap((r) => (r.status === "ready" && r.data.complete ? [aaveV3ThresholdRead(r.data)] : []));
    }
    const hv = aaveV3HealthView(t, reads, { liveHf, liveLevels, source });
    return hv ? { ...t, health: hv.health, priceMarks: { ...t.priceMarks, ...hv.marks } } : t;
  }, [t, v4, states, spokeReads, picks, liveHf, liveLevels, source]);
}
