import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readAaveV3Timeline } from "@/lib/aave-v3/proxy-reads";

// Proxies the Aave V3 timeline from the live rails-server index. rails-server
// returns the raw reduced mv_aave_v3_events rows; we run the presentation
// transform (buildAaveV3Timeline: ERC20 symbol/decimals + pooled basket) to
// shape the cards. Per-event USD rides the same rows: buildAaveV3Timeline maps
// each row's price_usd (mig 092, the market's own IAaveOracle read at the
// event's block) via priceOf() — NULL until the price walk reaches that block,
// in which case the client stays token-only. Node runtime, no edge caching.
//
// ── `?group=1`: THE SAME HISTORY AS ROWS
//
// The SparkLend twin of this branch, and for the same reason the two share
// their folder descriptors upstream: SparkLend is an Aave V3 fork and the two
// explorers collapse the same history the same way. Decision 0019's evening
// amendment moves the cut from EVENTS to ROWS — repetitive stretches arrive as
// FOLDERS carrying their members' aggregate, `/timeline/folder` opens one.
// Opt-in on both hops, so the flat answer keeps answering byte for byte while
// the server is deployed ahead of the web. The events travel flat and the rows
// travel as a plan (`TimelineRowPlanEntry`, lib/shared/timeline-folder.ts):
// `toTimelineWire`'s diet works over one flat array.
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
    return respondWith(await readAaveV3Timeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching aave-v3 timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
