import "server-only";

// Client for rails-server's per-market Morpho Blue liquidations (S1, rails-ops
// ui-jobs 554): GET /api/morpho/markets/:marketId/liquidations on Ethereum,
// /api/morpho-base/markets/:marketId/liquidations on Base. Raw integer strings
// and unix-second timestamps; `?badDebtOnly=1` narrows the list, the totals
// cover every liquidation. Base answers 503 `{ unavailable: true }` where its
// index is not configured. Cached as the route caches, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

export type MorphoLiquidationsChainId = 1 | 8453;

export interface MorphoMarketLiquidation {
  block: number;
  /** Unix seconds; null where the row has no block time. */
  timestamp: number | null;
  txHash: string;
  txIndex: number | null;
  /** Transaction-local on Ethereum, block-wide on Base. */
  logIndex: number;
  borrower: string | null;
  liquidator: string | null;
  repaidAssets: string;
  repaidShares: string;
  seizedAssets: string;
  badDebtAssets: string;
  badDebtShares: string;
}

export interface MorphoMarketLiquidations {
  chainId: number;
  /** 64 hex, no 0x, lowercased. */
  marketId: string;
  loanToken: string | null;
  collateralToken: string | null;
  totals: {
    count: number;
    repaidAssets: string;
    seizedAssets: string;
    badDebtAssets: string;
    badDebtShares: string;
    withBadDebt: number;
  };
  badDebtOnly: boolean;
  liquidations: MorphoMarketLiquidation[];
  tokens: Record<string, { symbol: string; decimals: number }>;
}

/** `unavailable`: Base's index is not configured (503). `error`: any other failure. */
export type MorphoLiquidationsAnswer =
  | { kind: "ok"; data: MorphoMarketLiquidations }
  | { kind: "unavailable" }
  | { kind: "error" };

const ROUTE: Record<MorphoLiquidationsChainId, string> = { 1: "morpho", 8453: "morpho-base" };

/** GET /api/<morpho|morpho-base>/markets/:marketId/liquidations */
export async function fetchMorphoMarketLiquidations(
  chainId: MorphoLiquidationsChainId,
  marketId: string,
  badDebtOnly = false,
): Promise<MorphoLiquidationsAnswer> {
  const id = marketId.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(id)) return { kind: "error" };
  const base = process.env.RAILS_API_URL;
  if (!base) return { kind: "error" };
  const p = `/api/${ROUTE[chainId]}/markets/${id}/liquidations${badDebtOnly ? "?badDebtOnly=1" : ""}`;
  try {
    const res = await fetch(`${base}${p}`, createAuthFetchOptions({ next: { revalidate: 60 } }));
    if (res.status === 503) return { kind: "unavailable" };
    if (!res.ok) {
      console.error(`morpho liquidations: ${p} answered ${res.status}`);
      return { kind: "error" };
    }
    const data = (await res.json()) as MorphoMarketLiquidations & { unavailable?: boolean };
    if (data.unavailable) return { kind: "unavailable" };
    return { kind: "ok", data };
  } catch (error) {
    console.error(`morpho liquidations: ${p} did not answer`, error);
    return { kind: "error" };
  }
}
