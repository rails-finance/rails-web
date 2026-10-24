import { NextRequest, NextResponse } from "next/server";
import { loadMorphoArbitrumWallet } from "@/lib/sources/chain/morpho-arbitrum-wallet";
import { publicErrorMessage } from "@/lib/api/public-error";

// Every Morpho Blue position one wallet holds on Arbitrum: every censused
// market asked at one pinned block, each held one read in full, and the loan
// tokens priced by the Aave V3 Arbitrum oracle at that block. The page's
// server half reads the same loader; this is the client's retry path.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!ADDRESS.test(wallet)) return NextResponse.json({ error: "wallet must be a 20-byte address" }, { status: 400 });
  try {
    return NextResponse.json(await loadMorphoArbitrumWallet(wallet));
  } catch (error) {
    console.error("Error reading Morpho Arbitrum wallet:", error);
    const message = publicErrorMessage(error, "Failed to load the wallet's positions");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
