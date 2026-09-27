import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildMapleTimeline, type MvRow } from "@/lib/sources/api/maple-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { mapleServedFolder } from "@/lib/sources/api/lender-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";

// api arm of a Maple wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw replayed mv_maple_events rows; we run the
// presentation transform (buildMapleTimeline: fixed-catalog symbols + signs)
// → BaseActivityEvent[]. Every value-bearing event is self-priced by its own
// log (assets + shares both emitted) — no oracle, no HF. Node runtime.
//
// `?group=1` is the same history as ROWS (decision 0019's evening amendment):
// the events travel flat and the rows as a plan, as on the SparkLend route,
// which carries the argument in full. `?from=`/`?to=` names a span of time in
// place of the newest window, grouped or flat, and is passed straight through.

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
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
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
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = request.nextUrl.searchParams.get("recent");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  try {
    if (request.nextUrl.searchParams.get("group") === "1") {
      const qs = new URLSearchParams({ wallet, group: "1" });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const response = await fetch(`${RAILS_API_URL}/api/maple/timeline?${qs.toString()}`, {
        ...createAuthFetchOptions(undefined, readerIp),
      });
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
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
      const data = buildMapleTimeline(eventRows, wallet);
      const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
        r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: mapleServedFolder(r.folder) },
      );
      const body = {
        ...data,
        totalEvents: upstream.totalEvents,
        cutoffBlock: upstream.cutoffBlock ?? null,
        grouped: true as const,
        rowPlan,
        eventsServed: upstream.eventsServed,
        boundBy: upstream.boundBy,
        span: upstream.span ?? null,
      };
      return NextResponse.json(toTimelineWire(body, MAINNET_CHAIN_ID), {
        headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
      });
    }

    const qs = new URLSearchParams({ wallet });
    if (recent) qs.set("recent", recent);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const url = `${RAILS_API_URL}/api/maple/timeline?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const { rows, totalEvents, truncated, cutoffBlock, span } = (await response.json()) as TimelineRowsResponse;
    const data = buildMapleTimeline(rows, wallet);
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
    console.error("Error fetching maple timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
