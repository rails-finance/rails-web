import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readSparkPositions } from "@/lib/spark/proxy-reads";

// api arm of the SparkLend position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_spark_positions
// and returns the page slice as raw per-wallet rows (token addresses + replayed
// balances + scalars); we resolve symbols + split each wallet's supplies/borrows
// (buildSparkPositionRows). Chain-state tier — no HF/USD overlay. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.
//
// The read and the shaping live in lib/spark/proxy-reads.ts, which the position
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
    return respondWith(
      await readSparkPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp), request.signal),
    );
  } catch (error) {
    console.error("Error fetching spark positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
