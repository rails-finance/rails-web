import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readPwnPositions } from "@/lib/pwn/proxy-reads";

// api arm of the PWN position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_pwn_positions and
// returns the page slice as raw per-loan rows (parties + token addresses + fixed
// loan economics + status); we resolve symbols + scale amounts (buildPwnPositionRows).
// A PWN position is a discrete loan (one row per loan_id). Chain-state tier — no
// HF/USD overlay. Returns the { success, data, pagination } envelope. Node runtime.
//
// The read and the shaping live in lib/pwn/proxy-reads.ts, which the position
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
    return respondWith(await readPwnPositions(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching pwn positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
