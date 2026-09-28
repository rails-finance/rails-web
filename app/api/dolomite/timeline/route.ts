import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readDolomiteTimeline } from "@/lib/dolomite/proxy-reads";

// api arm of a Dolomite account's timeline — the LIVE rails-server index.
// The grain is Account.Info = (owner, uint256 accountNumber): both params are
// required, and accountNumber passes through as a STRING (uint256 — many are
// hash-derived, past 2^53). rails-server pages the raw mv_dolomite_events rows
// (one row per BalanceUpdate LEG — a LogLiquidate yields four) by KEYSET
// CURSOR: { owner, accountNumber, rows, totalEvents, limit, nextCursor,
// hasMore }. The cursor is an opaque token from the response — passed back
// verbatim, never constructed. This proxy walks the cursor server-side,
// assembles the whole history, and runs the presentation transform
// (buildDolomiteTimeline) → BaseActivityEvent[]. No USD / no live index —
// chain-emitted values only. Node runtime.
//
// The read and the shaping live in lib/dolomite/proxy-reads.ts, which the
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
    return respondWith(await readDolomiteTimeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching dolomite timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
