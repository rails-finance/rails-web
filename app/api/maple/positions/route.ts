import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMaplePositions } from "@/lib/maple/proxy-reads";

// api arm of the Maple position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_maple_wallets
// and returns the page slice as raw per-wallet rows (pool keys + the replayed
// lanes + scalars); we shape them against the fixed pool catalog and layer
// the per-pool chain state (exit/NAV rates + the liquid/deployed split) in
// buildMaplePositionRows. The pool-state map rides the response too — the
// listing's access band and the detail page read it from the same fetch.
// Returns the { success, data, poolState, pagination } envelope. Node
// runtime, no edge caching.
//
// The read and the shaping live in lib/maple/proxy-reads.ts, which the position
// page's loader calls too.

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
    return respondWith(await readMaplePositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching maple positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
