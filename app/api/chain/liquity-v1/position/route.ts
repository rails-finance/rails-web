import { NextRequest, NextResponse } from "next/server";
import { loadLiquityV1PositionFromChain } from "@/lib/sources/chain/liquity-v1-position";

// Chain arm of the Liquity V1 Trove read — the exact live-head detail. One
// Trove per address on the fixed singleton contracts, so this needs only
// `?wallet=`. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadLiquityV1PositionFromChain(wallet);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Liquity V1 position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
