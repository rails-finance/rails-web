import { NextRequest, NextResponse } from "next/server";
import { loadAaveV4SpokePositionFromChain } from "@/lib/sources/chain/aave-v4-position";

// Chain arm of the Aave V4 spoke-position read. Same bare
// AaveV4SpokePositionChainResponse shape fetchAaveV4SpokePosition expects from
// the rails-server proxy — but every figure is a live spoke-contract eth_call
// (Alchemy) instead of an indexed read. Node runtime, no edge caching.
//
// Pinned to the dump's freeze block T by default so this overlay reconciles with
// the frozen DB / getLogs lanes (the verification toggle reads one instant).
// Pass ?toBlock=latest to read the live tip.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  const spoke = sp.get("spoke");
  if (!wallet || !spoke) {
    return NextResponse.json({ error: "wallet and spoke are required" }, { status: 400 });
  }

  try {
    // Pin to T unless explicitly asked to read the live tip.
    const atBlock = undefined; // de-T: read the live chain head
    const data = await loadAaveV4SpokePositionFromChain(wallet, spoke, atBlock);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Aave V4 spoke position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain spoke position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
