import "server-only";

// Clients for rails-server's Uniswap routes on Ethereum (rails-ops ui-jobs
// 556): one position at the head and 30 days back, a pair's hookless pools at
// four reads, and a wallet's positions. Raw values; lib/uniswap/position.ts
// and pairs.ts do the math. Cached as the routes cache: a minute for a
// position or a wallet, five for a pair.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { UniPairRead, UniPositionRead, UniPositionsRead, UniswapVersion } from "@/lib/uniswap/types";

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
export function fetchUniswapPosition(version: UniswapVersion, id: string): Promise<UniAnswer<UniPositionRead>> {
  const qs = new URLSearchParams({ version, id });
  return readAtBlock(`/api/at-block/uniswap/position?${qs}`, 60);
}

/** GET /api/at-block/uniswap/pair; `a` and `b` are addresses, or "eth" for native ETH. */
export function fetchUniswapPair(a: string, b: string): Promise<UniAnswer<UniPairRead>> {
  const qs = new URLSearchParams({ a, b });
  return readAtBlock(`/api/at-block/uniswap/pair?${qs}`, 300);
}

/** GET /api/at-block/uniswap/positions */
export function fetchUniswapPositions(owner: string): Promise<UniAnswer<UniPositionsRead>> {
  const qs = new URLSearchParams({ owner: owner.toLowerCase() });
  return readAtBlock(`/api/at-block/uniswap/positions?${qs}`, 60);
}
