import { NextRequest, NextResponse } from "next/server";
import { loadDolomitePositionFromChain } from "@/lib/sources/chain/dolomite-position";

// Chain arm of the Dolomite position read — the exact live-head detail for one
// ACCOUNT, keyed exactly as the contract keys it: Account.Info =
// (owner, uint256 accountNumber). Both params are required — an owner alone is
// not a risk unit (accounts are independently liquidated), so there is no
// owner-only read here by design. accountNumber travels as a string (uint256;
// many are hash-derived and past 2^53). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  const accountNumber = request.nextUrl.searchParams.get("accountNumber");
  if (!owner || !accountNumber) {
    return NextResponse.json({ error: "owner and accountNumber are required" }, { status: 400 });
  }
  try {
    const data = await loadDolomitePositionFromChain(owner, accountNumber);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Dolomite position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
