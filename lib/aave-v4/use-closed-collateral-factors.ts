"use client";

import { useEffect, useMemo, useState } from "react";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";

/** A closed position's collateral factors while it was open, per collateral
 *  symbol, read from the spoke at the end of the block before that asset's
 *  last event (rails-ops TO-DO-ui-jobs item 131). */
export type ClosedCollateralFactors =
  | { status: "loading" }
  | { status: "miss" }
  | { status: "ok"; factors: Map<string, { factor: number; block: number }> };

/** One collateral-side row of the position's history on this spoke. */
export interface CollateralEventRef {
  symbol: string;
  blockNumber: number;
}

/** For each asset the position supplied, the block before its last event on
 *  the spoke (its last withdrawal or seizure on a closed position): the last
 *  state in which it still counted. Reads the spoke there through
 *  /api/chain/aave-v4/spoke-position?block=, which takes each reserve's factor
 *  at the dynamic config key the position held, so a factor governance has
 *  changed since reads as it stood for this position. */
export function useClosedCollateralFactors(
  enabled: boolean,
  wallet: string | undefined,
  spokeKey: string | undefined,
  events: CollateralEventRef[],
): ClosedCollateralFactors {
  const lastBlockBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.symbol, Math.max(m.get(e.symbol) ?? 0, e.blockNumber));
    return m;
  }, [events]);
  const key = [...lastBlockBySymbol].map(([s, b]) => `${s}@${b}`).join(",");

  const [state, setState] = useState<ClosedCollateralFactors>({ status: "loading" });
  useEffect(() => {
    if (!enabled || !wallet || !spokeKey || lastBlockBySymbol.size === 0) {
      setState({ status: "miss" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    const blocks = [...new Set([...lastBlockBySymbol.values()].map((b) => b - 1))];
    Promise.all(
      blocks.map((b) =>
        fetch(`/api/chain/aave-v4/spoke-position?wallet=${wallet}&spoke=${spokeKey}&block=${b}`)
          .then((r) => (r.ok ? (r.json() as Promise<AaveV4SpokePositionChainResponse>) : null))
          .catch(() => null),
      ),
    ).then((reads) => {
      if (!live) return;
      const byBlock = new Map(blocks.map((b, i) => [b, reads[i]]));
      const factors = new Map<string, { factor: number; block: number }>();
      for (const [symbol, last] of lastBlockBySymbol) {
        const read = byBlock.get(last - 1);
        const r = read?.chainStale ? undefined : read?.reserves.find((x) => x.symbol === symbol && x.isCollateral);
        if (r?.lt != null && r.lt > 0) factors.set(symbol, { factor: r.lt, block: last - 1 });
      }
      // A failed read is a miss, so the card says which factors it shows
      // instead of naming a partial set as the whole.
      setState(reads.some((r) => r == null) || factors.size === 0 ? { status: "miss" } : { status: "ok", factors });
    });
    return () => {
      live = false;
    };
    // `key` stands for lastBlockBySymbol's contents.
  }, [enabled, wallet, spokeKey, key]);
  return state;
}
