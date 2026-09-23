import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildAaveV3Timeline, type MvRow } from "@/lib/sources/api/aave-v3-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import {
  folderLegAddresses,
  toServedFolder,
  type UpstreamGroupedTimeline,
} from "@/lib/sources/api/timeline-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";

// Proxies the Aave V3 timeline from the live rails-server index. rails-server
// returns the raw reduced mv_aave_v3_events rows; we run the presentation
// transform (buildAaveV3Timeline: ERC20 symbol/decimals + pooled basket) to
// shape the cards. Per-event USD rides the same rows: buildAaveV3Timeline maps
// each row's price_usd (mig 092, the market's own IAaveOracle read at the
// event's block) via priceOf() — NULL until the price walk reaches that block,
// in which case the client stays token-only. Node runtime, no edge caching.
//
// ── `?group=1`: THE SAME HISTORY AS ROWS
//
// The SparkLend twin of this branch, and for the same reason the two share
// their folder descriptors upstream: SparkLend is an Aave V3 fork and the two
// explorers collapse the same history the same way. Decision 0019's evening
// amendment moves the cut from EVENTS to ROWS — repetitive stretches arrive as
// FOLDERS carrying their members' aggregate, `/timeline/folder` opens one.
// Opt-in on both hops, so the flat answer keeps answering byte for byte while
// the server is deployed ahead of the web. The events travel flat and the rows
// travel as a plan (`TimelineRowPlanEntry`, lib/shared/timeline-folder.ts):
// `toTimelineWire`'s diet works over one flat array.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TimelineRowsResponse {
  wallet: string;
  rows: MvRow[];
  totalEvents: number;
  /** The index's row ceiling cut this query, so `rows` is short of
   *  `totalEvents`. Optional — a backend that predates the field means the
   *  fetch was not capped, and the page reads exactly as it did before. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line: `rows` holds every event from this block
   *  onward and everything below it is the opening balance, fetched from the
   *  /summary twin with THIS number. Null (or absent, on a backend that
   *  predates it) means the rows ARE the whole history. */
  cutoffBlock?: number | null;
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null (or
   *  absent, on a backend that predates it) means no span was asked for. A
   *  span answer always carries `cutoffBlock: null`: a stretch in the middle
   *  of a history is not the newest slice of anything, so it brings nothing
   *  forward. */
  span?: { from: number; to: number } | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  const market = request.nextUrl.searchParams.get("market");
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = request.nextUrl.searchParams.get("recent");
  // `?from=`/`?to=` — the OTHER window, a span of time in unix seconds, for a
  // reader who pointed at one month or one day in the middle of the history
  // rather than at its newest end. Passed straight through for the same reason
  // `recent` is: rails-server owns the shape of both, refuses them together,
  // and answers a bad one with its own 400. It is never composed with `group`.
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const grouped = request.nextUrl.searchParams.get("group") === "1";

  try {
    if (grouped) {
      // `recent` is deliberately NOT composed with `group`: under grouping the
      // two bounds are the route's own (a row cap and an event scan bound,
      // whichever binds first), because a caller cannot know how many events
      // fill a thousand rows on this particular position.
      const marketParam = market ? `&market=${encodeURIComponent(market)}` : "";
      // `swaps=1`: both legs of a paired position swap arrive marked, and the
      // transform draws them as one card (rails-ops TO-DO-ui-jobs §15).
      const url = `${RAILS_API_URL}/api/aave-v3/timeline?wallet=${encodeURIComponent(wallet)}${marketParam}&group=1&swaps=1`;
      const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
      // A backend that predates the grouping answers `?group=1` with the FLAT
      // shape — same 200, rows of raw MV rows rather than wire rows. Saying so
      // is the whole point: a caller that cannot tell "not deployed yet" from
      // "this position has no folders" would report a green run for a feature
      // that never ran. The SparkLend twin carries the argument in full.
      if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
        return NextResponse.json(
          {
            error: "Not grouped",
            code: "GROUPING_UNAVAILABLE",
            message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
          },
          { status: 502 },
        );
      }
      const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
      // ONE resolver behind both halves of the answer, exactly as the flat
      // branch has one behind its rows: a folder header and the rows beneath
      // it must never disagree about what a symbol is.
      const [data, legMetas] = await Promise.all([
        buildAaveV3Timeline(eventRows, wallet),
        resolveErc20Meta(folderLegAddresses(upstream.rows)),
      ]);
      const resolve = {
        symbol: (key: string) => legMetas.get(key)?.symbol,
        decimals: (key: string) => legMetas.get(key)?.decimals,
      };
      const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
        r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: toServedFolder(r.folder, resolve) },
      );
      const body = {
        ...data,
        // The position's own count, not this answer's — the same meaning it
        // carries on the flat branch.
        totalEvents: upstream.totalEvents,
        cutoffBlock: upstream.cutoffBlock ?? null,
        grouped: true as const,
        rowPlan,
        eventsServed: upstream.eventsServed,
        boundBy: upstream.boundBy,
      };
      return NextResponse.json(toTimelineWire(body, MAINNET_CHAIN_ID), {
        headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
      });
    }

    const marketQs = market ? `&market=${encodeURIComponent(market)}` : "";
    const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
    // Each end forwarded independently, so a half span reaches upstream and
    // gets upstream's own "from and to are given together or not at all"
    // rather than being silently completed or silently dropped here.
    const spanQs = (from ? `&from=${encodeURIComponent(from)}` : "") + (to ? `&to=${encodeURIComponent(to)}` : "");
    const url = `${RAILS_API_URL}/api/aave-v3/timeline?wallet=${encodeURIComponent(wallet)}${marketQs}${recentQs}${spanQs}&swaps=1`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const { rows, totalEvents, truncated, cutoffBlock, span } = (await response.json()) as TimelineRowsResponse;
    const data = await buildAaveV3Timeline(rows, wallet);
    // The ceiling and the window are different claims and both can be absent.
    // A windowed fetch is never truncated — it asked for a window and got one —
    // so `withRowCeiling` stays exactly as it was and simply never fires.
    const windowed = {
      ...withRowCeiling(data, { totalEvents, truncated }),
      cutoffBlock: cutoffBlock ?? null,
      span: span ?? null,
    };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching aave-v3 timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
