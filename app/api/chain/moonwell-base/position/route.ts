import { NextRequest, NextResponse } from "next/server";
import { loadMoonwellPositionFromChain } from "@/lib/sources/chain/moonwell-position";
import { MOONWELL_BASE_DEPLOYMENT } from "@/lib/moonwell-base/asset-catalog";

// Chain arm of the Moonwell Base position read — one ACCOUNT, whole, at the
// head. Moonwell cross-collateralises every market through one Comptroller, so
// a single `?wallet=` fetch covers the position across all twenty-one (no
// per-market param — the reader asks them all and returns the nonzero ones).
//
// The same reader serves Ethereum at /api/chain/moonwell/position. The only
// difference is the deployment passed to it, and it is passed here rather than
// sniffed from the request so a misrouted read cannot quietly answer about the
// wrong chain's contracts.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const data = await loadMoonwellPositionFromChain(wallet, MOONWELL_BASE_DEPLOYMENT);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Moonwell Base position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
