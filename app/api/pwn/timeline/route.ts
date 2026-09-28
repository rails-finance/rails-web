import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readPwnTimeline } from "@/lib/pwn/proxy-reads";

// api arm of a PWN wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw mv_pwn_events rows (loan lifecycle, LEFT JOINed to
// decoded terms); we run the chain-state presentation transform (buildPwnTimeline:
// ERC20/721 symbols + amounts + per-viewer signing) → BaseActivityEvent[]. Each
// event is discrete (no running-balance fold). No USD / no HF. Node runtime.
//
// The read and the shaping live in lib/pwn/proxy-reads.ts, which the position
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
    return respondWith(await readPwnTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching pwn timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
