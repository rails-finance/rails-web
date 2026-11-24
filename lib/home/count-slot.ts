// The home count's fan-out to the api host (lib/home/covered-positions-data.ts)
// runs at most COUNT_CONCURRENCY legs at once. On a revalidate miss it makes
// about 60 requests; the cap keeps them from filling all of the keep-alive
// pool's connections (lib/api/api-pool.ts) while a render on the same instance
// asks the api.
//
// A leg holds its slot through its fetch, its retries and its body read.
//
// Its one import is lib/wallet/api-hop.ts, whose one import is node's, so
// scripts/test/api-pool.test.mjs loads it directly.

import { createLimiter } from "../wallet/api-hop";

/** At most this many home count legs in flight at once. */
export const COUNT_CONCURRENCY = 4;

/** One limiter per server process, kept on globalThis so the home page's and
 *  the figures page's bundles share it. */
export const countSlot = ((globalThis as { [k: symbol]: unknown })[Symbol.for("rails.home.countSlot")] ??=
  createLimiter(COUNT_CONCURRENCY)) as ReturnType<typeof createLimiter>;
