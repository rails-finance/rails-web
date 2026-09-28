import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFluidTimeline } from "@/lib/fluid/proxy-reads";

// api arm of a Fluid position's timeline — the LIVE rails-server index, keyed
// by the position NFT id (Fluid positions are ERC721s — the MakerDAO-cdp URL
// pattern). rails-server returns the raw replayed mv_fluid_events rows
// (operate deltas + the liquidation-attribution rows + ownership transfers);
// we run the presentation transform → BaseActivityEvent[]. Node runtime.
//
// The read and the shaping live in lib/fluid/proxy-reads.ts, which the position
// page's loader calls too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(await readFluidTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching fluid timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
