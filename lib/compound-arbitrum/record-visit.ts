// SERVER-ONLY. Records the position page's Comet read on rails-server
// (POST /api/compound-v3-arbitrum/visits; the body is lib/compound-arbitrum/
// api-contract.ts), which is how the lane learns which wallets are read
// (rails-ops TO-DO-arbitrum-scoping.md item 12). Called after the response is
// sent; a slow or failed post is logged and dropped, never shown.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { COMPOUND_ARBITRUM_API_PREFIX, visitBodyOf } from "@/lib/compound-arbitrum/api-contract";

const TIMEOUT_MS = 2000;

export async function recordCompoundArbitrumVisit(
  read: CompoundWalletChainResponse | null,
  historyMarketKeys: string[],
): Promise<void> {
  const base = process.env.RAILS_API_URL;
  if (!base || !read || read.chainStale) return;
  try {
    const res = await fetch(
      `${base}${COMPOUND_ARBITRUM_API_PREFIX}/visits`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visitBodyOf(read, historyMarketKeys)),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    if (!res.ok) console.warn(`compound-arbitrum visit not recorded: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.warn("compound-arbitrum visit not recorded:", err instanceof Error ? err.message : err);
  }
}
