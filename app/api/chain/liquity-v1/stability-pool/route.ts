import { NextRequest, NextResponse } from "next/server";
import { loadLiquityV1DepositFromChain } from "@/lib/sources/chain/liquity-v1-sp";
import { normalizeDepositor } from "@/lib/liquity-v1/sp-routes";

// Chain arm of a Liquity V1 stability-pool deposit: the pool's getters for one
// depositor at head, with the PriceFeed. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const depositor = normalizeDepositor(request.nextUrl.searchParams.get("wallet"));
  if (!depositor) {
    return NextResponse.json({ error: "wallet (an address) is required" }, { status: 400 });
  }
  return NextResponse.json(await loadLiquityV1DepositFromChain(depositor));
}
