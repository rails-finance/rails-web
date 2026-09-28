import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMorphoOpeningBalance } from "@/lib/morpho/proxy-reads";

// The opening balance for a Morpho Blue position — everything BELOW the block
// that `/api/morpho/position/:positionId/timeline?recent=N` opened its window
// at. The model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only),
// and it has no symbols to resolve: a Morpho market is one (collateral, loan)
// pair fixed for the position's whole life, so the summary carries no asset
// axis and its flow buckets are the position's own `collateral` / `debt`
// legs. Their DECIMALS are filled here: the index states none (it holds only
// the market params text), so the pair's tokens come off the baked market
// catalog (immutable params, id = keccak of them) and their decimals through
// resolveErc20Meta — the same resolver the /timeline twin scales its rows
// with. A market the census predates leaves decimals null, and the page's
// merge then states no lifetime layer rather than a mis-scaled one.
//
// Node runtime, no edge caching — same as its /timeline twin.
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
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(
      await readMorphoOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching morpho timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
