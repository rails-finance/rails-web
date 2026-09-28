import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readLlamalendPositions } from "@/lib/llamalend/proxy-reads";

// api arm of the LlamaLend position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_llamalend_positions at the (controller, user) grain and returns the page
// slice as raw per-position rows (the last emitted UserState absolutes +
// lifecycle scalars); we layer market identity (the factories' own roster)
// and the per-position soft-liq overlay (ONE multicall of user_state over the
// page's open rows — the converted amount lives in NO event, so only that
// read can carry it) in buildLlamalendPositionRows. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.
//
// The read and the shaping live in lib/llamalend/proxy-reads.ts, which the
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
      await readLlamalendPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching llamalend positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
