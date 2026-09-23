import { NextRequest, NextResponse } from "next/server";
import { loadFrankencoinPositionFromChain } from "@/lib/sources/chain/frankencoin-position";

// Chain arm of the Frankencoin position read — the exact live-head detail for
// one POSITION, keyed exactly as the protocol keys it: the Position contract's
// own address (every borrower owns a minimal-proxy clone; the address IS the
// identity). This overlay is the primary truth rendered on the detail card —
// there is no oracle and no USD anywhere in it. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const position = request.nextUrl.searchParams.get("position");
  if (!position) {
    return NextResponse.json({ error: "position is required" }, { status: 400 });
  }
  try {
    const data = await loadFrankencoinPositionFromChain(position);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Frankencoin position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
