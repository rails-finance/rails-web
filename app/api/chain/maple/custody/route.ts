import { NextResponse, type NextRequest } from "next/server";
import { resolveMapleCustodyHoldings } from "@/lib/sources/chain/maple-custody";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";

// Chain arm of the Maple escrow custody view — what a known-infrastructure
// address (the CCIP bridge escrows) holds in each syrup pool, read at one head
// block. Deliberately NOT a generic balance API: addresses outside the
// known-infrastructure registry get a 404, never a read. Node runtime, no
// edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.toLowerCase() ?? "";
  if (!getCcipEscrow(address)) {
    return NextResponse.json({ error: "Not a known infrastructure address" }, { status: 404 });
  }
  try {
    const holdings = await resolveMapleCustodyHoldings(address);
    return NextResponse.json({ holdings });
  } catch (error) {
    console.error("Error loading Maple custody state from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load custody state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
