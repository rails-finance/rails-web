import { NextRequest, NextResponse } from "next/server";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";

// A wallet's whole Aave V3 position on Base. One pooled account per wallet —
// Base has a single Pool, so unlike Ethereum there is no `market` parameter to
// take: there is nothing to choose between.
//
// This is the same reader the Ethereum route uses, pointed at Base. Everything
// it returns is the Pool's own statement of the account: the aggregate figures
// come from the Pool's account view, the per-reserve balances from the
// reserves' own aTokens and debt tokens, and the USD totals are priced by the
// oracle the Pool itself liquidates with.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadAaveV3PositionFromChain(wallet, AAVE_V3_BASE_POOL, undefined, AAVE_V3_BASE_CHAIN_ID);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Aave V3 Base position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
