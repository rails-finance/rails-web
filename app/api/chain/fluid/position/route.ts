import { NextRequest, NextResponse } from "next/server";
import { loadFluidPositionFromChain } from "@/lib/sources/chain/fluid-position";

// Chain arm of the Fluid position read — the live settled detail for one
// position NFT. A Fluid position lives in exactly one vault, and the
// VaultResolver resolves the vault from the NFT id itself, so `?nft=` is the
// whole address. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nft = request.nextUrl.searchParams.get("nft");
  if (!nft) return NextResponse.json({ error: "nft is required" }, { status: 400 });
  try {
    const data = await loadFluidPositionFromChain(nft);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Fluid position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
