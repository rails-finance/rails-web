// SERVER-ONLY. Records the position page's slot read on rails-server
// (POST /api/morpho-blue-arbitrum/visits; the body is lib/morpho-arbitrum/
// api-contract.ts), which is how the lane learns which wallets are read
// (rails-ops TO-DO-arbitrum-scoping.md item 13). Called after the response is
// sent; a slow or failed post is logged and dropped, never shown.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { MORPHO_ARBITRUM_API_PREFIX, visitBodyOf } from "@/lib/morpho-arbitrum/api-contract";

const TIMEOUT_MS = 2000;

export async function recordMorphoArbitrumVisit(
  read: MorphoWalletChainResponse | null,
  historyMarketIds: string[],
): Promise<void> {
  const base = process.env.RAILS_API_URL;
  if (!base || !read || read.chainStale) return;
  try {
    const res = await fetch(
      `${base}${MORPHO_ARBITRUM_API_PREFIX}/visits`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visitBodyOf(read, historyMarketIds)),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    if (!res.ok) console.warn(`morpho-arbitrum visit not recorded: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.warn("morpho-arbitrum visit not recorded:", err instanceof Error ? err.message : err);
  }
}
