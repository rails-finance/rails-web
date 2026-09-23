import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { COMPOUND_MARKETS } from "@/lib/compound/asset-catalog";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for a Comet position — everything BELOW the block that
// `/api/compound/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's vocabulary and resolves nothing. Comet
// keys TWO namespaces in the same response — a base row by its MARKET (the base
// asset IS the market) and a collateral row by the moved token's address — so
// both are renamed here, through the same two resolvers `buildCompoundTimeline`
// puts the rows through in the /timeline twin: the market's fixed base
// symbol/decimals from the catalog, and `resolveErc20Meta` for collateral (the
// same call, the same process-lifetime cache, and the same truncated-address
// string when a token names nothing). Resolving them any other way would let an
// asset resolve on one side of the cut and degrade on the other, splitting a
// bucket in two with nothing downstream able to tell that from a real second
// asset.
//
// ⚠️ `market` is REQUIRED here and checked against the catalog, unlike on the
// /timeline twin where it is optional. rails-server answers an unrecognised
// market with an ALL-markets opening balance, and attaching that to one
// market's rows is a wrong number rather than a partial one. The catalog is
// also the only source for the base leg's decimals, and a market it has never
// seen has none to scale by.
//
// Node runtime, no edge caching — same as its /timeline twin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** The index keys collateral by raw lowercase token address and base by market
 *  slug, in one response. The two namespaces cannot collide, so one test tells
 *  a key which resolver it belongs to. */
const isTokenAddress = (key: string) => /^0x[0-9a-f]{40}$/i.test(key);

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  const market = request.nextUrl.searchParams.get("market")?.toLowerCase();
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });
  if (!market || !COMPOUND_MARKETS[market]) {
    return NextResponse.json({ error: "market is required and must be a known Comet market" }, { status: 400 });
  }

  try {
    const qs = new URLSearchParams({ wallet, cutoffBlock, market });
    const url = `${RAILS_API_URL}/api/compound/timeline/summary?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;

    // Every token address the summary names, on either axis, in one multicall.
    // Market slugs are not addresses and never enter it.
    const keys = [...(upstream.byAsset ?? []).map((b) => b.key), ...(upstream.flows ?? []).map((f) => f.key)];
    const meta = await resolveErc20Meta(keys.filter(isTokenAddress));
    const opening = resolveOpeningAssetKeys(
      upstream,
      (key) => (isTokenAddress(key) ? meta.get(key.toLowerCase())?.symbol : COMPOUND_MARKETS[key]?.baseSymbol),
      // Undefined leaves the bucket's decimals null, which the page reads as
      // unknown and refuses to add — never as zero.
      (key) => (isTokenAddress(key) ? meta.get(key.toLowerCase())?.decimals : COMPOUND_MARKETS[key]?.baseDecimals),
    );

    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching compound timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
