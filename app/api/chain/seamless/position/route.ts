import { NextRequest, NextResponse } from "next/server";
import { loadAaveV3PositionFromChain } from "@/lib/sources/chain/aave-v3-position";
import { SEAMLESS_CHAIN_ID, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

// A wallet's whole Seamless position on Base. One pooled account per wallet —
// Seamless runs a single Pool, so like the Aave V3 Base route there is no
// `market` parameter to take: there is nothing to choose between.
//
// Same reader as the Aave V3 routes, pointed at the fork. Everything it returns
// is the Pool's own statement of the account: the aggregate figures come from
// the Pool's account view, the per-reserve balances from the reserves' own
// aTokens and debt tokens, and the USD totals are priced by the oracle the Pool
// itself liquidates with.
//
// The Pool being frozen changes none of this. A frozen market still accrues
// interest and still liquidates, so an account here is a live position that can
// only be repaid, withdrawn or liquidated — never added to.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    // Seamless forked Aave V3 before liquid eModes, so a reserve names its
    // category in its own config word and a wallet in that category is judged on
    // the CATEGORY's threshold rather than the reserve's — 93% where WETH's own
    // says 83%. The reader asks the Pool which eMode generation it speaks, so
    // that difference needs no flag here.
    const data = await loadAaveV3PositionFromChain(wallet, SEAMLESS_POOL, undefined, SEAMLESS_CHAIN_ID);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Seamless position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
