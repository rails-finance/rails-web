"use client";

import { useEffect, useState } from "react";
import { fetchAaveV4Hubs, type AaveV4HubsResponse } from "@/lib/api/fetch-aave-v4-hubs";

// The hubs payload carries each (hub, spoke, asset) line's collateral factor,
// the effective one the server harvests from getUserAccountData (see
// lib/aave-v4/liquidation-thresholds.ts). One request per page load.
let hubs: Promise<AaveV4HubsResponse | null> | null = null;

/** Each asset's collateral factor on a spoke (by display name), as a fraction.
 *  Empty until the read lands, and on a failed read. */
export function useSpokeCollateralFactors(spokeName: string | undefined): Map<string, number> {
  const [out, setOut] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    if (!spokeName) return;
    let live = true;
    if (!hubs) {
      hubs = fetchAaveV4Hubs().catch(() => null);
      hubs.then((v) => {
        if (v == null) hubs = null;
      });
    }
    hubs.then((v) => {
      if (!live || !v) return;
      const m = new Map<string, number>();
      for (const l of v.lines) {
        if (l.spokeName === spokeName && l.lt != null && l.lt > 0 && !m.has(l.symbol)) m.set(l.symbol, l.lt);
      }
      setOut(m);
    });
    return () => {
      live = false;
    };
  }, [spokeName]);
  return out;
}
