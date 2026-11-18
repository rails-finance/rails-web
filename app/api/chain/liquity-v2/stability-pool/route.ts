import { NextRequest, NextResponse } from "next/server";
import { loadLiquityV2DepositFromChain } from "@/lib/sources/chain/liquity-v2-sp";
import { normalizeDepositor, normalizeSpBranch } from "@/lib/liquity-v2/sp-routes";

// Chain arm of a Liquity V2 stability-pool deposit: the branch pool's getters
// for one (collateralType, depositor) at head, with the branch PriceFeed.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branch = normalizeSpBranch(request.nextUrl.searchParams.get("collateralType"));
  const depositor = normalizeDepositor(request.nextUrl.searchParams.get("wallet"));
  if (!branch || !depositor) {
    return NextResponse.json(
      { error: "collateralType (WETH|wstETH|rETH) and wallet (an address) are required" },
      { status: 400 },
    );
  }
  return NextResponse.json(await loadLiquityV2DepositFromChain(branch, depositor));
}
