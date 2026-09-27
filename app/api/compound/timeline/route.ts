import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildCompoundTimeline, type MvRow } from "@/lib/sources/api/compound-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { compoundFolderTokenAddresses, compoundServedFolder } from "@/lib/sources/api/compound-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";

// api arm of a Compound V3 wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw replayed mv_compound_v3_events rows (optionally
// market-scoped); we run the chain-state presentation transform
// (buildCompoundTimeline: per-market base symbol/decimals + collateral ERC20 +
// signs) → BaseActivityEvent[]. No USD / no HF — chain-direct values only. Node
// runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TimelineRowsResponse {
  wallet: string;
  market: string | null;
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
  const market = request.nextUrl.searchParams.get("market");
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = request.nextUrl.searchParams.get("recent");
  // `?from=`/`?to=`: a span of time in place of the newest window, passed
  // straight through; rails-server refuses a half span or one beside `recent`.
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  try {
    // ── `?group=1`: the same history as ROWS (decision 0019's evening
    // amendment), for one (market, account). The events travel flat and the
    // rows as a plan, as on the SparkLend route, which carries the argument.
    if (request.nextUrl.searchParams.get("group") === "1") {
      if (!market) return NextResponse.json({ error: "market is required" }, { status: 400 });
      const gqs = new URLSearchParams({ wallet, market, group: "1" });
      if (from) gqs.set("from", from);
      if (to) gqs.set("to", to);
      const response = await fetch(
        `${RAILS_API_URL}/api/compound/timeline?${gqs.toString()}`,
        createAuthFetchOptions(undefined, readerIp),
      );
      if (!response.ok) {
        console.error(`Backend API error: ${response.status} ${response.statusText}`);
        return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
      }
      const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
      // A backend that predates the grouping answers the flat shape; reading
      // it as rows would draw a page of folders that are not folders.
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
      const folders = upstream.rows.flatMap((r) => (r.kind === "folder" ? [r.folder] : []));
      // One ERC20 read behind the rows and one behind the folder headers,
      // run together: a header and the rows beneath it name a token alike.
      const [data, metas] = await Promise.all([
        buildCompoundTimeline(eventRows, wallet, market),
        resolveErc20Meta(compoundFolderTokenAddresses(folders)),
      ]);
      const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
        r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: compoundServedFolder(r.folder, metas) },
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
        headers: [...metas.values()].some((m) => m.unresolved)
          ? { "Cache-Control": "no-store" }
          : timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
      });
    }

    const qs = new URLSearchParams({ wallet });
    if (market) qs.set("market", market);
    if (recent) qs.set("recent", recent);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const url = `${RAILS_API_URL}/api/compound/timeline?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const {
      rows,
      market: respMarket,
      totalEvents,
      truncated,
      cutoffBlock,
      span,
    } = (await response.json()) as TimelineRowsResponse;
    const data = await buildCompoundTimeline(rows, wallet, respMarket ?? null);
    // The ceiling and the window are different claims and both can be absent.
    // A windowed fetch is never truncated — it asked for a window and got one —
    // so `withRowCeiling` stays exactly as it was and simply never fires.
    const windowed = {
      ...withRowCeiling(data, { totalEvents, truncated }),
      cutoffBlock: cutoffBlock ?? null,
      span: span ?? null,
    };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    });
  } catch (error) {
    console.error("Error fetching compound timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
