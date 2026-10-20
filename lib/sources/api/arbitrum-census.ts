// One position-first Arbitrum family's census, for its positions page's
// footer: how many wallets hold an open position on the protocol, read on the
// chain once a day (rails-ops reference/arbitrum-position-first-lane.md,
// "The census"). Parsed by lib/home/census-leg.ts, which reads the same route
// for the home count, and cached for an hour; the page's row read stays per
// request.
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { fetchWithRetry } from "@/lib/api/resilient-fetch";
import { CENSUS_ENDPOINT, fetchCensus, type CensusFigures } from "@/lib/home/census-leg";

const REVALIDATE_SECONDS = 3600;

/** Keyed by `ProtocolEntry.id`. Null while the census is not taken, the walk
 *  is incomplete or the open figure is not yet read, and on any failure. */
export async function loadArbitrumCensus(
  id: "aave-v3-arbitrum" | "compound-v3-arbitrum" | "morpho-arbitrum",
): Promise<CensusFigures | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const r = await fetchCensus(id, `${base}${CENSUS_ENDPOINT[id]}`, (url) =>
    fetchWithRetry(url, createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } })),
  );
  return r == null || "pending" in r ? null : r;
}
