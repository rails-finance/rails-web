import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for an Aave V3 position — everything BELOW the block that
// `/api/aave-v3/timeline?recent=N` opened its window at. The model, the
// exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists rather than the page calling rails-server directly for the
// usual reason (the bearer token is server-only) and for one more: rails-server
// keys its histograms in the INDEX's vocabulary — raw lowercase token addresses
// — because it has no symbol resolver and should not grow one. The page filters
// by DISPLAY SYMBOL. So the keys are resolved here, through `resolveV3Tokens` —
// the same call, the same process-lifetime cache and the same
// truncated-address fallback that `buildAaveV3Timeline` puts the rows through
// in the twin route. Resolving them any other way would let one asset resolve
// on one side of the cut and degrade on the other, splitting a bucket in two
// with nothing downstream able to tell that from a real second asset.
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
  const market = request.nextUrl.searchParams.get("market");

  try {
    // `swaps=1` as on /timeline: a paired swap is one event below the cut too.
    const qs = new URLSearchParams({ wallet, cutoffBlock, swaps: "1" });
    if (market) qs.set("market", market);
    const url = `${RAILS_API_URL}/api/aave-v3/timeline/summary?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;

    // Every address the summary names, on either axis, resolved in one batch.
    const addresses = [...(upstream.byAsset ?? []).map((b) => b.key), ...(upstream.flows ?? []).map((f) => f.key)];
    const meta = await resolveV3Tokens(addresses);
    const opening = resolveOpeningAssetKeys(
      upstream,
      (addr) => meta.get(addr.toLowerCase())?.symbol,
      (addr) => meta.get(addr.toLowerCase())?.decimals,
    );

    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching aave-v3 timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
