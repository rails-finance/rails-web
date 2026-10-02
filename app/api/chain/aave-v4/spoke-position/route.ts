import { NextRequest, NextResponse } from "next/server";
import { loadAaveV4SpokePositionFromChain } from "@/lib/sources/chain/aave-v4-position";

// Chain arm of the Aave V4 spoke-position read. Same bare
// AaveV4SpokePositionChainResponse shape fetchAaveV4SpokePosition expects from
// the rails-server proxy — but every figure is a live spoke-contract eth_call
// (Alchemy) instead of an indexed read. Node runtime, no edge caching.
//
// Reads the live chain head. `?block=N` reads the end of block N instead (a
// closed position's collateral factors while it was open); that answer never
// changes, so it is cached.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  const spoke = sp.get("spoke");
  if (!wallet || !spoke) {
    return NextResponse.json({ error: "wallet and spoke are required" }, { status: 400 });
  }

  const blockParam = sp.get("block");
  const atBlock = blockParam == null ? undefined : Number(blockParam);
  if (atBlock !== undefined && !(Number.isInteger(atBlock) && atBlock > 0)) {
    return NextResponse.json({ error: "block must be a positive integer" }, { status: 400 });
  }

  try {
    const data = await loadAaveV4SpokePositionFromChain(wallet, spoke, atBlock);
    return atBlock === undefined
      ? NextResponse.json(data)
      : NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=31536000, immutable" } });
  } catch (error) {
    console.error("Error loading Aave V4 spoke position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain spoke position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
