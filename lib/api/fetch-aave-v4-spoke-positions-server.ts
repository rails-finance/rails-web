// Server-side spoke-positions fetch for SSR. Calls the rails-server-onboarding
// box directly with bearer auth — the same thing the /api/aave-v4/spoke-positions
// route handler does — but without the extra self-HTTP hop, so a Server Component
// can await the first page of data and put it in the initial HTML (no
// hydrate-then-fetch waterfall). Keep the ENS-resolution + URL shape in sync with
// app/api/aave-v4/spoke-positions/route.ts.
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN` (both non-NEXT_PUBLIC
// server env vars); imported only from the /aave-v4 Server Component page, never
// a client component — the bearer token must not reach the browser bundle.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import {
  buildAaveV4SpokePositionsQuery,
  type AaveV4SpokePositionsResponse,
  type FetchAaveV4SpokePositionsParams,
} from "@/lib/api/fetch-aave-v4-spoke-positions";

// Bound the SSR wait. This route renders live-priced USD/HF per request, so the
// server render can run several seconds; without a ceiling a slow one hangs the
// Server Component until the platform kills it with a function-timeout 503, which
// Next then turns into a hard-navigation reload. On abort the fetch throws, the
// /aave-v4 page catches it and hands the client an empty initial set (it fetches
// under the route's loading skeleton) — a fast degraded SSR beats a 503 + reload.
// Sits under the route's pinned maxDuration (30 s, app/(app)/ethereum/aave-v4/(views)/page.tsx);
// a normal 2–5s render still completes via SSR.
const SSR_FETCH_TIMEOUT_MS = 8000;

export async function fetchAaveV4SpokePositionsServer(
  p: FetchAaveV4SpokePositionsParams,
): Promise<AaveV4SpokePositionsResponse> {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) {
    throw new Error("RAILS_API_URL environment variable is not set");
  }

  // Forward-resolve ENS → wallet when no explicit wallet is given (mirrors the
  // route handler). Best-effort: an unresolved name is left in place for the
  // backend's reverse cache.
  let params = p;
  if (params.ownerEns && !params.wallet) {
    const resolved = await resolveEnsAddress(params.ownerEns);
    if (resolved) {
      params = { ...params, wallet: resolved, ownerEns: undefined };
    }
  }

  const readerIp = await readerIpFromHeaders();
  const url = `${RAILS_API_URL}/api/aave-v4/spoke-positions?${buildAaveV4SpokePositionsQuery(params)}`;
  const res = await fetch(
    url,
    createAuthFetchOptions({ cache: "no-store", signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) }, readerIp),
  );
  if (!res.ok) {
    throw new Error(`fetchAaveV4SpokePositionsServer failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveV4SpokePositionsResponse;
}
