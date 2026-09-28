import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readCompoundV2OpeningBalance } from "@/lib/compound-v2/proxy-reads";

// The opening balance for a Compound V2 account — everything BELOW the block
// that `/api/compound-v2/timeline?recent=N` opened its window at. The model,
// the exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only) and
// for one more: rails-server keys the summary's byAsset axis and flow buckets
// by its own MARKET KEYS ('dai', 'wbtc2', …). The page filters by DISPLAY
// SYMBOL and its reducers read per-market decimals — both resolved here from
// the SAME fixed catalog buildCompoundV2Timeline puts the rows through
// (COMPOUND_V2_MARKET_BY_KEY: the closed 2019-2021 roster, SAI's and WBTC2's
// label collisions already settled). The two WBTC markets share one display
// symbol and the resolver merges their byAsset buckets — exactly as the page's
// own symbol-keyed axis always has; the flow buckets stay keyed by market, the
// reducer's own grain.
//
// The read and the resolution live in lib/compound-v2/proxy-reads.ts, which
// the position page's loader calls too. Node runtime, no edge caching — same
// as its /timeline twin.

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
    const answer = await readCompoundV2OpeningBalance(
      request.nextUrl.searchParams,
      routeBoxHop(RAILS_API_URL, readerIp),
    );
    return respondWith(answer);
  } catch (error) {
    console.error("Error fetching compound-v2 timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
