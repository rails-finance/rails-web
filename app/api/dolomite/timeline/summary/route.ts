import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readDolomiteOpeningBalance } from "@/lib/dolomite/proxy-reads";

// The opening balance for a Dolomite account — everything BELOW the block that
// `/api/dolomite/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only) and
// for one more: rails-server keys the summary's byAsset axis and flow buckets
// by NUMERIC MARKET ID — Dolomite's own key, kept because the symbol space on
// this roster collides (rUSD / srUSD / wsrUSD…). The page's asset axis filters
// by display symbol, so the byAsset keys are resolved here through the SAME
// core-roster read the /timeline twin resolves its rows with
// (resolveDolomiteMarketState), collisions merging exactly as the page's own
// symbol-keyed axis always has. The FLOW buckets stay keyed by market id — the
// reducer's own grain — with their decimals filled from the same roster.
//
// Node runtime, no edge caching — same as its /timeline twin.
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
    return respondWith(
      await readDolomiteOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching dolomite timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
