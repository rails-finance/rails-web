import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readDolomitePositions } from "@/lib/dolomite/proxy-reads";

// api arm of the Dolomite position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_dolomite_positions at the (owner, account_number) grain and returns the
// page slice as raw per-account rows (signed par per market + scalars); we
// layer the per-market chain state (ONE O(markets) multicall: the current
// index → wei including interest, the core's own oracle USD, live rates) in
// buildDolomitePositionRows. accountNumber filters pass through as STRINGS —
// uint256, never parsed to a number. Returns the { success, data, pagination }
// envelope. Node runtime, no edge caching.
//
// The read and the shaping live in lib/dolomite/proxy-reads.ts, which the
// position page's loader calls too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(await readDolomitePositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching dolomite positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
