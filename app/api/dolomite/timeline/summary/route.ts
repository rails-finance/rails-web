import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveDolomiteMarketState } from "@/lib/sources/chain/dolomite-markets";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const owner = request.nextUrl.searchParams.get("owner");
  const accountNumber = request.nextUrl.searchParams.get("accountNumber");
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!owner || !accountNumber) {
    return NextResponse.json({ error: "owner and accountNumber are required" }, { status: 400 });
  }
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const qs = new URLSearchParams({ owner, accountNumber, cutoffBlock });
    const url = `${RAILS_API_URL}/api/dolomite/timeline/summary?${qs.toString()}`;
    const [response, marketState] = await Promise.all([
      fetch(url, createAuthFetchOptions(undefined, readerIp)),
      resolveDolomiteMarketState(),
    ]);
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance;
    const { state } = marketState;
    const marketOf = (key: string) => (/^\d+$/.test(key) ? state.get(Number(key)) : undefined);
    const opening = resolveOpeningAssetKeys(
      upstream,
      (key) => marketOf(key)?.symbol,
      (key) => marketOf(key)?.decimals,
    );
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching dolomite timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
