import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFxTimeline, type RawFxTimelineResponse } from "@/lib/sources/api/fx-timeline";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// api arm of a single f(x) V2 position's timeline — the LIVE rails-server
// index. rails-server ships the raw Operate/LiquidatePosition rows (each with
// its same-tx PositionSnapshot) plus the position meta with the settled chain
// state; buildFxTimeline shapes the BaseActivityEvents.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, { params }: { params: Promise<{ pool: string; id: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }
  const { pool, id } = await params;
  if (!isFxPoolKey(pool) || !/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid position" }, { status: 400 });
  }

  try {
    // Passed straight through, validated upstream: rails-server owns the shape
    // of `recent` and answers a bad one with its own 400. The window cuts the
    // mv_fx_events lane only — the ownership and socialized lanes ride the
    // response whole either way.
    const recent = request.nextUrl.searchParams.get("recent");
    const recentQs = recent ? `?recent=${encodeURIComponent(recent)}` : "";
    const url = `${RAILS_API_URL}/api/fx/position/${pool}/${id}/timeline${recentQs}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (response.status === 404) {
      return NextResponse.json({ success: false, error: "Position not found" }, { status: 404 });
    }
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as RawFxTimelineResponse;
    const result = { ...buildFxTimeline(raw), cutoffBlock: raw.cutoffBlock ?? null };
    return NextResponse.json(toTimelineWire(result, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching fx timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
