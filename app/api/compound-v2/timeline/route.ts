import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readCompoundV2Timeline } from "@/lib/compound-v2/proxy-reads";

// api arm of a Compound V2 wallet's timeline — the LIVE rails-server index.
// rails-server pages the raw replayed mv_compound_v2_events rows by KEYSET
// CURSOR (six years of history; the roster's deepest borrowers run long):
// { wallet, rows, totalEvents, limit, nextCursor, hasMore }. The cursor is an
// opaque token from the response — passed back verbatim, never constructed.
// This proxy walks the cursor server-side, assembles the whole history, and
// runs the presentation transform (buildCompoundV2Timeline: fixed-catalog
// symbols + signs) → BaseActivityEvent[]. No USD / no HF — chain-direct
// values only. Node runtime.
//
// `?group=1` is the same history as ROWS (decision 0019's evening amendment):
// one upstream read, no cursor walk, the bounds the route's own. The events
// travel flat and the rows as a plan, as on the SparkLend route, which carries
// the argument in full. `?from=`/`?to=` names a span of time in place of the
// newest window, grouped or flat, and is passed straight through. The read and
// the shaping live in lib/compound-v2/proxy-reads.ts, which the position page's
// loader calls too.

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
    const answer = await readCompoundV2Timeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp));
    return respondWith(answer);
  } catch (error) {
    console.error("Error fetching compound-v2 timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
