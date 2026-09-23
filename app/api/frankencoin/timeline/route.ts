import { NextRequest, NextResponse } from "next/server";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFrankencoinTimeline, type FrankencoinMvRow } from "@/lib/sources/api/frankencoin-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// api arm of a Frankencoin position's timeline — the LIVE rails-server index.
// The grain is the POSITION contract address (required). rails-server pages
// the raw event rows (PositionOpened, the MintingUpdate ledger with lag
// columns, PositionDenied, OwnershipTransferred, the challenge slices —
// leg-keyed, several ChallengeSucceeded slices per multi-bid auction — and
// ForcedSale) by KEYSET CURSOR: { position, rows, totalEvents, limit,
// nextCursor, hasMore }. The cursor is an opaque token from the response —
// passed back verbatim, never constructed. This proxy walks the cursor
// server-side, assembles the whole history, and runs the presentation
// transform (buildFrankencoinTimeline) → BaseActivityEvent[]. Native units
// only — chain-emitted values, no USD. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** The backend's max page size. */
const PAGE_LIMIT = 5000;
/** Hard stop on the cursor walk — if it ever trips, events.length <
 *  totalEvents states the truncation plainly rather than looping unbounded. */
const MAX_PAGES = 20;

interface TimelineRowsResponse {
  position: string;
  rows: FrankencoinMvRow[];
  totalEvents: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** Where `?recent=N` drew the line — see the fetch loop below. Null (or
   *  absent, on a backend that predates it) means the pages ARE the whole
   *  history. */
  cutoffBlock?: number | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const position = request.nextUrl.searchParams.get("position");
  if (!position) {
    return NextResponse.json({ error: "position is required" }, { status: 400 });
  }
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Sent on the FIRST page
  // only — the window and the cursor compose upstream, and page one's cursor
  // already sits at or past the cutoff, so re-sending it would let a fresh
  // event move a recomputed cutoff up mid-drain.
  const recent = request.nextUrl.searchParams.get("recent");

  try {
    const rows: FrankencoinMvRow[] = [];
    let totalEvents = 0;
    let cursor: string | null = null;
    let cutoffBlock: number | null = null;
    let lastResponse: Response | null = null;
    // True when the walk hit MAX_PAGES with the backend still saying `hasMore`
    // — the drained rows are then a prefix of the history, and the page's
    // row-ceiling disclosure states it rather than a cut list passing as whole.
    let stoppedShort = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ position, limit: String(PAGE_LIMIT) });
      if (recent && page === 0) qs.set("recent", recent);
      if (cursor) qs.set("cursor", cursor);
      const response = await fetch(`${RAILS_API_URL}/api/frankencoin/timeline?${qs.toString()}`, {
        ...createAuthFetchOptions(undefined, readerIp),
      });
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const json = (await response.json()) as TimelineRowsResponse;
      rows.push(...json.rows);
      totalEvents = json.totalEvents;
      if (page === 0) cutoffBlock = json.cutoffBlock ?? null;
      lastResponse = response;
      if (!json.hasMore || !json.nextCursor) break;
      cursor = json.nextCursor;
      stoppedShort = page === MAX_PAGES - 1;
    }

    const data = {
      ...withRowCeiling(buildFrankencoinTimeline(rows, position, totalEvents), {
        totalEvents,
        truncated: stoppedShort,
      }),
      cutoffBlock,
    };
    return NextResponse.json(
      toTimelineWire(data, MAINNET_CHAIN_ID),
      lastResponse ? { headers: proxyCacheControl(lastResponse, LISTING_CACHE_CONTROL) } : undefined,
    );
  } catch (error) {
    console.error("Error fetching frankencoin timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
