import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { MORPHO_MARKETS } from "@/lib/morpho/market-catalog";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for a Morpho Blue position — everything BELOW the block
// that `/api/morpho/position/:positionId/timeline?recent=N` opened its window
// at. The model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only),
// and it has no symbols to resolve: a Morpho market is one (collateral, loan)
// pair fixed for the position's whole life, so the summary carries no asset
// axis and its flow buckets are the position's own `collateral` / `debt`
// legs. Their DECIMALS are filled here: the index states none (it holds only
// the market params text), so the pair's tokens come off the baked market
// catalog (immutable params, id = keccak of them) and their decimals through
// resolveErc20Meta — the same resolver the /timeline twin scales its rows
// with. A market the census predates leaves decimals null, and the page's
// merge then states no lifetime layer rather than a mis-scaled one.
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

  const positionId = request.nextUrl.searchParams.get("positionId");
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!positionId) return NextResponse.json({ error: "positionId is required" }, { status: 400 });
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const { market } = splitMorphoPositionId(positionId);
    const marketId = market.startsWith("0x") ? market.toLowerCase() : `0x${market.toLowerCase()}`;
    const entry = MORPHO_MARKETS.find((m) => m.id === marketId);

    const qs = new URLSearchParams({ positionId, cutoffBlock });
    const url = `${RAILS_API_URL}/api/morpho/timeline/summary?${qs.toString()}`;
    const [response, meta] = await Promise.all([
      fetch(url, createAuthFetchOptions(undefined, readerIp)),
      entry ? resolveErc20Meta([entry.loanToken, entry.collateralToken]) : Promise.resolve(null),
    ]);
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;
    const decimalsOf = (key: string): number | undefined => {
      if (!entry || !meta) return undefined;
      const token = key === "collateral" ? entry.collateralToken : key === "debt" ? entry.loanToken : null;
      return token ? meta.get(token.toLowerCase())?.decimals : undefined;
    };
    const opening = resolveOpeningAssetKeys(upstream, () => undefined, decimalsOf);
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching morpho timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
