"use client";

// The Liquity V2 branch prices (/api/oracle/liquity-v2): the one side-fetch a
// listing makes for USD on its cards and the holder strip's totals. Null until
// it lands, and on a failed read; the cards render without USD meanwhile.

import { useEffect, useState } from "react";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";

export function useLiquityV2Prices(): OraclePricesData | null {
  const [prices, setPrices] = useState<OraclePricesData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/oracle/liquity-v2")
      .then((r) => (r.ok ? (r.json() as Promise<OraclePricesResponse>) : null))
      .then((json) => {
        if (!cancelled && json?.success && json.data) setPrices(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return prices;
}
