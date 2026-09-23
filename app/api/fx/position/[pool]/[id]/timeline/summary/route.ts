import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for an f(x) V2 position — everything BELOW the block
// that `/api/fx/position/:pool/:id/timeline?recent=N` opened its window at.
// The model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// ⚠️ COVERS THE mv_fx_events LANE ONLY — the same lane the window cuts. The
// ownership and socialized lanes ride /timeline whole whatever the window, so
// their below-the-line cards are already in the client's hands and are never
// summarised here; `totalEvents` on this response is the MV lane's count, not
// the three-lane total the page renders.
//
// No symbols to resolve: byAction arrives in the client's own derived
// vocabulary (the backend replays buildFxTimeline's classification), the flow
// buckets are the debt side of the position (fxUSD, 18dp by construction),
// and the actor split is judged upstream the way the page judges it. The
// shared resolver still runs so the response shape is canonical, and it
// renames nothing.
//
// Node runtime, no edge caching — same as its /timeline twin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, { params }: { params: Promise<{ pool: string; id: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { pool, id } = await params;
  if (!isFxPoolKey(pool) || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const url = `${RAILS_API_URL}/api/fx/position/${pool}/${id}/timeline/summary?cutoffBlock=${encodeURIComponent(cutoffBlock)}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;
    const opening = resolveOpeningAssetKeys(upstream, () => undefined);
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching fx timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
