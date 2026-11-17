import { NextRequest, NextResponse } from "next/server";
import { loadPolarisDepositFromChain } from "@/lib/sources/chain/polaris-sp-loans";
import { normalizeCdpId, normalizeMarket } from "@/lib/polaris/asset-catalog";

// Chain arm of a Polaris stability-pool deposit: the pool's getters for one
// (market, token id) at head. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const market = normalizeMarket(request.nextUrl.searchParams.get("market"));
  const id = normalizeCdpId(request.nextUrl.searchParams.get("id"));
  if (!market || !id) {
    return NextResponse.json({ error: "market (usdp|goldp) and id (a deposit number) are required" }, { status: 400 });
  }
  return NextResponse.json(await loadPolarisDepositFromChain(market, id));
}
