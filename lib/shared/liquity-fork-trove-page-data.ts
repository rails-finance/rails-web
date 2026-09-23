// Trove detail page loader for the three Liquity V2 forks — the position's
// tail, read server-side.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Imported only from a fork's trove page server component.
//
// A position has two shelf-lives and this loader takes the long one. The TAIL
// is the replayed summary plus the event history: settled facts that render the
// whole page. The HEAD — getLatestTroveData, the branch's simulated fetchPrice,
// its own getCurrentICR and the redemption queue walk — stays a client-side
// second wave, so no document waits on a chain round trip.
//
// Unlike lib/liquity/trove-page-data.ts, this reads through THIS deployment's
// own /api/<fork>/* routes rather than going straight to RAILS_API_URL. Those
// routes are not hops: `/api/<fork>/troves` narrows the backend's raw rows via
// build<Fork>TroveRows AND values them at each branch's own PriceFeed in a
// multicall, and `/api/<fork>/<branch>/<id>/timeline` runs build<Fork>Timeline
// over the raw mv rows. Going direct would return rows the page cannot render.
// Read what a proxy does before deciding it is only a proxy. The hop carries
// the reader's signed IP headers (`ssrHop()`), so the proxy's backend read is
// budgeted as the reader.
//
// Best-effort by design. Any failed read returns an empty tail rather than
// throwing, and the client half fetches for itself exactly as it did before the
// route had a server half — an SSR miss costs the first-paint win, not the page.
// The one hard miss is a branch+id the backend answers for and does not have:
// that is a real 404, and the (views) route group above these routes is what
// lets the page answer with one.

import { cache } from "react";
import { ssrHop } from "@/lib/shared/listing-ssr";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";

// Bound the server wait. A force-dynamic page whose backend read runs long would
// otherwise hold the render until the platform kills it with a function-timeout
// 503. On timeout we abandon the read and hand the client an unseeded view,
// which fetches under its own skeleton. Same budget as the listing SSR driver.
const TAIL_FETCH_TIMEOUT_MS = 8000;

export interface ForkTroveTail<Summary> {
  trove: Summary | null;
  events: BaseActivityEvent[] | null;
  /** Where the timeline's `recent` window opened. Null means `events` IS the
   *  whole history — the answer for every Trove smaller than the window. */
  cutoffBlock: number | null;
  /** The declared opening balance below `cutoffBlock`, read here for the same
   *  reason the timeline is: one render, one document. Null with a cutoff set
   *  means the read failed — the client re-requests it on mount, and every
   *  whole-history figure states itself unknown until it lands. */
  opening: TimelineOpeningBalance | null;
  /** The backend answered and has no such trove — render a 404, not a retry. */
  missing: boolean;
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${TAIL_FETCH_TIMEOUT_MS}ms`)), TAIL_FETCH_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Build one fork's tail loader. Call once at module scope per protocol: the
 * returned function is wrapped in React `cache`, so `generateMetadata` and the
 * page body share a single read per request.
 */
export function forkTroveTailLoader<Summary>(opts: {
  /** Protocol id, for log lines only. */
  label: string;
  /** The fork's own `resolveBranch` — accepts a branch key or its symbol. */
  resolveBranch: (collateralType: string) => unknown | undefined;
  fetchTroves: (p: {
    troveId: string;
    collateralTypes: string[];
    limit: number;
    baseUrl: string;
    headers: Record<string, string>;
  }) => Promise<{ data: Summary[] }>;
  fetchTimeline: (
    collateralType: string,
    troveId: string,
    o: { baseUrl: string; headers: Record<string, string>; recent?: number },
  ) => Promise<{
    events: BaseActivityEvent[];
    cutoffBlock?: number | null;
  }>;
  /** The most recent N events to window the timeline to. Omitted keeps the
   *  whole-history fetch — the pre-window behaviour, byte for byte. */
  recent?: number;
  /** The fork's `/timeline/summary` proxy path for one trove. Present, the
   *  loader chains the opening-balance read after a timeline that named a
   *  cutoff block — see lib/shared/position-tail-page-data.ts for why that
   *  third read belongs on the server too. */
  openingPath?: (collateralType: string, troveId: string) => string;
}) {
  const empty: ForkTroveTail<Summary> = {
    trove: null,
    events: null,
    cutoffBlock: null,
    opening: null,
    missing: false,
  };

  return cache(async (collateralType: string, troveId: string): Promise<ForkTroveTail<Summary>> => {
    // The branch is part of the URL's claim, and neither proxy validates it —
    // an unknown one reaches the backend, which answers for whatever it makes
    // of the string. Resolve it here so an unknown branch is a 404 rather than
    // a silently corrected read.
    if (opts.resolveBranch(collateralType) == null) return { ...empty, missing: true };

    const hop = await ssrHop();
    if (!hop) return empty;
    const { baseUrl: origin, headers } = hop;

    // Settled separately: a rejected troves read and a rejected timeline read
    // mean different things, and Promise.all would lose that by failing on the
    // first of them.
    const [troves, timeline] = await Promise.allSettled([
      withTimeout(
        opts.fetchTroves({ troveId, collateralTypes: [collateralType], limit: 1, baseUrl: origin, headers }),
        `${opts.label} troves`,
      ),
      withTimeout(
        opts.fetchTimeline(collateralType, troveId, { baseUrl: origin, headers, recent: opts.recent }),
        `${opts.label} timeline`,
      ),
    ]);

    if (troves.status === "rejected") {
      console.error(`${opts.label}-trove-page-data: troves read failed; client will fetch`, troves.reason);
      return empty;
    }
    const trove = troves.value.data?.[0] ?? null;
    // A read that failed is indistinguishable from a slow backend and must not
    // read as absence. Only an answered request with an empty roster says the
    // trove does not exist.
    if (!trove) return { ...empty, missing: true };

    // The tail seeds whole or not at all. `seeded` on the client half is one
    // flag off the summary, and the second wave reads only the chain state — so
    // a summary that arrived beside a FAILED timeline would render an empty
    // activity list, as a settled fact, with nothing left to correct it. A
    // timeline that answered with no rows is a different thing and seeds fine.
    if (timeline.status === "rejected") {
      console.error(`${opts.label}-trove-page-data: timeline read failed; client will fetch`, timeline.reason);
      return empty;
    }

    const cutoffBlock = timeline.value.cutoffBlock ?? null;

    // Chained, because the cutoff block is what names it. A failure here does
    // NOT forfeit the seed: the client's own model has a place for an opening
    // balance that has not arrived — every whole-history figure states itself
    // unknown rather than stating the window's arithmetic as a lifetime — and
    // the client re-requests it on mount.
    let opening: TimelineOpeningBalance | null = null;
    if (cutoffBlock != null && opts.openingPath) {
      const path = opts.openingPath(collateralType, troveId);
      try {
        opening = await withTimeout(
          fetchTimelineOpeningBalance({ path, params: {}, cutoffBlock, baseUrl: origin, headers }),
          `${opts.label} opening balance`,
        );
      } catch (err) {
        console.error(`${opts.label}-trove-page-data: opening balance failed; client will fetch`, err);
      }
    }

    return {
      trove,
      events: timeline.value.events ?? [],
      cutoffBlock,
      opening,
      missing: false,
    };
  });
}
