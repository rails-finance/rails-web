import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildSparkTimeline, type MvRow } from "@/lib/sources/api/spark-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import {
  folderLegAddresses,
  toServedFolder,
  type UpstreamGroupedTimeline,
} from "@/lib/sources/api/timeline-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";

// api arm of a SparkLend wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw replayed spark_events_served rows; we run the chain-
// truth presentation transform (buildSparkTimeline: ERC20 symbol/decimals + signs)
// → BaseActivityEvent[]. Per-event USD rides the same rows: buildSparkTimeline
// maps each row's price_usd (mig 092, SparkLend's own IAaveOracle read at the
// event's block) via priceOf() — NULL until the price walk reaches that block,
// in which case the client stays token-only. No HF — that stays chain-direct.
// Node runtime.
//
// ── `?group=1`: THE SAME HISTORY AS ROWS
//
// Decision 0019's evening amendment moves the timeline's cut from EVENTS to
// ROWS: repetitive stretches arrive as FOLDERS carrying their members'
// aggregate, ungrouped events arrive as themselves, and `/timeline/folder`
// opens one folder's members. The grouping is rails-server's
// (`services/timeline-folders.ts`) and every reason behind it lives there and
// in decision 0019; this route's job under `group` is the same one it does for
// the flat answer — resolve what the index deliberately does not, and nothing
// else.
//
// It is OPT-IN on both hops. Without `group` the upstream call, the transform
// and this response are byte for byte what they were, which is what lets the
// server deploy before the web.
//
// THE EVENTS TRAVEL FLAT AND THE ROWS TRAVEL AS A PLAN — see
// `TimelineRowPlanEntry` in lib/shared/timeline-folder.ts. `toTimelineWire`'s
// diet is what keeps a deep history affordable and it works over one flat
// array, so nesting the transformed events inside the rows would have cost the
// diet and bought nothing.

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
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = request.nextUrl.searchParams.get("recent");
  const grouped = request.nextUrl.searchParams.get("group") === "1";

  try {
    if (grouped) {
      // `recent` is deliberately NOT composed with `group`: under grouping the
      // two bounds are the route's own (a row cap and an event scan bound,
      // whichever binds first), because a caller cannot know how many events
      // fill a thousand rows on this particular position.
      const url = `${RAILS_API_URL}/api/spark/timeline?wallet=${encodeURIComponent(wallet)}&group=1`;
      const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
      // A backend that predates the grouping answers `?group=1` with the FLAT
      // shape — same 200, raw spark_events_served rows rather than wire rows. Saying so
      // is the whole point: transforming it anyway would produce a page of
      // folders that are not folders, and a caller that cannot tell "not
      // deployed yet" from "this position has no folders" would report a
      // green run for a feature that never ran.
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
        buildSparkTimeline(eventRows, wallet),
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

    const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
    const url = `${RAILS_API_URL}/api/spark/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const { rows, totalEvents, truncated, cutoffBlock } = (await response.json()) as TimelineRowsResponse;
    const data = await buildSparkTimeline(rows, wallet);
    // The ceiling and the window are different claims and both can be absent.
    // A windowed fetch is never truncated — it asked for a window and got one —
    // so `withRowCeiling` stays exactly as it was and simply never fires.
    const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching spark timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
