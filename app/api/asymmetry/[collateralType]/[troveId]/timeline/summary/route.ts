import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for an Asymmetry Trove — everything BELOW the block that
// `/api/asymmetry/:collateralType/:troveId/timeline?recent=N` opened its window
// at. The model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only),
// and unlike the wallet-keyed twins it has no symbols to resolve: a Trove is
// one branch collateral against USDaf for its whole life, so the summary
// carries no asset axis and its flow buckets are the position's own
// `collateral` / `debt` legs with their decimals already stated by the
// backend (the branch's own — the BTC branches are 8). The shared resolver
// still runs so the response shape is canonical, and it renames nothing.
//
// Node runtime, no edge caching — same as its /timeline twin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collateralType: string; troveId: string }> },
) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { collateralType, troveId } = await params;
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const url = `${RAILS_API_URL}/api/asymmetry/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary?cutoffBlock=${encodeURIComponent(cutoffBlock)}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;
    const opening = resolveOpeningAssetKeys(upstream, () => undefined);
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching asymmetry timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
