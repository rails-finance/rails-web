import { NextRequest, NextResponse } from "next/server";
import { attachForkRedistSources } from "@/lib/sources/api/liquity-fork-redist-sources";
import { resolveBranch } from "@/lib/asymmetry/asset-catalog";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildAsymmetryTimeline, type MvRow } from "@/lib/sources/api/asymmetry-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { asymmetryServedFolder } from "@/lib/sources/api/asymmetry-folder";
import { SHAPE_RUNS_PARAM } from "@/lib/shared/timeline-folder";

// api arm of a single Asymmetry Trove's timeline — the LIVE rails-server index.
// rails-server returns the raw mv_asymmetry_events rows for one (branch, troveId); we run
// the presentation transform (buildAsymmetryTimeline) server-side and return the shaped
// { collateralType, troveId, events, totalEvents }.
//
// `?group=1` is the same history as ROWS (decision 0019's evening amendment):
// one upstream read, the bounds the route's own. The events travel flat and
// the rows as a plan, as on the SparkLend route, which carries the argument in
// full. `?from=`/`?to=` names a span of time in place of the newest window,
// grouped or flat, and is passed straight through.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TimelineBackendResponse {
  collateralType: string;
  troveId: string;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collateralType: string; troveId: string }> },
) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { collateralType, troveId } = await params;
  try {
    // Passed straight through, validated upstream: rails-server owns the shape
    // of `recent` and answers a bad one with its own 400. Re-validating it here
    // would be a second opinion about the same parameter, and the two would drift.
    const sp = request.nextUrl.searchParams;
    const qs = new URLSearchParams();
    for (const k of ["recent", "group", "from", "to"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    if (sp.get("group") === "1") qs.set(SHAPE_RUNS_PARAM, "1");
    const q = qs.toString();
    const url = `${RAILS_API_URL}/api/asymmetry/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline${q ? `?${q}` : ""}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    if (sp.get("group") === "1") {
      const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow> & {
        collateralType?: string;
        troveId?: string;
      };
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
      const data = buildAsymmetryTimeline(
        eventRows,
        upstream.collateralType ?? collateralType,
        upstream.troveId ?? troveId,
      );
      await attachForkRedistSources(data.events, {
        fork: "asymmetry",
        branch: resolveBranch(collateralType)?.key ?? collateralType,
        collDecimals: resolveBranch(collateralType)?.decimals ?? 18,
        boundaries: upstream.rows.flatMap((r) => (r.kind === "event" ? [] : [r.folder.lastBlock])),
        readerIp,
      });
      const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
        r.kind === "event"
          ? { kind: "event" }
          : { kind: "folder", folder: asymmetryServedFolder(r.folder, collateralType) },
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
    const raw = (await response.json()) as TimelineBackendResponse;
    const result = buildAsymmetryTimeline(raw.rows ?? [], raw.collateralType ?? collateralType, raw.troveId ?? troveId);
    await attachForkRedistSources(result.events, {
      fork: "asymmetry",
      branch: resolveBranch(collateralType)?.key ?? collateralType,
      collDecimals: resolveBranch(collateralType)?.decimals ?? 18,
      readerIp,
    });
    // The ceiling and the window are different claims and both can be absent.
    // A windowed fetch is never truncated — it asked for a window and got one —
    // so `withRowCeiling` stays exactly as it was and simply never fires.
    const windowed = {
      ...withRowCeiling(result, { totalEvents: raw.totalEvents, truncated: raw.truncated }),
      cutoffBlock: raw.cutoffBlock ?? null,
      span: raw.span ?? null,
    };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching asymmetry timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
