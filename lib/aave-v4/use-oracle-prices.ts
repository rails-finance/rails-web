"use client";

import { useEffect, useState } from "react";
import { TOKEN_ADDR } from "@/lib/aave/prices";

/** One asset's live on-chain oracle price. `source` names the on-chain lineage:
 *  `iaave-oracle` (the V4 spoke oracle's getReservePrice) for every asset a V4
 *  spoke lists, a Chainlink read for the few registry assets none does. */
export interface OracleAssetPrice {
  usd: number;
  source: "iaave-oracle" | "chainlink" | "chainlink-eth-derived" | "pendle-twap";
  symbol: string;
}
/** lower(erc20 address) → oracle price. */
export type OraclePriceMap = Record<string, OracleAssetPrice>;

interface OracleResponse {
  success: boolean;
  prices?: OraclePriceMap;
  blockNumber?: number;
}

/**
 * Fetch the live Aave V4 on-chain oracle price map from /api/oracle/aave-v4
 * (the V4 oracle's own price, what Aave's risk engine values at). Used only to value
 * collateral/debt as chain-derived in On-chain-values mode; the normal
 * (DefiLlama) prices still drive the default view. Fetched once per mount —
 * the backend serves a shared, block-cached map, so this is a cache hit.
 *
 * Returns null until loaded or on failure; callers fall back to DefiLlama (a
 * middot in On-chain-values), so a missing oracle read never blocks the page or
 * shows a wrong number.
 */
export function useAaveV4OraclePrices(): OraclePriceMap | null {
  const [prices, setPrices] = useState<OraclePriceMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/oracle/aave-v4")
      .then((r) => (r.ok ? (r.json() as Promise<OracleResponse>) : null))
      .then((data) => {
        if (cancelled || !data?.success || !data.prices) return;
        setPrices(data.prices);
      })
      .catch(() => {
        /* fall back to DefiLlama — no throw, no page block */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return prices;
}

/** Which source priced this symbol at head, or `null` where the oracle map does
 *  not carry the asset (the page then reads the off-chain market feed for it).
 *  Lets a current-holding receipt name the feed behind the figure rather than
 *  describe the whole map's mixed lineage. */
export function oraclePriceSource(symbol: string, oracle?: OraclePriceMap | null): OracleAssetPrice["source"] | null {
  if (!oracle) return null;
  const addr = TOKEN_ADDR[symbol];
  return (addr ? oracle[addr] : undefined)?.source ?? null;
}
