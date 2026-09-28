import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readCompoundTimeline } from "@/lib/compound/proxy-reads";

// api arm of a Compound V3 wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw replayed mv_compound_v3_events rows (optionally
// market-scoped); we run the chain-state presentation transform
// (buildCompoundTimeline: per-market base symbol/decimals + collateral ERC20 +
// signs) → BaseActivityEvent[]. No USD / no HF — chain-direct values only. Node
// runtime.
//
// The read and the shaping live in lib/compound/proxy-reads.ts, which the
// position page's loader calls too.

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
    return respondWith(await readCompoundTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching compound timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
