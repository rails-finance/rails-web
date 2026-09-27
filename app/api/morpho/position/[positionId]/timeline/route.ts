import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildMorphoTimeline, type RawMorphoTimelineResponse } from "@/lib/sources/api/morpho-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { resolveMarketMeta } from "@/lib/sources/api/morpho-timeline";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { morphoServedFolder } from "@/lib/sources/api/lender-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";

// Proxies a single Morpho position's timeline from the live rails-server index.
// rails returns the per-event signed deltas with each row's running balances,
// plus the market params; buildMorphoTimeline shapes the BaseActivityEvent[].
// `positionId` = `${marketIdHex}-${owner}`.
//
// `?group=1` is the same history as ROWS (decision 0019's evening amendment):
// the events travel flat and the rows as a plan, as on the SparkLend route,
// which carries the argument in full. `?from=`/`?to=` names a span of time in
// place of the newest window, grouped or flat, and is passed straight through.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, context: { params: Promise<{ positionId: string }> }) {
  const readerIp = readerIpFromRequest(request);
  const { positionId } = await context.params;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    // Passed straight through, validated upstream: rails-server owns the shape
    // of `recent` and answers a bad one with its own 400.
    const sp = request.nextUrl.searchParams;
    const qs = new URLSearchParams();
    for (const k of ["recent", "from", "to"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const base = `${RAILS_API_URL}/api/morpho/position/${encodeURIComponent(positionId)}/timeline`;

    if (sp.get("group") === "1") {
      qs.delete("recent");
      qs.set("group", "1");
      const response = await fetch(`${base}?${qs.toString()}`, createAuthFetchOptions(undefined, readerIp));
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const upstream = (await response.json()) as UpstreamGroupedTimeline<RawMorphoTimelineResponse["rows"][number]> &
        Omit<RawMorphoTimelineResponse, "rows">;
      // A backend that predates the grouping answers the flat shape; reading it
      // as rows would draw a page of folders that are not folders.
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
      const [result, meta] = await Promise.all([
        buildMorphoTimeline({ ...upstream, rows: eventRows }),
        resolveMarketMeta(upstream.marketId, upstream.marketParams),
      ]);
      const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
        r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: morphoServedFolder(r.folder, meta) },
      );
      const body = {
        ...result,
        totalEvents: upstream.totalEvents,
        cutoffBlock: upstream.cutoffBlock ?? null,
        grouped: true as const,
        rowPlan,
        eventsServed: upstream.eventsServed,
        boundBy: upstream.boundBy,
        span: upstream.span ?? null,
      };
      return NextResponse.json(toTimelineWire(body, MAINNET_CHAIN_ID), {
        headers: timelineCacheHeaders(result.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
      });
    }

    const url = qs.toString() ? `${base}?${qs.toString()}` : base;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const raw = (await response.json()) as RawMorphoTimelineResponse;
    const result = await buildMorphoTimeline(raw);
    // The ceiling and the window are different claims and both can be absent.
    const windowed = {
      ...withRowCeiling(result, { totalEvents: raw.totalEvents, truncated: raw.truncated }),
      cutoffBlock: raw.cutoffBlock ?? null,
      span: (raw as { span?: { from: number; to: number } | null }).span ?? null,
    };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: timelineCacheHeaders(result.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    });
  } catch (error) {
    console.error("Error fetching morpho position timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
