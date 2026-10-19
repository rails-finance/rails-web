// SERVER-ONLY. Records the position page's Pool read on rails-server
// (POST /api/aave-v3-arbitrum/visits; the body is lib/aave-v3-arbitrum/
// api-contract.ts), which is how the lane learns which wallets are read
// (rails-ops TO-DO-arbitrum-scoping.md §9 item 4). Called after the response is
// sent; a slow or failed post is logged and dropped, never shown.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { AAVE_V3_ARBITRUM_API_PREFIX, visitBodyOf } from "@/lib/aave-v3-arbitrum/api-contract";

const TIMEOUT_MS = 2000;

export async function recordAaveV3ArbitrumVisit(read: AaveV3PositionChainResponse | null): Promise<void> {
  const base = process.env.RAILS_API_URL;
  if (!base || !read || read.chainStale) return;
  try {
    const res = await fetch(
      `${base}${AAVE_V3_ARBITRUM_API_PREFIX}/visits`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visitBodyOf(read)),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    if (!res.ok) console.warn(`aave-v3-arbitrum visit not recorded: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.warn("aave-v3-arbitrum visit not recorded:", err instanceof Error ? err.message : err);
  }
}
