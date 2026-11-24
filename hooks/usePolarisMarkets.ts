"use client";

// The Polaris market board for a listing: ONE side-fetch of
// /api/chain/polaris/markets on mount, carrying both markets' price legs, MCRs,
// mode and rate at one head block. Every CDP card's approximate ratio and the
// holder strip's prices come from it. It sits outside the listing driver's
// fetch lifecycle, so a page, sort or filter change never refetches it. A
// `chainStale` answer is kept as null: the cards stay dashes rather than state
// a ratio at a price that failed to read.

import { useEffect, useState } from "react";
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";

export function usePolarisMarkets(): { markets: PolarisMarketsChainResponse | null; settled: boolean } {
  const [markets, setMarkets] = useState<PolarisMarketsChainResponse | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chain/polaris/markets");
        if (res.ok) {
          const json = (await res.json()) as PolarisMarketsChainResponse;
          if (!cancelled && !json.chainStale) setMarkets(json);
        }
      } catch {
        /* the board is an enhancement: the listing still lists */
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { markets, settled };
}
