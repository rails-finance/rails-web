import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readLlamalendTimeline } from "@/lib/llamalend/proxy-reads";

// api arm of a LlamaLend position's timeline — the LIVE rails-server index.
// The grain is (controller, user): both params required, the controller being
// the isolated market's key (each controller liquidates independently).
// rails-server pages the raw mv_llamalend_events rows (leg-discriminated —
// the Liquidate-paired Repay is deduped there) by KEYSET CURSOR:
// { controller, user, rows, totalEvents, limit, nextCursor, hasMore }. The
// cursor is an opaque token from the response — passed back verbatim, never
// constructed. This proxy walks the cursor server-side, assembles the whole
// history, and runs the presentation transform (buildLlamalendTimeline) →
// BaseActivityEvent[]. Market identity is resolved from the factories' own
// roster at head (nothing hardcodes 59 markets). Node runtime.
//
// The read and the shaping live in lib/llamalend/proxy-reads.ts, which the
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
    return respondWith(await readLlamalendTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching llamalend timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
