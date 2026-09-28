import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readSparkTimeline } from "@/lib/spark/proxy-reads";

// api arm of a SparkLend wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw replayed spark_events_served rows; we run the chain-
// truth presentation transform (buildSparkTimeline: ERC20 symbol/decimals + signs)
// → BaseActivityEvent[]. Per-event USD rides the same rows: buildSparkTimeline
// maps each row's price_usd (mig 092, SparkLend's own IAaveOracle read at the
// event's block) via priceOf() — NULL until the price walk reaches that block,
// in which case the client stays token-only. No HF — that stays chain-direct.
// Node runtime.
//
// ── `?group=1`: THE SAME HISTORY AS ROWS
//
// Decision 0019's evening amendment moves the timeline's cut from EVENTS to
// ROWS: repetitive stretches arrive as FOLDERS carrying their members'
// aggregate, ungrouped events arrive as themselves, and `/timeline/folder`
// opens one folder's members. The grouping is rails-server's
// (`services/timeline-folders.ts`) and every reason behind it lives there and
// in decision 0019; this route's job under `group` is the same one it does for
// the flat answer — resolve what the index deliberately does not, and nothing
// else.
//
// It is OPT-IN on both hops. Without `group` the upstream call, the transform
// and this response are byte for byte what they were, which is what lets the
// server deploy before the web.
//
// THE EVENTS TRAVEL FLAT AND THE ROWS TRAVEL AS A PLAN — see
// `TimelineRowPlanEntry` in lib/shared/timeline-folder.ts. `toTimelineWire`'s
// diet is what keeps a deep history affordable and it works over one flat
// array, so nesting the transformed events inside the rows would have cost the
// diet and bought nothing.
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
    return respondWith(await readSparkTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching spark timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
