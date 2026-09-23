import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildPolarisTimeline, type PolarisTimelineRow } from "@/lib/sources/api/polaris-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { POLARIS_CHAIN_ID, normalizeCdpId, normalizeMarket } from "@/lib/polaris/asset-catalog";

// api arm of one Polaris CDP's timeline — the LIVE rails-server index. The
// grain is (market, cdpId), both required. rails-server answers the whole
// history in one response, oldest first: { market, cdp_id, totalEvents,
// rows }. A CDP the index does not know answers 404 upstream, passed through
// — the page treats that as "history pending", never as an empty history.
// The presentation transform (buildPolarisTimeline) projects the rows to
// BaseActivityEvent[]. Native units only. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TimelineRowsResponse {
  market: string;
  cdp_id: string;
  totalEvents: number;
  rows: PolarisTimelineRow[];
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const market = normalizeMarket(request.nextUrl.searchParams.get("market"));
  const id = normalizeCdpId(request.nextUrl.searchParams.get("id"));
  if (!market || !id) {
    return NextResponse.json({ error: "market (usdp|goldp) and id (a CDP number) are required" }, { status: 400 });
  }

  try {
    const qs = new URLSearchParams({ market, id });
    const response = await fetch(`${RAILS_API_URL}/api/polaris/timeline?${qs.toString()}`, {
      ...createAuthFetchOptions(undefined, readerIp),
    });
    if (!response.ok) {
      if (response.status !== 404) console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const json = (await response.json()) as TimelineRowsResponse;
    const data = buildPolarisTimeline(json.rows ?? [], market, id, json.totalEvents);
    return NextResponse.json(toTimelineWire(data, POLARIS_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching polaris timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
