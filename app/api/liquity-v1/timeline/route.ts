import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readLiquityV1Timeline } from "@/lib/liquity-v1/proxy-reads";

// api arm of a Liquity V1 Trove's timeline — the LIVE rails-server index.
// rails-server returns the raw merged mv_liquity_v1_events rows (both TroveUpdated
// emitters, absolute before/after ETH + LUSD); we run the chain-state presentation
// transform (buildLiquityV1Timeline: scale + signed deltas) → BaseActivityEvent[].
// No USD / no collateral ratio — chain-direct values only. Node runtime.
//
// The read and the shaping live in lib/liquity-v1/proxy-reads.ts, which the
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
    return respondWith(await readLiquityV1Timeline(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)));
  } catch (error) {
    console.error("Error fetching liquity-v1 timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
