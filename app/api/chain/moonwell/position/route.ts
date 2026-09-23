import { NextRequest, NextResponse } from "next/server";
import { loadMoonwellPositionFromChain } from "@/lib/sources/chain/moonwell-position";

// Chain arm of the Moonwell position read — the exact live-head detail for one
// ACCOUNT. Moonwell cross-collateralises its four fixed markets through one
// Comptroller, so a single `?wallet=` fetch covers the whole position (no
// per-market param — the loader reads all four and returns the nonzero ones).
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadMoonwellPositionFromChain(wallet);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Moonwell position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
