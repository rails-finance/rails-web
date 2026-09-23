import { NextRequest, NextResponse } from "next/server";
import { loadPolarisPositionFromChain } from "@/lib/sources/chain/polaris-position";
import { normalizeCdpId, normalizeMarket } from "@/lib/polaris/asset-catalog";

// Chain arm of the Polaris position read — one CDP's live-head detail, keyed
// exactly as the protocol keys it: (market, cdpId). The overlay is the primary
// truth on the detail card; USD comes from the protocol's own price feed at
// head, never a price API. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const market = normalizeMarket(request.nextUrl.searchParams.get("market"));
  const id = normalizeCdpId(request.nextUrl.searchParams.get("id"));
  if (!market || !id) {
    return NextResponse.json({ error: "market (usdp|goldp) and id (a CDP number) are required" }, { status: 400 });
  }
  try {
    const data = await loadPolarisPositionFromChain(market, id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Polaris CDP from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
