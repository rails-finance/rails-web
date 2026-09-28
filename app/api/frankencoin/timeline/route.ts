import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readFrankencoinTimeline } from "@/lib/frankencoin/proxy-reads";

// api arm of a Frankencoin position's timeline — the LIVE rails-server index.
// The grain is the POSITION contract address (required). rails-server pages
// the raw event rows (PositionOpened, the MintingUpdate ledger with lag
// columns, PositionDenied, OwnershipTransferred, the challenge slices —
// leg-keyed, several ChallengeSucceeded slices per multi-bid auction — and
// ForcedSale) by KEYSET CURSOR: { position, rows, totalEvents, limit,
// nextCursor, hasMore }. The cursor is an opaque token from the response —
// passed back verbatim, never constructed. This proxy walks the cursor
// server-side, assembles the whole history, and runs the presentation
// transform (buildFrankencoinTimeline) → BaseActivityEvent[]. Native units
// only — chain-emitted values, no USD. Node runtime.
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
      await readFrankencoinTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching frankencoin timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
