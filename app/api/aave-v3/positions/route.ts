import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readAaveV3Positions } from "@/lib/aave-v3/proxy-reads";

// Proxies the Aave V3 positions listing from the live rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_aave_v3_positions and returns the page slice as raw per-wallet rows; we
// resolve symbols + assemble the card shape (buildAaveV3PositionRows) and
// return a { rows, total, limit, offset } envelope. HF / oracle USD are null
// here (no chain snapshot on this index yet — the V3 slice-2 gap). Node
// runtime, no edge caching.
//
// The read and the shaping live in lib/aave-v3/proxy-reads.ts, which the
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
    return respondWith(
      await readAaveV3Positions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp), request.signal),
    );
  } catch (error) {
    console.error("Error fetching aave-v3 positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
