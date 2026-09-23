// Cache-Control for this deployment's own API responses — the /api/<proto>
// proxies to rails-server, and the /api/chain/<proto> readers that answer from
// an RPC read of their own. rails-server already
// declares cacheability on its hottest routes (e.g. 60s on the Aave V4 listing
// and timeline), but NextResponse.json() re-serialized without the header, so
// nothing was ever served from the Vercel edge — every load paid the full
// Vercel → box → Postgres round trip. Forward the backend's header when it
// names a TTL; where it doesn't yet, declare the listing default below.
// Freshness stays legible to the user via the RecencyStamp the listing header
// renders (decision 0006) — a cached slice is at most a minute older than the
// stamped head, inside the stamp's own "~X ago" resolution.

/** Listing/timeline default: 60s shared cache, serve stale while refreshing.
 *  Matches the TTL rails-server declares on its Aave V4 routes. */
export const LISTING_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/** Roster default: 10 min shared cache, an hour of stale-while-revalidate. For
 *  a proxied set that changes only when the protocol gains a market — the
 *  Morpho market roster — where the response also costs a token-symbol
 *  multicall sweep to assemble. A minute's TTL would pay that sweep for a
 *  membership list that shifts a handful of times a week. */
export const ROSTER_CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=3600";

/** Market-overview default: 10 min shared cache, 30 min of
 *  stale-while-revalidate. For the /api/chain/<proto>/market routes, which are
 *  not proxies at all — each one re-reads a whole reserve roster from the
 *  protocol's own Pool and oracle over RPC, and answers a protocol aggregate
 *  that is the same for every reader. Ten minutes is roughly fifty blocks of
 *  interest accrual on figures quoted to the nearest percent. Apply it to the
 *  success response only: the readers answer a `chainStale` stub with status
 *  200 when the RPC read fails, and a cached failure would outlive the failure.
 *  Freshness stays legible — the market page names the block the read happened
 *  at, with a link to the block (components/shared/aave-market-page.tsx). */
export const CHAIN_MARKET_CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=1800";

/**
 * Headers for a proxied success response. Forwards the upstream Cache-Control
 * when it names a TTL (so conditional backend caching — e.g. /spoke-position's
 * warm-only max-age — passes through untouched); otherwise applies `fallback`.
 * Omit `fallback` for forward-only routes that must stay uncacheable unless
 * the backend says otherwise. Error responses never come through here.
 */
export function proxyCacheControl(upstream: Response, fallback?: string): Record<string, string> {
  const upstreamValue = upstream.headers.get("cache-control");
  const value = upstreamValue && /(s-maxage|max-age)=/.test(upstreamValue) ? upstreamValue : fallback;
  return value ? { "Cache-Control": value } : {};
}
