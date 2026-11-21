import { NextRequest, NextResponse } from "next/server";
import { loadSpDepositFromChain } from "@/lib/sources/chain/liquity-v2-sp";
import { EBISU_SP, spPool } from "@/lib/liquity-v2/sp-deployment";
import { normalizeDepositor } from "@/lib/liquity-v2/sp-routes";

// Chain arm of an Ebisu stability-pool deposit: the branch pool's getters for
// one (collateralType, depositor) at head, with the branch PriceFeed, on the
// deployment's chain. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pool = spPool(EBISU_SP, request.nextUrl.searchParams.get("collateralType"));
  const depositor = normalizeDepositor(request.nextUrl.searchParams.get("wallet"));
  if (!pool || !depositor) {
    return NextResponse.json(
      { error: "collateralType (one of Ebisu's branches) and wallet (an address) are required" },
      { status: 400 },
    );
  }
  return NextResponse.json(await loadSpDepositFromChain(EBISU_SP, pool, depositor));
}
