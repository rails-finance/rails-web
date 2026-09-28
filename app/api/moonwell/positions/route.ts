import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMoonwellPositions } from "@/lib/moonwell/proxy-reads";

// api arm of the Moonwell position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_moonwell_wallets
// and returns the page slice as raw per-wallet rows (market keys + the three
// replayed lanes + scalars); we shape them against the fixed market catalog and
// layer the per-market chain state (exchange rate → current supply value; the
// protocol's own oracle → USD) in buildMoonwellPositionRows. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.
//
// The read and the shaping live in lib/moonwell/proxy-reads.ts, which the
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
    return respondWith(await readMoonwellPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching moonwell positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
