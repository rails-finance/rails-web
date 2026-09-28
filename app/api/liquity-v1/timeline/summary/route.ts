import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readLiquityV1OpeningBalance } from "@/lib/liquity-v1/proxy-reads";

// The opening balance for a Liquity V1 wallet's Trove history — everything
// BELOW the block that `/api/liquity-v1/timeline?recent=N` opened its window at.
// The model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly because
// the bearer token is server-only. Its ONE other job elsewhere — resolving the
// summary's asset keys through the same resolver the /timeline twin runs its
// rows through — HAS NOTHING TO DO HERE, and that is a fact about Liquity V1
// rather than an omission: a Trove is ETH against LUSD for its whole life, so
// rails-server returns `byAsset: null` (declared in `omitted`) and keys its flow
// buckets `collateral` / `debt` — the page's own vocabulary, `keyKind:
// "position"`, which `resolveOpeningAssetKeys` passes through untouched. Both
// legs are 18dp by construction and the backend states so, so there are no
// decimals to look up either. The call is still made, so that a future key kind
// cannot slip through unrenamed.
//
// Node runtime, no edge caching — same as its /timeline twin.
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
    return respondWith(
      await readLiquityV1OpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching liquity-v1 timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
