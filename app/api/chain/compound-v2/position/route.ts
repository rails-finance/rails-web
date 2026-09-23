import { NextRequest, NextResponse } from "next/server";
import { loadCompoundV2PositionFromChain } from "@/lib/sources/chain/compound-v2-position";

// Chain arm of the Compound V2 position read — the exact live-head detail for
// one ACCOUNT. Compound V2 cross-collateralises its twenty listed markets
// through one Comptroller, so a single `?wallet=` fetch covers the whole
// position (no per-market param — the loader reads all twenty and returns the
// nonzero ones). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadCompoundV2PositionFromChain(wallet);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Compound V2 position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
