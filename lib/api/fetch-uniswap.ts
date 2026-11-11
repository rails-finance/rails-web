import "server-only";

// Clients for rails-server's Uniswap and PancakeSwap routes (rails-ops ui-jobs
// 556, 568, 573, 575): one position at the head and 30 days back, a pair's
// hookless pools at four reads, and a wallet's positions. Raw values;
// lib/uniswap/position.ts and pairs.ts do the math. Cached as the routes
// cache: a minute for a position or a wallet, five for a pair. Ethereum's
// Uniswap is asked without `chain`, as before; every other deployment names
// its chain.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { UniChainId, UniProtocol } from "@/lib/uniswap/deployments";
import type { UniPairRead, UniPositionRead, UniPositionsRead, UniswapVersion } from "@/lib/uniswap/types";

/** The route's path and its `chain` parameter, which Ethereum's Uniswap leaves out. */
const route = (protocol: UniProtocol, chainId: UniChainId, page: string, qs: Record<string, string>) => {
  const q = new URLSearchParams(protocol === "uniswap" && chainId === 1 ? qs : { chain: String(chainId), ...qs });
  return `/api/at-block/${protocol}/${page}?${q}`;
};

/** An answer, a 404 from the route, or no answer. */
export type UniAnswer<T> = { kind: "ok"; data: T } | { kind: "not-found" } | { kind: "error" };

/** One at-block route's answer; `who` names the protocol in the log. Aerodrome's client reads through it. */
export async function readAtBlock<T>(path: string, revalidate: number, who = "uniswap"): Promise<UniAnswer<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) return { kind: "error" };
  try {
    const res = await fetch(`${base}${path}`, createAuthFetchOptions({ next: { revalidate } }));
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) {
      console.error(`${who}: ${path} answered ${res.status}`);
      return { kind: "error" };
    }
    return { kind: "ok", data: (await res.json()) as T };
  } catch (error) {
    console.error(`${who}: ${path} did not answer`, error);
    return { kind: "error" };
  }
}

/** GET /api/at-block/uniswap/position */
export function fetchUniswapPosition(
  version: UniswapVersion,
  id: string,
  protocol: UniProtocol = "uniswap",
  chainId: UniChainId = 1,
): Promise<UniAnswer<UniPositionRead>> {
  return readAtBlock(route(protocol, chainId, "position", { version, id }), 60, protocol);
}

/** GET /api/at-block/<protocol>/pair; `a` and `b` are addresses, "native" for the chain's gas coin,
 *  or "eth" on Ethereum. */
export function fetchUniswapPair(
  a: string,
  b: string,
  protocol: UniProtocol = "uniswap",
  chainId: UniChainId = 1,
): Promise<UniAnswer<UniPairRead>> {
  return readAtBlock(route(protocol, chainId, "pair", { a, b }), 300, protocol);
}

/** GET /api/at-block/<protocol>/positions */
export function fetchUniswapPositions(
  owner: string,
  protocol: UniProtocol = "uniswap",
  chainId: UniChainId = 1,
): Promise<UniAnswer<UniPositionsRead>> {
  return readAtBlock(route(protocol, chainId, "positions", { owner: owner.toLowerCase() }), 60, protocol);
}
