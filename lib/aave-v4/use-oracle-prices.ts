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
  /** The read did not answer: no price stands, and the figures say so. */
  failed?: true;
}

/** The deployment's oracle map, once per mount. On Base the map is keyed by
 *  the Base token address as served AND by each symbol's price key
 *  (priceKeyFor), so `resolvePrice(symbol, …)` reaches it: Base USDC is priced
 *  under the key USDC's figures are looked up by. Null until loaded or on
 *  failure. */
const FAILED_READ: OracleRead = { prices: {}, blockNumber: null, blockTimestamp: null, failed: true };

export function useAaveV4OracleRead(): OracleRead | null {
  const { oracleRoute, key } = useAaveV4Deployment();
  const [read, setRead] = useState<OracleRead | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(oracleRoute)
      .then((r) => (r.ok ? (r.json() as Promise<OracleResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.success || !data.prices) {
          setRead(FAILED_READ);
          return;
        }
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
        // No throw, no page block: the figures name the failed read.
        if (!cancelled) setRead(FAILED_READ);
      });
    return () => {
      cancelled = true;
    };
  }, [oracleRoute, key]);
  return read;
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
