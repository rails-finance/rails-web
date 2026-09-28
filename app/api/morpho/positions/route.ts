import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMorphoPositions } from "@/lib/morpho/proxy-reads";

// Proxies the Morpho position listing from the live rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_morpho_positions and returns the page slice as raw per-(market, borrower)
// rows; we decode params + resolve symbols + assemble the card shape
// (buildMorphoPositionRows) and return a { success, data, pagination }
// envelope. Node runtime, no edge caching.
//
// The read and the shaping live in lib/morpho/proxy-reads.ts, which the
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
    return respondWith(await readMorphoPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching morpho positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
