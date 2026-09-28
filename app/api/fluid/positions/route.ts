import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFluidPositions } from "@/lib/fluid/proxy-reads";

// api arm of the Fluid positions listing — one row per position NFT from
// mv_fluid_positions, each carrying the fluid_position_chain settled overlay
// when present (the worker's resolver sweep: liquidations + accrued interest
// applied by the protocol's own math). Filters pass through verbatim.
//
// The read and the shaping live in lib/fluid/proxy-reads.ts, which the position
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
    return respondWith(await readFluidPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching fluid positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
