import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFrankencoinPositions } from "@/lib/frankencoin/proxy-reads";

// api arm of the Frankencoin position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over the reduced
// per-position state at the POSITION grain (the Position contract address is
// the key; `owner` filters by the replayed, transfer-honored owner) and
// returns the page slice as raw rows ({ rows, total, limit, offset } — the
// compound-v2/dolomite route pair's envelope); presentation (scaling by the
// row's own per-token decimals, the two-axis status) happens in
// buildFrankencoinPositionRows. Native units only — no USD is added here or
// anywhere downstream. Returns the { success, data, pagination } envelope.
// Node runtime, no edge caching.
//
// The read and the shaping live in lib/frankencoin/proxy-reads.ts, which the
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
    return respondWith(
      await readFrankencoinPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching frankencoin positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
