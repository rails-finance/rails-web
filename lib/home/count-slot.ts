// The home count's fan-out to the api host (lib/home/covered-positions-data.ts)
// runs at most COUNT_CONCURRENCY legs at once. On a revalidate miss it makes
// about 60 requests; the cap keeps them from filling all of the keep-alive
// pool's connections (lib/api/api-pool.ts) while a render on the same instance
// asks the api.
//
// A leg holds its slot through its fetch, its retries and its body read.
//
// The whole fan-out has one deadline, COUNT_DEADLINE_MS. Healthy, 60 legs at
// four at a time and 0.1 to 1.0 s each take at most about 15 s. With the api
// hung, each leg could take fetchWithRetry's 47.5 s, about 12 minutes for the
// fan-out; at the deadline the legs in flight abort, the queued ones leave the
// queue, each gives null, and the count is suppressed as for any failed leg.
// The home page and /about/figures set no maxDuration, so Vercel Pro's 300 s
// applies, and their stats legs (90 s attempts) already run longer.
//
// Its one import is lib/wallet/api-hop.ts, whose one import is node's, so
// scripts/test/api-pool.test.mjs loads it directly.

import { createLimiter } from "../wallet/api-hop";

/** At most this many home count legs in flight at once. */
export const COUNT_CONCURRENCY = 4;

/** How long the whole fan-out may take before its count is suppressed (ms). */
export const COUNT_DEADLINE_MS = 60_000;

/** One limiter per server process, kept on globalThis so the home page's and
 *  the figures page's bundles share it. */
const countSlot = ((globalThis as { [k: symbol]: unknown })[Symbol.for("rails.home.countSlot")] ??=
  createLimiter(COUNT_CONCURRENCY)) as ReturnType<typeof createLimiter>;

/** One leg of the fan-out whose deadline is `deadline`: `fn` runs in a slot
 *  and passes the signal to its fetch. A leg that fails, or is still queued
 *  at the deadline, gives null. */
export function countLeg<T>(deadline: AbortSignal, fn: (signal: AbortSignal) => Promise<T | null>): Promise<T | null> {
  return countSlot(() => fn(deadline), deadline).catch(() => null);
}
