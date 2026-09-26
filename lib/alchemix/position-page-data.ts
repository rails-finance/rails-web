// Alchemist position page loader — the position's tail and its live figures.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Reads the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle), which is the same code
// the /api/alchemix/position proxies run with one less hop. The proxies are
// untouched: the browser refreshes the live figures through them.
//
// TWO READS WITH DIFFERENT SHELF-LIVES, and the difference is this protocol's
// whole point.
//
// THE TAIL is settled: the graded position row, its line's coverage, and the
// event history. Each figure on it carries the block it is true at, and it
// stays true at that block forever.
//
// THE LIVE FIGURES are not. Earmarked debt accrues inside the Alchemist on
// every block, so a stored earmarked figure is true at the block it was read at
// and at no other — which is why the page's headline earmarked figure comes
// from `/state`, one `getCDP` call whose debt, collateral and earmarked are all
// one reading at one block, and never from the stored row. The stored figure
// still renders, in its own slot, under its own block, as what it is: the last
// reading taken. Nothing carries either forward or puts one beside a figure
// from another block.
//
// SEEDING IS WHOLE OR NOT AT ALL, the rule `loadTroveTail` sets next door: a
// summary that arrived beside a FAILED timeline would render an empty history
// as a settled fact, with nothing left to correct it. A failed read returns the
// empty tail and the client fetches for itself; only an ANSWERED backend with
// no such position is `missing`, and that is a 404.
//
// The live read is separate and best-effort by the same logic: it is not part
// of the tail, so its failure voids only its own slot, which then says the
// reading did not land rather than showing a figure from somewhere else.

import { cache } from "react";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import {
  ALCHEMIX_TOKEN_ID,
  readAlchemixPosition,
  readAlchemixState,
  readAlchemixTimeline,
} from "@/lib/sources/api/alchemix-position-backend";
import { isLineOnChain } from "@/lib/alchemix/lines";
import type { ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import type {
  AlchemixLineCoverage,
  AlchemixLiveState,
  AlchemixPositionSummary,
} from "@/types/api/alchemix";

/** The one cut on this timeline, and the same `limit` the client's own read
 *  sends, so the server-seeded page and a client refetch draw the same rows. */
const TIMELINE_LIMIT = TIMELINE_WINDOW_ROWS;

// Bound the server wait. A force-dynamic page whose backend read runs long
// would hold the render until the platform kills it with a function-timeout
// 503; abandoning the read and handing the client an unseeded view is a
// degraded first paint rather than no page. Same budget as the trove loader.
const TAIL_FETCH_TIMEOUT_MS = 8000;

/** The live read gets a shorter budget than the tail. It is a chain call behind
 *  a 30s cache on the box, so a cold one can be slow, and the page renders
 *  perfectly well with the slot saying the reading has not landed. */
const STATE_FETCH_TIMEOUT_MS = 4000;

export interface AlchemistPositionTail {
  position: AlchemixPositionSummary | null;
  /** This line's own coverage row — what it answers about its completeness. */
  coverage: AlchemixLineCoverage | null;
  events: BaseActivityEvent[] | null;
  /** The position's whole event count as the route reported it beside the page
   *  it served, and whether that page stopped short of it. Null on a miss. */
  totalEvents: number | null;
  hasMore: boolean;
  /** What the route says a line-scope row is. Rendered as given — it is the
   *  backend's own statement about rows that name no position. */
  lineScopedNote: string | null;
  /** The backend answered and has no such position — a 404, not a retry. */
  missing: boolean;
}

const EMPTY_TAIL: AlchemistPositionTail = {
  position: null,
  coverage: null,
  events: null,
  totalEvents: null,
  hasMore: false,
  lineScopedNote: null,
  missing: false,
};

/**
 * The position's tail, for the server render. Wrapped in React `cache` so
 * `generateMetadata`, the page body and the share card share one read per
 * request.
 *
 * Never throws: any failure hands the caller `EMPTY_TAIL`.
 */
export const loadAlchemistPositionTail = cache(
  async (chainId: ChainId, lineKey: string, tokenId: string): Promise<AlchemistPositionTail> => {
    // The chain is asserted, never parsed off the line key. A key that is real
    // on the other chain must not be honoured by this explorer: the position it
    // would serve is a different position with the same token id.
    if (!isLineOnChain(chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(tokenId)) {
      return { ...EMPTY_TAIL, missing: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAIL_FETCH_TIMEOUT_MS);
    try {
      const readerIp = await readerIpFromHeaders();
      const [positionRead, timelineRead] = await Promise.all([
        readAlchemixPosition(lineKey, tokenId, readerIp, controller.signal),
        readAlchemixTimeline(lineKey, tokenId, { limit: TIMELINE_LIMIT }, readerIp, controller.signal),
      ]);

      // A 404 is the backend answering that it holds no such position. Every
      // other refusal is a read that did not settle, and an unsettled read must
      // not render as absence.
      if (!positionRead.ok) {
        if (positionRead.status === 404) return { ...EMPTY_TAIL, missing: true };
        console.error(`alchemix position: ${lineKey}/${tokenId} -> ${positionRead.status} ${positionRead.statusText}`);
        return EMPTY_TAIL;
      }
      // Whole or nothing. A timeline that ANSWERED with no rows seeds fine; one
      // that failed forfeits the seed, so the client fetches under its own
      // skeleton rather than the page stating an empty history as settled.
      if (!timelineRead.ok) {
        console.error(`alchemix timeline: ${lineKey}/${tokenId} -> ${timelineRead.status} ${timelineRead.statusText}`);
        return EMPTY_TAIL;
      }

      const coverage = positionRead.result.coverage?.lines?.find((l) => l.lineKey === lineKey) ?? null;
      return {
        position: positionRead.result.data,
        coverage,
        events: timelineRead.result.data.events ?? [],
        totalEvents: timelineRead.result.pagination?.total ?? null,
        hasMore: timelineRead.result.pagination?.hasMore === true,
        lineScopedNote: timelineRead.result.notes?.lineScopedEvents ?? null,
        missing: false,
      };
    } catch (err) {
      console.error("alchemix position: the tail read failed; the client will fetch", err);
      return EMPTY_TAIL;
    } finally {
      clearTimeout(timer);
    }
  },
);

/**
 * The position's CURRENT figures, read at render. Null when the read did not
 * land, which the page states as such — there is no stored figure to stand in
 * for it, because no stored figure is current.
 */
export const loadAlchemistLiveState = cache(
  async (chainId: ChainId, lineKey: string, tokenId: string): Promise<AlchemixLiveState | null> => {
    if (!isLineOnChain(chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(tokenId)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATE_FETCH_TIMEOUT_MS);
    try {
      const readerIp = await readerIpFromHeaders();
      const read = await readAlchemixState(lineKey, tokenId, readerIp, controller.signal);
      if (!read.ok) {
        console.error(`alchemix state: ${lineKey}/${tokenId} -> ${read.status} ${read.statusText}`);
        return null;
      }
      return read.result.data;
    } catch (err) {
      console.error("alchemix state: the read did not land; the slot will say so", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
);
