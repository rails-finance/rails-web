"use client";

// The Lifetime flows panel's health view on an Aave V3 Pool page (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328, steps 4 and 5):
// the position state at the last event of each of the most recent
// HEALTH_READS_MAX days with events the page holds, read through the family's
// position-state route (hooks/useAaveV3PositionState.ts, by market), and the
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
} from "@/lib/aave-v3/flows-health";
import { useAaveV3PositionStates } from "@/hooks/useAaveV3PositionState";

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
   *  "prime", …), "spark", "base" or "seamless". Null asks for nothing. */
  market: string | null;
  source: AaveHealthSource;
  /** The page's events. */
  events: readonly { blockNumber: number; timestamp: number; txHash?: string; id: string | number }[];
  /** The card's health factor on an open position. */
  liveHf: number | null;
}

export function useAaveFamilyHealth(t: FlowTimeline | null, p: AaveFamilyHealthInput): FlowTimeline | null {
  const { events, market, wallet, source, liveHf } = p;
  const picks = useMemo(
    () =>
      market
        ? aaveV3HealthReadPicks(
            events.map((e) => ({ blockNumber: e.blockNumber, timestamp: e.timestamp, txHash: txOf(e) })),
            HEALTH_READS_MAX,
          ).map((e) => ({ block: e.blockNumber, txHash: e.txHash! }))
        : [],
    [events, market],
  );
  const states = useAaveV3PositionStates({ wallet, market: market ?? undefined, reads: picks });
  return useMemo(() => {
    if (!t || !states) return t;
    const reads = states.flatMap((r) => (r.status === "ready" && r.data.complete ? [aaveV3ThresholdRead(r.data)] : []));
    const hv = aaveV3HealthView(t, reads, { liveHf, source });
    return hv ? { ...t, health: hv.health, priceMarks: { ...t.priceMarks, ...hv.marks } } : t;
  }, [t, states, liveHf, source]);
}
