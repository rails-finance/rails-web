import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { isKnownAaveV4Spoke, loadAaveV4HealthFactorAround } from "@/lib/sources/chain/aave-v4-health-factor";

// An Aave V4 position's health factor at the end of block N−1 and of block N,
// read from the spoke's getUserAccountData — the liquidation card's before →
// after figure. `?spoke=` is the spoke contract (one this explorer knows),
// `?wallet=`, `?block=`, and optionally `?asset=` (a reserve symbol) to read
// whether that reserve counted as collateral either side of the block and its
// premium debt there. The position's risk premium rides each end. A past block
// never changes, so the answer is cached.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const spoke = sp.get("spoke") ?? "";
  const wallet = sp.get("wallet") ?? "";
  const block = Number(sp.get("block"));
  // Optional: a reserve's symbol, to also read whether it counted as collateral.
  const asset = sp.get("asset") ?? undefined;
  if (!isAddress(spoke) || !isKnownAaveV4Spoke(spoke) || !isAddress(wallet) || !Number.isInteger(block) || block < 1) {
    return NextResponse.json({ error: "a known spoke, a wallet and a block are required" }, { status: 400 });
  }
  try {
    const data = await loadAaveV4HealthFactorAround(spoke, wallet, block, asset);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=31536000, immutable" } });
  } catch (error) {
    console.error("Error reading Aave V4 health factor at block:", error);
    const message = error instanceof Error ? error.message : "Failed to read the health factor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
