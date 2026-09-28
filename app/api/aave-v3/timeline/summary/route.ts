import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readAaveV3OpeningBalance } from "@/lib/aave-v3/proxy-reads";

// The opening balance for an Aave V3 position — everything BELOW the block that
// `/api/aave-v3/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's vocabulary — raw lowercase token addresses
// — because it has no symbol resolver and should not grow one. The page filters
// by DISPLAY SYMBOL. So the keys are resolved here, through `resolveV3Tokens` —
// the same call, the same process-lifetime cache and the same
// truncated-address fallback that `buildAaveV3Timeline` puts the rows through
// in the twin route. Resolving them any other way would let one asset resolve
// on one side of the cut and degrade on the other, splitting a bucket in two
// with nothing downstream able to tell that from a real second asset.
//
// Node runtime, no edge caching — same as its /timeline twin.
//
// The read and the shaping live in lib/aave-v3/proxy-reads.ts, which the
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
      await readAaveV3OpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching aave-v3 timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
