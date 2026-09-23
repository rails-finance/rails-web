import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const qs = new URLSearchParams({ wallet, cutoffBlock });
    const url = `${RAILS_API_URL}/api/moonwell/timeline/summary?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;

    const opening = resolveOpeningAssetKeys(
      upstream,
      (key) => MOONWELL_MARKET_BY_KEY[key]?.symbol,
      (key) => MOONWELL_MARKET_BY_KEY[key]?.decimals,
    );

    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching moonwell timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
