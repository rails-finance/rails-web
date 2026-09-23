// Moonwell Base position page loader — what the server can answer inside a
// request budget.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Imported only from the position page's server component.
//
// The Liquity V2 trove page put its indexed TAIL on the server and left the
// chain HEAD to the client. Here the split lands the other way round, and the
// rule underneath is not about tail and head at all: what belongs on the server
// is whatever can answer inside the request. Measured against the live
// deployment:
//
//   Comptroller position read   ~0.55s   → server
//   listing coverage row        ~0.27s   → server
//   history                    ~36s      → stays on the client
//
// The history is the slow one because Rails' index of Moonwell Base cannot yet
// vouch for a whole life, so the route sweeps the markets' own logs from the
// Comptroller's first block on every visit
// (app/api/chain/moonwell-base/timeline). Awaiting that in a Server Component
// would hold the render until the platform killed it. When the backfill lands
// and `coverage.historyComplete` turns true the index answers in a few hundred
// milliseconds, and the history becomes a candidate for this loader — the
// condition to re-measure against, not a rewrite.
//
// The position read calls the chain loader directly rather than this
// deployment's own /api/chain/moonwell-base/position — same code the route
// handler runs, one less hop and one less function invocation on the server.
//
// Nothing here throws: on any failure the caller gets nulls and the client half
// fetches for itself, exactly as it did before this route had a server half.

import { cache } from "react";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { loadMoonwellPositionFromChain } from "@/lib/sources/chain/moonwell-position";
import { MOONWELL_BASE_DEPLOYMENT } from "@/lib/moonwell-base/asset-catalog";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

const RAILS_API_URL = process.env.RAILS_API_URL;

// Bound the server wait, well inside the platform's function timeout. Both legs
// measure under a second; a read that blows this budget is a broken backend or
// a throttled RPC, and a fast degraded first paint beats a 503.
const HEAD_FETCH_TIMEOUT_MS = 6000;

export interface MoonwellBaseHead {
  /** The Comptroller read, or null when it failed — the client then fetches. */
  position: MoonwellChainResponse | null;
  /** How complete the index is, so the page can name the wait it is in before
   *  the wait starts. `null` is a failed read; the client re-reads. */
  coverage: BaseLendingCoverage | null;
}

const EMPTY_HEAD: MoonwellBaseHead = { position: null, coverage: null };

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`moonwell-base position page: ${label} exceeded ${HEAD_FETCH_TIMEOUT_MS}ms`);
          resolve(null);
        }, HEAD_FETCH_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error(`moonwell-base position page: ${label} failed`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The listing lane's coverage row, read straight from the backend. The route
 *  handler at /api/moonwell-base/coverage answers the browser with the same
 *  figure; this is the same hop without the round trip through our own origin. */
async function readCoverage(readerIp?: string): Promise<BaseLendingCoverage | null> {
  if (!RAILS_API_URL) {
    console.error("moonwell-base position page: RAILS_API_URL is not set");
    return null;
  }
  const res = await fetch(
    `${RAILS_API_URL}/api/moonwell-base/coverage`,
    createAuthFetchOptions({ cache: "no-store" }, readerIp),
  );
  if (!res.ok) {
    console.error(`moonwell-base position page: coverage -> ${res.status} ${res.statusText}`);
    return null;
  }
  const json = (await res.json()) as { coverage?: BaseLendingCoverage | null };
  return json.coverage ?? null;
}

/**
 * What the server renders of a Moonwell Base position. Wrapped in React `cache`
 * so `generateMetadata` and the page body share one read per request.
 *
 * `wallet` must already be a well-formed address — the page rejects anything
 * else with a 404 rather than letting viem's `getAddress` throw through the
 * render.
 */
export const loadMoonwellBaseHead = cache(async (wallet: string): Promise<MoonwellBaseHead> => {
  try {
    const readerIp = await readerIpFromHeaders();
    const [position, coverage] = await Promise.all([
      withTimeout(loadMoonwellPositionFromChain(wallet, MOONWELL_BASE_DEPLOYMENT), "Comptroller read"),
      withTimeout(readCoverage(readerIp), "coverage read"),
    ]);
    // `chainStale` is the reader's own "the RPC failed and this is a stub".
    // Handing that to the client as a seed would paint an empty position as a
    // real one, so it counts as no read at all.
    return { position: position && !position.chainStale ? position : null, coverage };
  } catch (err) {
    console.error("moonwell-base position page: head read failed; client will fetch", err);
    return EMPTY_HEAD;
  }
});
