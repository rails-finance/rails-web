import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMorphoTimeline } from "@/lib/morpho/proxy-reads";

// Proxies a single Morpho position's timeline from the live rails-server index.
// rails returns the per-event signed deltas with each row's running balances,
// plus the market params; buildMorphoTimeline shapes the BaseActivityEvent[].
// `positionId` = `${marketIdHex}-${owner}`.
//
// `?group=1` is the same history as ROWS (decision 0019's evening amendment):
// the events travel flat and the rows as a plan, as on the SparkLend route,
// which carries the argument in full. `?from=`/`?to=` names a span of time in
// place of the newest window, grouped or flat, and is passed straight through.
//
// The read and the shaping live in lib/morpho/proxy-reads.ts, which the
// position page's loader calls too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, context: { params: Promise<{ positionId: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { positionId } = await context.params;

  try {
    return respondWith(
      await readMorphoTimeline(positionId, request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching morpho position timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
