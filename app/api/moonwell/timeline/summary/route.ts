import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMoonwellOpeningBalance } from "@/lib/moonwell/proxy-reads";

// The opening balance for a Moonwell position — everything BELOW the block
// that `/api/moonwell/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's own vocabulary — the raw `market` tag
// ('weth' | 'usdc' | 'usdt' | 'cbbtc'), not a display symbol — because it has
// no resolver and should not grow one. Unlike Aave V3's reserve axis, Moonwell
// has no per-request ERC20 lookup to run: the four markets are a FIXED
// catalog (lib/moonwell/asset-catalog.ts), the same one `buildMoonwellTimeline`
// resolves each row's market key through in the /timeline twin. So this route
// resolves both `byAsset[].key` and a flow bucket's decimals through that same
// catalog rather than an async call — a market key that resolved on one side
// of the cut and degraded to a raw key on the other would silently split a
// bucket in two, and nothing downstream could tell that from a real second
// asset. (`flows[].key` itself needs no renaming: rails-server declares it
// `keyKind: "marketKey"`, already the key `MarketFlows` is keyed on.)
//
// Node runtime, no edge caching — same as its /timeline twin.
//
// The read and the shaping live in lib/moonwell/proxy-reads.ts, which the
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
      await readMoonwellOpeningBalance(request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching moonwell timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
