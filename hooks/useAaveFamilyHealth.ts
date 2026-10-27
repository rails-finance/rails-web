"use client";

// The Aave family's reader for the health view (hooks/useFlowsHealth.ts;
// ui-jobs 328, steps 4 and 5): an Aave V3 Pool's thresholds from the family's
// position-state route by market (hooks/useAaveV3PositionState.ts), an Aave V4
// spoke's collateral factors from the spoke's state at the block
// (lib/aave-v4/flows-health.ts). A transaction hash is read from an event's id
// on either id form (Ethereum's "kind:hash:log", Base's "hash-log").

import { useMemo } from "react";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { AAVE_V3_LEVELS, aaveV3ThresholdRead, type AaveHealthSource } from "@/lib/aave-v3/flows-health";
import { readAaveV3PositionStateInBackground } from "@/hooks/useAaveV3PositionState";
import { aaveV4FactorRead } from "@/lib/aave-v4/flows-health";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import { healthRead } from "@/lib/shared/health-reads";
import { useFlowsHealth, type HealthPick, type HealthReader } from "@/hooks/useFlowsHealth";

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
  const v4 = source.reader === "aave-v4-spoke";
  // Each pick needs its transaction: the position-state read is after it.
  const picks = useMemo<HealthPick[]>(
    () =>
      events.flatMap((e) => {
        const txHash = txOf(e);
        return txHash ? [{ blockNumber: e.blockNumber, timestamp: e.timestamp, txHash }] : [];
      }),
    [events],
  );
  const reader = useMemo<HealthReader | null>(() => {
    if (!market) return null;
    if (v4)
      return {
        key: `aave-v4:${wallet.toLowerCase()}:${market}`,
        load: (e) =>
          healthRead(
            `/api/chain/aave-v4/spoke-position?wallet=${wallet}&spoke=${market}&block=${e.blockNumber}`,
            (b) => {
              const r = b as AaveV4SpokePositionChainResponse | null;
              return r && Array.isArray(r.reserves) && !r.chainStale ? r : null;
            },
          ).then((r) => (r ? aaveV4FactorRead(r, e.timestamp) : null)),
      };
    return {
      key: `aave-v3:${wallet.toLowerCase()}:${market}`,
      load: (e) =>
        readAaveV3PositionStateInBackground({ wallet, market, block: e.blockNumber, txHash: e.txHash! }).then((r) =>
          r.status === "ready" && r.data.complete ? aaveV3ThresholdRead(r.data) : null,
        ),
    };
  }, [v4, wallet, market]);
  const withLevels = useMemo(() => (source.levels ? source : { ...source, levels: AAVE_V3_LEVELS }), [source]);
  return useFlowsHealth(t, { reader, source: withLevels, events: picks, liveHf, liveLevels });
}
