// Trove detail page loader — the position's tail, read server-side.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Fetches the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle) — imported only from the
// trove page's server component. Straight to RAILS_API_URL rather than through
// this deployment's own /api/* proxy: same code the proxy runs, one less network
// hop and one less function invocation on the server. The proxy routes are
// untouched — the browser still uses them for the head reads.
//
// A position has two shelf-lives, and this loader takes only the long one. The
// TAIL is the replayed summary, the event history, and the oracle price: settled
// facts that render the whole page. The HEAD — live accrued trove state
// (an RPC read behind a 30s cache) and the redemption buffer (a MultiTroveGetter
// walk) — stays a client-side second wave, so time-to-first-byte is never gated
// on a chain read.
//
// Best-effort by design. A backend blip returns nulls rather than throwing, and
// the client half falls back to fetching for itself exactly as it did before this
// route had a server half — an SSR miss costs the first-paint win, not the page.
// The one hard miss is a trove the backend answers for and does not have: that is
// a real 404 and the page says so with a 404 status.

import { cache } from "react";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { LIQUITY_V2_BRANCHES } from "@/lib/shared/preferences";
import type { TrovesResponse, TroveSummary } from "@/types/api/trove";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import type { FetchTroveTimelineResult } from "@/lib/api/fetch-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** The one cut on every timeline — the same constant the client-side fetch
 *  passes as its `limit` (the trove view), so the server-seeded page and the
 *  client's own read draw the same rows.
 *
 *  Named ROWS since decision 0019's evening amendment moved the unit: the cut
 *  counts what the reader scrolls, and a folder is one row. Nothing groups
 *  this route's answer, so a row here is still one event — which is why this
 *  site is a rename and not a change. */
const TIMELINE_LIMIT = TIMELINE_WINDOW_ROWS;

// Bound the server wait. A force-dynamic page whose backend read runs long would
// otherwise hold the Server Component render until the platform kills it with a
// function-timeout 503. On timeout we abandon the read and hand the client an
// unseeded view, which fetches under its own skeleton — a degraded first paint
// beats a 503. Same reasoning, and the same budget, as the listing SSR driver.
const TAIL_FETCH_TIMEOUT_MS = 8000;

export interface TroveTail {
  trove: TroveSummary | null;
  events: BaseActivityEvent[] | null;
  /** The trove's whole event count as the route reported it beside the page it
   *  served, and whether that page stopped short of it. Read so a trove deeper
   *  than `TIMELINE_LIMIT` states its boundary instead of drawing a cut list
   *  as a whole one (rails-ops decision 0019). Null on an SSR miss. */
  totalEvents: number | null;
  hasMore: boolean;
  prices: OraclePricesData | null;
  /** The backend answered and has no such trove — render a 404, not a retry. */
  missing: boolean;
}

const EMPTY_TAIL: TroveTail = {
  trove: null,
  events: null,
  totalEvents: null,
  hasMore: false,
  prices: null,
  missing: false,
};

async function getJson<T>(path: string, signal: AbortSignal, readerIp?: string): Promise<T | null> {
  if (!RAILS_API_URL) {
    console.error("trove-page-data: RAILS_API_URL is not set");
    return null;
  }
  try {
    // `no-store`, matching every lib/api/fetch-* client: a position page states
    // current facts, so nothing here is served from a previous request's read.
    const res = await fetch(`${RAILS_API_URL}${path}`, createAuthFetchOptions({ cache: "no-store", signal }, readerIp));
    if (!res.ok) {
      console.error(`trove-page-data: ${path} -> ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`trove-page-data: ${path} failed`, err);
    return null;
  }
}

/**
 * The trove's tail, for the server render. Wrapped in React `cache` so
 * `generateMetadata` and the page body share one read per request.
 *
 * Never throws: on any failure the caller gets `EMPTY_TAIL` and the client half
 * fetches for itself.
 */
export const loadTroveTail = cache(async (collateralType: string, troveId: string): Promise<TroveTail> => {
  // Reading the backend directly skips this deployment's /api/troves proxy, and
  // that proxy is not only a hop — it validates the branch and drops an unknown
  // one from the query, which makes `/trove/NOPE/<id>` answer with the WETH
  // trove of that id. The branch is part of the URL's claim, so an unknown one
  // is a 404 here rather than a silently corrected read.
  if (!(LIQUITY_V2_BRANCHES as readonly string[]).includes(collateralType)) {
    return { ...EMPTY_TAIL, missing: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAIL_FETCH_TIMEOUT_MS);
  try {
    const readerIp = await readerIpFromHeaders();
    const base = `/api/trove/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}`;
    const [trovesResp, timeline, pricesResp] = await Promise.all([
      getJson<TrovesResponse>(
        `/api/troves?troveId=${encodeURIComponent(troveId)}&collateralType=${encodeURIComponent(collateralType)}`,
        controller.signal,
        readerIp,
      ),
      getJson<FetchTroveTimelineResult>(`${base}/timeline?limit=${TIMELINE_LIMIT}`, controller.signal, readerIp),
      getJson<OraclePricesResponse>(`/api/oracle/liquity-v2`, controller.signal, readerIp),
    ]);

    // A null response is a read that failed — indistinguishable from a slow
    // backend, so it must not read as absence. Only an answered request with an
    // empty roster says the trove does not exist.
    if (trovesResp == null) return EMPTY_TAIL;
    const trove = trovesResp.data?.[0] ?? null;
    if (!trove) return { ...EMPTY_TAIL, missing: true };

    // The tail seeds whole or not at all. `seeded` on the client half is one
    // flag off `initialTrove`, and the second wave reads only the chain state —
    // so a summary that arrived beside a FAILED timeline would render an empty
    // activity list, as a settled fact, with nothing left to correct it. A
    // timeline that answered with no rows is a different thing and seeds fine:
    // `getJson` returns null only for a read that failed, never for an empty
    // one. Forfeiting the seed costs this request its first-paint win and
    // leaves the client fetching exactly as it did before, which is the right
    // side to fail on.
    if (timeline == null) return EMPTY_TAIL;

    // Prices are the exception: the client's own mount path treats them as
    // best-effort too, and their absence renders as an unpriced figure rather
    // than a wrong one.
    return {
      trove,
      events: timeline.events ?? [],
      totalEvents: typeof timeline.totalEvents === "number" ? timeline.totalEvents : null,
      hasMore: timeline.pagination?.hasMore === true,
      prices: pricesResp?.success ? (pricesResp.data ?? null) : null,
      missing: false,
    };
  } catch (err) {
    console.error("trove-page-data: tail read failed; client will fetch", err);
    return EMPTY_TAIL;
  } finally {
    clearTimeout(timer);
  }
});
