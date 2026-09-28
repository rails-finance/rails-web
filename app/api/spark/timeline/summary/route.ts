import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readSparkOpeningBalance } from "@/lib/spark/proxy-reads";

// The opening balance for a SparkLend position — everything BELOW the block
// that `/api/spark/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's vocabulary — raw lowercase token addresses
// — because it has no symbol resolver and should not grow one. The page filters
// by DISPLAY SYMBOL. So the keys are resolved here, through `resolveErc20Meta`
// — the same call, the same process-lifetime cache and the same
// truncated-address + 18-decimal fallback that `buildSparkTimeline` puts the
// rows through in the twin route. Resolving them any other way would let one
// reserve resolve on one side of the cut and degrade on the other, splitting a
// bucket in two with nothing downstream able to tell that from a real second
// asset.
//
// SparkLend is a single mainnet Pool, so unlike the Aave V3 twin there is no
// market parameter: the wallet alone names the position, exactly as /timeline
// reads it.
//
// Node runtime, no edge caching — same as its /timeline twin.
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
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    return respondWith(
      await readSparkOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching spark timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
