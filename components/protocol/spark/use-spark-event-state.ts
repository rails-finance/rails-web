"use client";

// The two account reads a SparkLend event card makes when it opens — around
// this transaction and around the previous one — through the Aave V3 family's
// module-scope cache (hooks/useAaveV3PositionState), so the detail grid and the
// prose share one request each.

import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";
import type { SparkContext } from "@/lib/shared/types/event-shape";
import { sparkEventState, type SparkEventState } from "@/lib/spark/event-state";

export interface SparkStateArgs {
  ctx: SparkContext;
  wallet?: string;
  market?: "spark";
  blockNumber?: number;
  txHash?: string;
  reserveAddress?: string;
  previous?: { blockNumber: number; txHash: string };
}

export function useSparkEventState(a: SparkStateArgs): {
  status: "off" | "loading" | "ready" | "unavailable";
  /** Unavailable only: true where a reload cannot change it (400, 404). */
  lasting?: boolean;
  raw?: AaveV3PositionState;
  state?: SparkEventState;
} {
  const here = useAaveV3PositionState({ wallet: a.wallet, market: a.market, block: a.blockNumber, txHash: a.txHash });
  const prev = useAaveV3PositionState({
    wallet: a.wallet,
    market: a.market,
    block: a.previous?.blockNumber,
    txHash: a.previous?.txHash,
  });
  if (!here) return { status: "off" };
  if (here.status === "unavailable") return { status: "unavailable", lasting: here.lasting };
  if (here.status !== "ready") return { status: here.status };
  const state = sparkEventState(a.ctx, a.reserveAddress, here.data, prev?.status === "ready" ? prev.data : undefined);
  return { status: state ? "ready" : "unavailable", raw: here.data, state };
}
