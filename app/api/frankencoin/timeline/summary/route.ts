import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFrankencoinOpeningBalance } from "@/lib/frankencoin/proxy-reads";

// The opening balance for a Frankencoin position — everything BELOW the block
// that `/api/frankencoin/timeline?recent=N` opened its window at. The model,
// the exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only),
// and it has no symbols to resolve: a Frankencoin position is one collateral
// token against ZCHF for its whole life, so the summary carries no asset axis
// and its flow buckets are the position's own `collateral` / `debt` legs with
// their decimals already stated by the backend (the roster's load-bearing
// collateral_decimals column — four observed collaterals are 0dp). The shared
// resolver still runs so the response shape is canonical, and it renames
// nothing.
//
// Node runtime, no edge caching — same as its /timeline twin.
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
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(
      await readFrankencoinOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching frankencoin timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
