import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for a LlamaLend position — everything BELOW the block
// that `/api/llamalend/timeline?recent=N` opened its window at. The model,
// the exclusive cut and the cost are in lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only),
// and it has no symbols to resolve: a LlamaLend market is one fixed asset
// pair for the position's whole life, so the summary carries no asset axis,
// and its one flow bucket is keyed by the CONTROLLER — the page already knows
// the pair behind it. The bucket's `decimals` is null by design (its legs
// carry two tokens), so the page's own merge scales each leg with the
// decimals the view carries. The shared resolver still runs so the response
// shape is canonical, and it renames nothing.
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

  const controller = normalizeAddressParam(request.nextUrl.searchParams.get("controller") ?? "");
  const user = normalizeAddressParam(request.nextUrl.searchParams.get("user") ?? "");
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!controller || !user) {
    return NextResponse.json({ error: "controller and user are required" }, { status: 400 });
  }
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const qs = new URLSearchParams({ controller, user, cutoffBlock });
    const url = `${RAILS_API_URL}/api/llamalend/timeline/summary?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;
    const opening = resolveOpeningAssetKeys(upstream, () => undefined);
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching llamalend timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
