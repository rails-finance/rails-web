import { NextRequest, NextResponse } from "next/server";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_POOL } from "@/lib/aave-v3-arbitrum/asset-catalog";

// A wallet's whole Aave V3 position on Arbitrum: the reader the Ethereum and
// Base routes use, pointed at the Arbitrum Pool and read through
// ARBITRUM_RPC_URL. One Pool, so no `market` parameter.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadAaveV3PositionFromChain(wallet, AAVE_V3_ARBITRUM_POOL, undefined, AAVE_V3_ARBITRUM_CHAIN_ID);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Aave V3 Arbitrum position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
