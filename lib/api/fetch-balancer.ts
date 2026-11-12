import "server-only";

// Clients for rails-server's Balancer V3 routes (rails-ops ui-jobs 569,
// decision 0063): a wallet's share of one pool at the head and 30 days back,
// and the pools a wallet holds a share of, both drawn from Rails's position
// index and the chain's logs above it. Raw values; lib/balancer/position.ts
// does the math. Cached as the routes cache, a minute.
//
// A route refuses with 503 `index_unavailable` or `index_behind` when the
// index cannot serve the read; the answer carries the code so the page can
// say which. The daily read ceiling's 503 answers `ceiling` (lib/shared/read-ceiling.ts).
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { isReadCeiling } from "@/lib/shared/read-ceiling";
import { fetchIndexCoverage } from "@/lib/api/fetch-index";
import type { UniAnswer } from "@/lib/api/fetch-uniswap";
import type { BalIndexRefusal, BalPositionRead, BalPositionsRead } from "@/lib/balancer/types";

export type BalAnswer<T> = UniAnswer<T> | { kind: "refused"; code: BalIndexRefusal };

const REFUSALS: readonly BalIndexRefusal[] = ["index_unavailable", "index_behind"];

async function readBalancer<T>(path: string): Promise<BalAnswer<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) return { kind: "error" };
  try {
    const res = await fetch(`${base}${path}`, createAuthFetchOptions({ next: { revalidate: 60 } }));
    if (res.status === 404) return { kind: "not-found" };
    if (res.status === 503) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const code = REFUSALS.find((c) => c === body?.error);
      if (code) return { kind: "refused", code };
      if (isReadCeiling(503, body)) return { kind: "ceiling" };
    }
    if (!res.ok) {
      console.error(`balancer: ${path} answered ${res.status}`);
      return { kind: "error" };
    }
    return { kind: "ok", data: (await res.json()) as T };
  } catch (error) {
    console.error(`balancer: ${path} did not answer`, error);
    return { kind: "error" };
  }
}

/** GET /api/at-block/balancer/position, with the index's reach from its
 *  coverage route beside it for the adds-and-removes receipt. */
export async function fetchBalancerPosition(
  chainId: number,
  pool: string,
  wallet: string,
): Promise<BalAnswer<BalPositionRead>> {
  const qs = new URLSearchParams({ chainId: String(chainId), pool: pool.toLowerCase(), wallet: wallet.toLowerCase() });
  const [answer, coverage] = await Promise.all([
    readBalancer<BalPositionRead>(`/api/at-block/balancer/position?${qs}`),
    fetchIndexCoverage("balancer-v3", chainId),
  ]);
  if (answer.kind !== "ok") return answer;
  const through = coverage.kind === "ok" ? coverage.data.throughBlock : null;
  return { kind: "ok", data: { ...answer.data, indexThrough: through } };
}

/** GET /api/at-block/balancer/positions */
export function fetchBalancerPositions(chainId: number, owner: string): Promise<BalAnswer<BalPositionsRead>> {
  const qs = new URLSearchParams({ chainId: String(chainId), owner: owner.toLowerCase() });
  return readBalancer(`/api/at-block/balancer/positions?${qs}`);
}
