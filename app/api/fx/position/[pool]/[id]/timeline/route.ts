import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFxTimeline } from "@/lib/fx/proxy-reads";

// api arm of a single f(x) V2 position's timeline — the LIVE rails-server
// index. rails-server ships the raw Operate/LiquidatePosition rows (each with
// its same-tx PositionSnapshot) plus the position meta with the settled chain
// state; buildFxTimeline shapes the BaseActivityEvents.
//
// The read and the shaping live in lib/fx/proxy-reads.ts, which the position
// page's loader calls too.

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

  try {
    return respondWith(
      await readFxTimeline(pool, id, request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching fx timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
