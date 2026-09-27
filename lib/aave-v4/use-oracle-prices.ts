"use client";

import { useEffect, useState } from "react";
import { priceKeyFor } from "@/lib/aave/prices";
import { useAaveV4Deployment } from "@/lib/aave-v4/deployment";

/** One asset's live on-chain oracle price. `source` names the on-chain lineage:
 *  `iaave-oracle` (the V4 spoke oracle's getReservePrice) for every asset a V4
 *  spoke lists, a Chainlink read for the few registry assets none does. */
export interface OracleAssetPrice {
  usd: number;
  source: "iaave-oracle" | "chainlink" | "chainlink-eth-derived" | "pendle-twap";
  symbol: string;
  /** Base only (/api/oracle/aave-v4-base): the Chainlink round behind the
   *  price and when it was published (unix seconds), read with
   *  latestRoundData() at the same block. A stock feed publishes 24/5 and
   *  holds its last value outside those hours, so this is what dates it. */
  updatedAt?: number | null;
  roundId?: string | null;
  feed?: string | null;
}
/** lower(erc20 address) → oracle price. */
export type OraclePriceMap = Record<string, OracleAssetPrice>;

interface OracleResponse {
  success: boolean;
  prices?: OraclePriceMap;
  blockNumber?: number;
  blockTimestamp?: number;
}

/** One oracle read: the map, and the block (and, on Base, its timestamp) it
 *  was read at. */
export interface OracleRead {
  prices: OraclePriceMap;
  blockNumber: number | null;
  blockTimestamp: number | null;
}

/** The deployment's oracle map, once per mount. On Base the map is keyed by
 *  the Base token address as served AND by each symbol's price key
 *  (priceKeyFor), so `resolvePrice(symbol, …)` reaches it: Base USDC is priced
 *  under the key USDC's figures are looked up by. Null until loaded or on
 *  failure. */
export function useAaveV4OracleRead(): OracleRead | null {
  const { oracleRoute, key } = useAaveV4Deployment();
  const [read, setRead] = useState<OracleRead | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(oracleRoute)
      .then((r) => (r.ok ? (r.json() as Promise<OracleResponse>) : null))
      .then((data) => {
        if (cancelled || !data?.success || !data.prices) return;
        const prices: OraclePriceMap = { ...data.prices };
        if (key !== "ethereum") {
          for (const p of Object.values(data.prices)) {
            const k = priceKeyFor(p.symbol);
            if (k && !prices[k]) prices[k] = p;
          }
        }
        setRead({ prices, blockNumber: data.blockNumber ?? null, blockTimestamp: data.blockTimestamp ?? null });
      })
      .catch(() => {
        /* fall back — no throw, no page block */
      });
    return () => {
      cancelled = true;
    };
  }, [oracleRoute, key]);
  return read;
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
  return useAaveV4OracleRead()?.prices ?? null;
}

/** Which source priced this symbol at head, or `null` where the oracle map does
 *  not carry the asset (the page then reads the off-chain market feed for it).
 *  Lets a current-holding receipt name the feed behind the figure rather than
 *  describe the whole map's mixed lineage. */
export function oraclePriceSource(symbol: string, oracle?: OraclePriceMap | null): OracleAssetPrice["source"] | null {
  if (!oracle) return null;
  const addr = priceKeyFor(symbol);
  return (addr ? oracle[addr] : undefined)?.source ?? null;
}
