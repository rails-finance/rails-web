import { NextRequest, NextResponse } from "next/server";
import { loadSpDepositFromChain } from "@/lib/sources/chain/liquity-v2-sp";
import { ASYMMETRY_SP, spPool } from "@/lib/liquity-v2/sp-deployment";
import { normalizeDepositor } from "@/lib/liquity-v2/sp-routes";

// Chain arm of a Asymmetry stability-pool deposit: the branch pool's getters for
// one (collateralType, depositor) at head, with the branch PriceFeed, on the
// deployment's chain. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pool = spPool(ASYMMETRY_SP, request.nextUrl.searchParams.get("collateralType"));
  const depositor = normalizeDepositor(request.nextUrl.searchParams.get("wallet"));
  if (!pool || !depositor) {
    return NextResponse.json(
      { error: "collateralType (a Asymmetry branch) and wallet (an address) are required" },
      { status: 400 },
    );
  }
  return NextResponse.json(await loadSpDepositFromChain(ASYMMETRY_SP, pool, depositor));
}
