import { NextRequest, NextResponse } from "next/server";
import { loadLiquityV1StakeFromChain } from "@/lib/sources/chain/liquity-v1-staking";
import { normalizeStaker } from "@/lib/liquity-v1/staking-routes";

// Chain arm of a Liquity V1 LQTY stake: LQTYStaking's getters for one staker
// at head, with the PriceFeed. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staker = normalizeStaker(request.nextUrl.searchParams.get("wallet"));
  if (!staker) {
    return NextResponse.json({ error: "wallet (an address) is required" }, { status: 400 });
  }
  return NextResponse.json(await loadLiquityV1StakeFromChain(staker));
}
